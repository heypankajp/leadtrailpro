import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { addActivity } from "@/features/leads/repository";
import type { UserAccount } from "@/features/users/model";
import { maxAttachmentBytes, resolveMimeType, sanitizeFileName, saveAttachmentFile } from "./storage";

import type { AttachmentCategory, LeadAttachment } from "./model";

type Row = {
  id: number; leadId: number; category: string; label: string; fileName: string; mimeType: string; sizeBytes: number; version: number;
  replacesId: number | null; uploadedById: number; uploadedByName: string; deletedAt: string | null; deletedByName: string | null; createdAt: string; storageKey: string;
};

const select = `
  SELECT f.id, f.lead_id AS "leadId", f.category, f.label, f.file_name AS "fileName", f.mime_type AS "mimeType", f.size_bytes AS "sizeBytes", f.version,
    f.replaces_id AS "replacesId", f.uploaded_by AS "uploadedById", CONCAT(u.first_name, ' ', u.last_name) AS "uploadedByName",
    f.deleted_at AS "deletedAt", CONCAT(d.first_name, ' ', d.last_name) AS "deletedByName", f.created_at AS "createdAt", f.storage_key AS "storageKey"
  FROM lead_attachments f
  JOIN users u ON u.id = f.uploaded_by
  LEFT JOIN users d ON d.id = f.deleted_by
`;

const toAttachment = (row: Row): LeadAttachment => ({
  id: Number(row.id),
  leadId: Number(row.leadId),
  category: row.category === "profile" ? "profile" : "document",
  label: row.label,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: Number(row.sizeBytes),
  version: Number(row.version),
  replacesId: row.replacesId === null ? null : Number(row.replacesId),
  uploadedById: Number(row.uploadedById),
  uploadedByName: row.uploadedByName,
  deletedAt: fromSqlDateTime(row.deletedAt),
  deletedByName: row.deletedAt ? row.deletedByName : null,
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
});

export async function listAttachments(leadId: number, options: { includeDeleted?: boolean } = {}, db: Queryable = getDatabasePool()): Promise<LeadAttachment[]> {
  const { rows } = await db.query(
    `${select} WHERE f.lead_id = ? ${options.includeDeleted ? "" : "AND f.deleted_at IS NULL"} ORDER BY f.category, f.label, f.file_name, f.version DESC, f.id DESC`,
    [leadId],
  );
  return (rows as Row[]).map(toAttachment);
}

export async function getAttachmentWithStorage(id: number, db: Queryable = getDatabasePool()): Promise<(LeadAttachment & { storageKey: string }) | null> {
  const { rows } = await db.query(`${select} WHERE f.id = ?`, [id]);
  const row = (rows as Row[])[0];
  return row ? { ...toAttachment(row), storageKey: row.storageKey } : null;
}

export type UploadInput = { leadId: number; category: AttachmentCategory; label: string; file: File };

export async function uploadAttachment(input: UploadInput, actor: UserAccount): Promise<LeadAttachment> {
  const fileName = sanitizeFileName(input.file.name);
  const mimeType = resolveMimeType(fileName);
  if (!mimeType) throw new HttpError(400, "Only PDF, Word, Excel, PowerPoint, image, and text files can be attached.");
  if (input.file.size === 0) throw new HttpError(400, "The file is empty.");
  if (input.file.size > maxAttachmentBytes) throw new HttpError(400, "Files must be 15 MB or smaller.");
  const label = input.label.trim().slice(0, 120) || (input.category === "profile" ? "Profile" : "Document");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const storageKey = await saveAttachmentFile(input.leadId, fileName, bytes);
  return withTransaction(async (connection) => {
    const { rows: previousRows } = await connection.query(
      `SELECT id, version FROM lead_attachments WHERE lead_id = ? AND category = ? AND label = ? AND LOWER(file_name) = LOWER(?) ORDER BY version DESC LIMIT 1`,
      [input.leadId, input.category, label, fileName],
    );
    const previous = (previousRows as { id: number; version: number }[])[0];
    const version = previous ? Number(previous.version) + 1 : 1;
    const now = new Date();
    const result = await connection.query(
      `INSERT INTO lead_attachments (lead_id, uploaded_by, category, label, file_name, mime_type, size_bytes, storage_key, version, replaces_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [input.leadId, actor.id, input.category, label, fileName, mimeType, input.file.size, storageKey, version, previous ? Number(previous.id) : null, toSqlDateTime(now)],
    );
    const id = insertId(result);
    await addActivity(connection, {
      leadId: input.leadId, userId: actor.id, type: "file",
      summary: `${input.category === "profile" ? "Profile shared" : "Document attached"}: ${label} — ${fileName}${version > 1 ? ` (v${version})` : ""}`,
      meta: { attachmentId: id, category: input.category, version }, occurredAt: now,
    });
    await recordAudit(connection, {
      actorId: actor.id, action: version > 1 ? "attachment.replaced" : "attachment.uploaded", entityType: "attachment", entityId: id,
      after: { leadId: input.leadId, category: input.category, label, fileName, sizeBytes: input.file.size, version }, details: `${actor.name} uploaded ${fileName} to lead ${input.leadId}`,
    }, now);
    const { storageKey: _storageKey, ...attachment } = (await getAttachmentWithStorage(id, connection))!;
    void _storageKey;
    return attachment;
  });
}

export async function softDeleteAttachment(id: number, actor: UserAccount): Promise<void> {
  await withTransaction(async (connection) => {
    const attachment = await getAttachmentWithStorage(id, connection);
    if (!attachment) throw new HttpError(404, "Attachment not found.");
    if (attachment.deletedAt) return;
    const now = new Date();
    await connection.query("UPDATE lead_attachments SET deleted_at = ?, deleted_by = ? WHERE id = ?", [toSqlDateTime(now), actor.id, id]);
    await addActivity(connection, { leadId: attachment.leadId, userId: actor.id, type: "file", summary: `File removed: ${attachment.fileName}`, meta: { attachmentId: id, deleted: true }, occurredAt: now });
    await recordAudit(connection, { actorId: actor.id, action: "attachment.deleted", entityType: "attachment", entityId: id, before: { fileName: attachment.fileName, label: attachment.label }, after: { deleted: true }, details: `${actor.name} removed ${attachment.fileName} from lead ${attachment.leadId}` }, now);
  });
}
