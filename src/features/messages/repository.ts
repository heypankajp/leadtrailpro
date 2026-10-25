import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { richTextToPlain } from "@/lib/richtext";
import { recordAudit } from "@/features/audit/repository";
import { getLead } from "@/features/leads/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import { listDirectory, listUsers } from "@/features/users/repository";
import { excerptOf, mentionRecipients, parseMentions, type LeadMessage, type Mention, type MessageAttachment, type MessageInput, type MessageThread } from "./model";

type Row = {
  id: number; leadId: number; parentId: number | null; authorId: number; authorName: string; authorRole: string; body: string; mentions: Mention[] | string | null;
  attachmentIds: number[] | string | null; quotedMessageId: number | null; quotedAuthorName: string | null; quotedBody: string | null; quotedDeletedAt: string | null;
  editedAt: string | null; deletedAt: string | null; deletedByName: string | null; createdAt: string;
};

const select = `
  SELECT m.id, m.lead_id AS "leadId", m.parent_id AS "parentId", m.author_id AS "authorId", CONCAT(a.first_name, ' ', a.last_name) AS "authorName", a.role AS "authorRole",
    m.body, m.mentions, m.attachment_ids AS "attachmentIds", m.quoted_message_id AS "quotedMessageId",
    CONCAT(qa.first_name, ' ', qa.last_name) AS "quotedAuthorName", q.body AS "quotedBody", q.deleted_at AS "quotedDeletedAt",
    m.edited_at AS "editedAt", m.deleted_at AS "deletedAt", CONCAT(d.first_name, ' ', d.last_name) AS "deletedByName", m.created_at AS "createdAt"
  FROM lead_messages m
  JOIN users a ON a.id = m.author_id
  LEFT JOIN lead_messages q ON q.id = m.quoted_message_id
  LEFT JOIN users qa ON qa.id = q.author_id
  LEFT JOIN users d ON d.id = m.deleted_by
`;

const parseJson = <T,>(value: T | string | null, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return value;
};

function toMessage(row: Row, attachments: Map<number, MessageAttachment>): LeadMessage {
  const deleted = row.deletedAt !== null;
  const ids = parseJson<number[]>(row.attachmentIds, []);
  return {
    id: Number(row.id), leadId: Number(row.leadId), parentId: row.parentId === null ? null : Number(row.parentId),
    authorId: Number(row.authorId), authorName: row.authorName, authorRole: row.authorRole,
    body: deleted ? "" : row.body,
    mentions: deleted ? [] : parseJson<Mention[]>(row.mentions, []),
    attachments: deleted ? [] : ids.map((id) => attachments.get(Number(id))).filter((item): item is MessageAttachment => Boolean(item)),
    quoted: row.quotedMessageId === null ? null : { id: Number(row.quotedMessageId), authorName: row.quotedAuthorName ?? "", excerpt: row.quotedDeletedAt ? "(message removed)" : excerptOf(richTextToPlain(row.quotedBody ?? "")) },
    editedAt: fromSqlDateTime(row.editedAt), deletedAt: fromSqlDateTime(row.deletedAt), deletedByName: deleted ? row.deletedByName : null,
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  };
}

/** The lead's live files by id, for references from messages and task comments (COLL-06). */
export async function listAttachmentRefs(leadId: number, db: Queryable = getDatabasePool()): Promise<Map<number, MessageAttachment>> {
  const { rows } = await db.query('SELECT id, file_name AS "fileName", label FROM lead_attachments WHERE lead_id = ? AND deleted_at IS NULL', [leadId]);
  return new Map((rows as MessageAttachment[]).map((row) => [Number(row.id), { id: Number(row.id), fileName: row.fileName, label: row.label }]));
}

export async function listThreads(leadId: number, db: Queryable = getDatabasePool()): Promise<MessageThread[]> {
  const { rows } = await db.query(`${select} WHERE m.lead_id = ? ORDER BY m.id`, [leadId]);
  const attachments = await listAttachmentRefs(leadId, db);
  const messages = (rows as Row[]).map((row) => toMessage(row, attachments));
  const threads = new Map<number, MessageThread>();
  for (const message of messages) if (message.parentId === null) threads.set(message.id, { root: message, replies: [] });
  for (const message of messages) if (message.parentId !== null) threads.get(message.parentId)?.replies.push(message);
  return [...threads.values()].sort((a, b) => b.root.id - a.root.id);
}

export async function countMessages(leadId: number, db: Queryable = getDatabasePool()): Promise<number> {
  const { rows } = await db.query("SELECT COUNT(*)::int AS count FROM lead_messages WHERE lead_id = ? AND deleted_at IS NULL", [leadId]);
  return Number((rows as { count: number }[])[0]?.count ?? 0);
}

export async function getMessage(id: number, db: Queryable = getDatabasePool()): Promise<LeadMessage | null> {
  const { rows } = await db.query(`${select} WHERE m.id = ?`, [id]);
  const row = (rows as Row[])[0];
  return row ? toMessage(row, await listAttachmentRefs(Number(row.leadId), db)) : null;
}

/** Notifies mentioned people (type `mention`), then the lead owner and the thread's other authors (type `message`). */
async function notifyAbout(db: Queryable, message: LeadMessage, lead: { ownerId: number; clientName: string }, actor: UserAccount, previous: Mention[] = []) {
  const users = await listUsers({}, db);
  const alreadyMentioned = new Set(mentionRecipients(previous, users));
  const mentioned = mentionRecipients(message.mentions, users).filter((id) => !alreadyMentioned.has(id));
  const plain = excerptOf(richTextToPlain(message.body), 240);
  if (mentioned.length) {
    await notifyUsers(db, { userIds: mentioned, actorId: actor.id, type: "mention", title: `${actor.name} mentioned you on ${lead.clientName}`, body: plain, leadId: message.leadId });
  }
  if (previous.length) return; // an edit only reaches newly mentioned people
  const { rows } = await db.query("SELECT DISTINCT author_id AS \"authorId\" FROM lead_messages WHERE lead_id = ? AND (id = ? OR parent_id = ?) AND deleted_at IS NULL", [message.leadId, message.parentId ?? message.id, message.parentId ?? message.id]);
  const participants = (rows as { authorId: number }[]).map((row) => Number(row.authorId));
  const others = [...new Set([lead.ownerId, ...participants])].filter((id) => !mentioned.includes(id));
  if (others.length) {
    await notifyUsers(db, { userIds: others, actorId: actor.id, type: "message", title: `${actor.name} ${message.parentId ? "replied" : "posted"} on ${lead.clientName}`, body: plain, leadId: message.leadId });
  }
}

export async function postMessage(leadId: number, input: MessageInput, actor: UserAccount): Promise<LeadMessage> {
  return withTransaction(async (connection) => {
    const lead = await getLead(leadId, connection);
    if (!lead) throw new HttpError(404, "Lead not found.");
    if (input.parentId !== null) {
      const parent = await getMessage(input.parentId, connection);
      if (!parent || parent.leadId !== leadId) throw new HttpError(400, "The thread does not belong to this lead.");
      if (parent.parentId !== null) input = { ...input, parentId: parent.parentId }; // replies stay one level deep
    }
    if (input.quotedMessageId !== null) {
      const quoted = await getMessage(input.quotedMessageId, connection);
      if (!quoted || quoted.leadId !== leadId) throw new HttpError(400, "The quoted message does not belong to this lead.");
    }
    const files = await listAttachmentRefs(leadId, connection);
    const attachmentIds = input.attachmentIds.filter((id) => files.has(id));
    const mentions = parseMentions(input.body, await listDirectory(connection));
    const now = new Date();
    const result = await connection.query(
      "INSERT INTO lead_messages (lead_id, parent_id, author_id, body, mentions, attachment_ids, quoted_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [leadId, input.parentId, actor.id, input.body, JSON.stringify(mentions), JSON.stringify(attachmentIds), input.quotedMessageId, toSqlDateTime(now)],
    );
    const message = (await getMessage(insertId(result), connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "message.posted", entityType: "message", entityId: message.id, after: { leadId, parentId: message.parentId, body: excerptOf(input.body, 500), mentions: mentions.map((mention) => (mention.kind === "user" ? mention.name : `@${mention.kind}`)), attachmentIds }, details: `${actor.name} ${message.parentId ? "replied" : "posted"} on ${lead.clientName}` }, now);
    await notifyAbout(connection, message, lead, actor);
    return message;
  });
}

export async function editMessage(id: number, body: string, actor: UserAccount): Promise<LeadMessage> {
  return withTransaction(async (connection) => {
    const existing = await getMessage(id, connection);
    if (!existing) throw new HttpError(404, "Message not found.");
    if (existing.deletedAt) throw new HttpError(400, "A removed message cannot be edited.");
    if (existing.authorId !== actor.id) throw new HttpError(403, "You can only edit your own messages.");
    const lead = (await getLead(existing.leadId, connection))!;
    const mentions = parseMentions(body, await listDirectory(connection));
    const now = new Date();
    await connection.query("UPDATE lead_messages SET body = ?, mentions = ?, edited_at = ? WHERE id = ?", [body, JSON.stringify(mentions), toSqlDateTime(now), id]);
    const updated = (await getMessage(id, connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "message.edited", entityType: "message", entityId: id, before: { body: excerptOf(existing.body, 500) }, after: { body: excerptOf(body, 500) }, details: `${actor.name} edited a message on ${lead.clientName}` }, now);
    await notifyAbout(connection, updated, lead, actor, existing.mentions);
    return updated;
  });
}

/** Admin soft delete (COLL-04): the body disappears from the thread but stays in the audit entry. */
export async function removeMessage(id: number, actor: UserAccount): Promise<LeadMessage> {
  if (!hasPrivilege(actor, "moderate_messages")) throw new HttpError(403, "Only an administrator can remove messages.");
  return withTransaction(async (connection) => {
    const existing = await getMessage(id, connection);
    if (!existing) throw new HttpError(404, "Message not found.");
    if (existing.deletedAt) return existing;
    const lead = (await getLead(existing.leadId, connection))!;
    const now = new Date();
    await connection.query("UPDATE lead_messages SET deleted_at = ?, deleted_by = ? WHERE id = ?", [toSqlDateTime(now), actor.id, id]);
    await recordAudit(connection, { actorId: actor.id, action: "message.deleted", entityType: "message", entityId: id, before: { author: existing.authorName, body: existing.body }, after: { deleted: true }, details: `${actor.name} removed a message by ${existing.authorName} on ${lead.clientName}` }, now);
    return (await getMessage(id, connection))!;
  });
}
