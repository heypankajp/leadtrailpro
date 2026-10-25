import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { richTextToPlain } from "@/lib/richtext";
import { recordAudit } from "@/features/audit/repository";
import { excerptOf, mentionRecipients, parseMentions, type Mention, type MessageAttachment } from "@/features/messages/model";
import { listAttachmentRefs } from "@/features/messages/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import { listDirectory, listUsers } from "@/features/users/repository";
import type { Task, TaskComment, TaskCommentInput } from "./model";
import { getTask } from "./repository";

type Row = {
  id: number; taskId: number; authorId: number; authorName: string; authorRole: string; body: string; mentions: Mention[] | string | null;
  attachmentIds: number[] | string | null; editedAt: string | null; deletedAt: string | null; deletedByName: string | null; createdAt: string;
};

const select = `
  SELECT c.id, c.task_id AS "taskId", c.author_id AS "authorId", CONCAT(a.first_name, ' ', a.last_name) AS "authorName", a.role AS "authorRole",
    c.body, c.mentions, c.attachment_ids AS "attachmentIds", c.edited_at AS "editedAt", c.deleted_at AS "deletedAt",
    CONCAT(d.first_name, ' ', d.last_name) AS "deletedByName", c.created_at AS "createdAt"
  FROM task_comments c
  JOIN users a ON a.id = c.author_id
  LEFT JOIN users d ON d.id = c.deleted_by
`;

const parseJson = <T,>(value: T | string | null, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return value;
};

function toComment(row: Row, attachments: Map<number, MessageAttachment>): TaskComment {
  const deleted = row.deletedAt !== null;
  return {
    id: Number(row.id), taskId: Number(row.taskId), authorId: Number(row.authorId), authorName: row.authorName, authorRole: row.authorRole,
    body: deleted ? "" : row.body,
    mentions: deleted ? [] : parseJson<Mention[]>(row.mentions, []),
    attachments: deleted ? [] : parseJson<number[]>(row.attachmentIds, []).map((id) => attachments.get(Number(id))).filter((item): item is MessageAttachment => Boolean(item)),
    editedAt: fromSqlDateTime(row.editedAt), deletedAt: fromSqlDateTime(row.deletedAt), deletedByName: deleted ? row.deletedByName : null,
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  };
}

const attachmentsFor = (task: Task, db: Queryable) => (task.leadId ? listAttachmentRefs(task.leadId, db) : Promise.resolve(new Map<number, MessageAttachment>()));

export async function listTaskComments(task: Task, db: Queryable = getDatabasePool()): Promise<TaskComment[]> {
  const [{ rows }, attachments] = await Promise.all([db.query(`${select} WHERE c.task_id = ? ORDER BY c.id`, [task.id]), attachmentsFor(task, db)]);
  return (rows as Row[]).map((row) => toComment(row, attachments));
}

export async function getTaskComment(id: number, db: Queryable = getDatabasePool()): Promise<{ comment: TaskComment; task: Task } | null> {
  const { rows } = await db.query(`${select} WHERE c.id = ?`, [id]);
  const row = (rows as Row[])[0];
  if (!row) return null;
  const task = await getTask(Number(row.taskId), db);
  if (!task) return null;
  return { comment: toComment(row, await attachmentsFor(task, db)), task };
}

/** Mentioned people get a `mention`; the assignee, the creator, and earlier commenters get a `task_comment` (TASK-04). */
async function notifyAbout(db: Queryable, task: Task, comment: TaskComment, actor: UserAccount, previous: Mention[] | null) {
  const users = await listUsers({}, db);
  const alreadyMentioned = new Set(previous ? mentionRecipients(previous, users) : []);
  const mentioned = mentionRecipients(comment.mentions, users).filter((id) => !alreadyMentioned.has(id));
  const plain = excerptOf(richTextToPlain(comment.body), 240);
  if (mentioned.length) {
    await notifyUsers(db, { userIds: mentioned, actorId: actor.id, type: "mention", title: `${actor.name} mentioned you on task ${task.title}`, body: plain, leadId: task.leadId, taskId: task.id });
  }
  if (previous) return; // an edit reaches only newly mentioned people
  const { rows } = await db.query('SELECT DISTINCT author_id AS "authorId" FROM task_comments WHERE task_id = ? AND deleted_at IS NULL', [task.id]);
  const commenters = (rows as { authorId: number }[]).map((row) => Number(row.authorId));
  const others = [...new Set([task.assigneeId, task.creatorId, ...commenters])].filter((id) => !mentioned.includes(id));
  if (others.length) {
    await notifyUsers(db, { userIds: others, actorId: actor.id, type: "task_comment", title: `${actor.name} commented on ${task.title}`, body: plain, leadId: task.leadId, taskId: task.id });
  }
}

export async function addTaskComment(taskId: number, input: TaskCommentInput, actor: UserAccount): Promise<TaskComment> {
  return withTransaction(async (connection) => {
    const task = await getTask(taskId, connection);
    if (!task) throw new HttpError(404, "Task not found.");
    const files = await attachmentsFor(task, connection);
    const attachmentIds = input.attachmentIds.filter((id) => files.has(id));
    const mentions = parseMentions(input.body, await listDirectory(connection));
    const now = new Date();
    const result = await connection.query(
      "INSERT INTO task_comments (task_id, author_id, body, mentions, attachment_ids, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [taskId, actor.id, input.body, JSON.stringify(mentions), JSON.stringify(attachmentIds), toSqlDateTime(now)],
    );
    const comment = (await getTaskComment(insertId(result), connection))!.comment;
    await recordAudit(connection, { actorId: actor.id, action: "task.commented", entityType: "task", entityId: taskId, after: { commentId: comment.id, body: excerptOf(input.body, 500), mentions: mentions.map((mention) => (mention.kind === "user" ? mention.name : `@${mention.kind}`)), attachmentIds }, details: `${actor.name} commented on task "${task.title}"` }, now);
    await notifyAbout(connection, task, comment, actor, null);
    return comment;
  });
}

export async function editTaskComment(id: number, body: string, actor: UserAccount): Promise<TaskComment> {
  return withTransaction(async (connection) => {
    const found = await getTaskComment(id, connection);
    if (!found) throw new HttpError(404, "Comment not found.");
    if (found.comment.deletedAt) throw new HttpError(400, "A removed comment cannot be edited.");
    if (found.comment.authorId !== actor.id) throw new HttpError(403, "You can only edit your own comments.");
    const mentions = parseMentions(body, await listDirectory(connection));
    const now = new Date();
    await connection.query("UPDATE task_comments SET body = ?, mentions = ?, edited_at = ? WHERE id = ?", [body, JSON.stringify(mentions), toSqlDateTime(now), id]);
    const updated = (await getTaskComment(id, connection))!.comment;
    await recordAudit(connection, { actorId: actor.id, action: "task.comment_edited", entityType: "task", entityId: found.task.id, before: { commentId: id, body: excerptOf(found.comment.body, 500) }, after: { commentId: id, body: excerptOf(body, 500) }, details: `${actor.name} edited a comment on task "${found.task.title}"` }, now);
    await notifyAbout(connection, found.task, updated, actor, found.comment.mentions);
    return updated;
  });
}

/** Administrator soft delete: the text leaves the task but stays in the audit entry (COLL-04). */
export async function removeTaskComment(id: number, actor: UserAccount): Promise<TaskComment> {
  if (!hasPrivilege(actor, "moderate_messages")) throw new HttpError(403, "Only an administrator can remove comments.");
  return withTransaction(async (connection) => {
    const found = await getTaskComment(id, connection);
    if (!found) throw new HttpError(404, "Comment not found.");
    if (found.comment.deletedAt) return found.comment;
    const now = new Date();
    await connection.query("UPDATE task_comments SET deleted_at = ?, deleted_by = ? WHERE id = ?", [toSqlDateTime(now), actor.id, id]);
    await recordAudit(connection, { actorId: actor.id, action: "task.comment_removed", entityType: "task", entityId: found.task.id, before: { commentId: id, author: found.comment.authorName, body: found.comment.body }, after: { commentId: id, deleted: true }, details: `${actor.name} removed a comment by ${found.comment.authorName} on task "${found.task.title}"` }, now);
    return (await getTaskComment(id, connection))!.comment;
  });
}
