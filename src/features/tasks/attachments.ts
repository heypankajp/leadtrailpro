import { fromSqlDateTime, getDatabasePool, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { maxAttachmentBytes, removeAttachmentFile, resolveMimeType, sanitizeFileName, saveTaskAttachmentFile } from "@/features/attachments/storage";
import type { UserAccount } from "@/features/users/model";
import type { TaskAttachment } from "./model";
import { canManageTask, getTask } from "./repository";

// Files uploaded on an activity (Schedule an activity, request of November 18, 2026): the same file types and size limit
// as a deal's documents, kept with the activity and deleted with it.

const select = `
  SELECT ta.id, ta.task_id AS "taskId", ta.file_name AS "fileName", ta.mime_type AS "mimeType", ta.size_bytes AS "sizeBytes",
    NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS "uploadedByName", ta.created_at AS "createdAt", ta.storage_key AS "storageKey"
  FROM task_attachments ta LEFT JOIN users u ON u.id = ta.uploaded_by`;
type Row = TaskAttachment & { storageKey: string };
const toAttachment = ({ storageKey: _storageKey, ...row }: Row): TaskAttachment => {
  void _storageKey;
  return { ...row, id: Number(row.id), taskId: Number(row.taskId), sizeBytes: Number(row.sizeBytes), createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt };
};

export async function listTaskAttachments(taskId: number, db: Queryable = getDatabasePool()): Promise<TaskAttachment[]> {
  const { rows } = await db.query(`${select} WHERE ta.task_id = ? ORDER BY ta.created_at, ta.id`, [taskId]);
  return (rows as Row[]).map(toAttachment);
}

export async function getTaskAttachment(id: number, db: Queryable = getDatabasePool()): Promise<Row | null> {
  const { rows } = await db.query(`${select} WHERE ta.id = ?`, [id]);
  return (rows as Row[])[0] ?? null;
}

async function manageableTask(taskId: number, actor: UserAccount) {
  const task = await getTask(taskId);
  if (!task) throw new HttpError(404, "Activity not found.");
  if (!canManageTask(actor, task)) throw new HttpError(403, "You can only change activities assigned to you or created by you.");
  return task;
}

export async function uploadTaskAttachment(taskId: number, file: File, actor: UserAccount): Promise<TaskAttachment> {
  const task = await manageableTask(taskId, actor);
  const fileName = sanitizeFileName(file.name);
  const mimeType = resolveMimeType(fileName);
  if (!mimeType) throw new HttpError(400, "Only PDF, Word, Excel, PowerPoint, image, and text files can be attached.");
  if (file.size === 0) throw new HttpError(400, "The file is empty.");
  if (file.size > maxAttachmentBytes) throw new HttpError(400, "Files must be 15 MB or smaller.");
  const storageKey = await saveTaskAttachmentFile(taskId, fileName, new Uint8Array(await file.arrayBuffer()));
  return withTransaction(async (db) => {
    const now = new Date();
    const result = await db.query(
      "INSERT INTO task_attachments (task_id, uploaded_by, file_name, mime_type, size_bytes, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [taskId, actor.id, fileName, mimeType, file.size, storageKey, toSqlDateTime(now)],
    );
    const id = insertId(result);
    await recordAudit(db, {
      actorId: actor.id, action: "task.file_uploaded", entityType: "task", entityId: taskId,
      after: { fileName, sizeBytes: file.size }, details: `${actor.name} attached ${fileName} to the activity "${task.title}"`,
    }, now);
    return toAttachment((await getTaskAttachment(id, db))!);
  });
}

export async function removeTaskAttachment(id: number, actor: UserAccount): Promise<void> {
  const attachment = await getTaskAttachment(id);
  if (!attachment) throw new HttpError(404, "File not found.");
  const task = await manageableTask(attachment.taskId, actor);
  await withTransaction(async (db) => {
    await db.query("DELETE FROM task_attachments WHERE id = ?", [id]);
    await recordAudit(db, {
      actorId: actor.id, action: "task.file_removed", entityType: "task", entityId: task.id,
      before: { fileName: attachment.fileName }, details: `${actor.name} removed ${attachment.fileName} from the activity "${task.title}"`,
    });
  });
  await removeAttachmentFile(attachment.storageKey);
}
