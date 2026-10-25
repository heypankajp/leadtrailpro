import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit, diffRecords } from "@/features/audit/repository";
import { addActivity, getLead } from "@/features/leads/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { getUser } from "@/features/users/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import type { ChecklistItem, Task, TaskInput, TaskPatch, TaskPriority, TaskStatus } from "./model";

type Row = {
  id: number; leadId: number | null; leadName: string | null; title: string; description: string | null; assigneeId: number; assigneeName: string;
  creatorId: number; creatorName: string; dueAt: string | null; priority: string; status: string; checklist: string | ChecklistItem[];
  completedAt: string | null; commentCount: number; createdAt: string; updatedAt: string;
};

const select = `
  SELECT t.id, t.lead_id AS "leadId", l.client_name AS "leadName", t.title, t.description, t.assignee_id AS "assigneeId",
    CONCAT(a.first_name, ' ', a.last_name) AS "assigneeName", t.creator_id AS "creatorId", CONCAT(c.first_name, ' ', c.last_name) AS "creatorName",
    t.due_at AS "dueAt", t.priority, t.status, t.checklist, t.completed_at AS "completedAt", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
    (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.deleted_at IS NULL)::int AS "commentCount"
  FROM tasks t
  JOIN users a ON a.id = t.assignee_id
  JOIN users c ON c.id = t.creator_id
  LEFT JOIN leads l ON l.id = t.lead_id
`;

const toTask = (row: Row): Task => {
  let checklist: ChecklistItem[] = [];
  if (typeof row.checklist === "string") {
    try { checklist = JSON.parse(row.checklist) as ChecklistItem[]; } catch { checklist = []; }
  } else if (Array.isArray(row.checklist)) {
    checklist = row.checklist;
  }
  return {
    id: Number(row.id),
    leadId: row.leadId === null ? null : Number(row.leadId),
    leadName: row.leadName,
    title: row.title,
    description: row.description ?? "",
    assigneeId: Number(row.assigneeId),
    assigneeName: row.assigneeName,
    creatorId: Number(row.creatorId),
    creatorName: row.creatorName,
    dueAt: fromSqlDateTime(row.dueAt),
    priority: (["low", "normal", "medium", "high"].includes(row.priority) ? row.priority : "normal") as TaskPriority,
    status: (row.status === "done" ? "done" : "open") as TaskStatus,
    checklist: Array.isArray(checklist) ? checklist.filter((item) => item && typeof item.text === "string") : [],
    completedAt: fromSqlDateTime(row.completedAt),
    commentCount: Number(row.commentCount ?? 0),
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
    updatedAt: fromSqlDateTime(row.updatedAt) ?? row.updatedAt,
  };
};

export type TaskFilter = { assigneeId?: number; leadId?: number; status?: TaskStatus; dueFrom?: Date; dueTo?: Date; limit?: number };

export async function listTasks(filter: TaskFilter, db: Queryable = getDatabasePool()): Promise<Task[]> {
  const clauses: string[] = ["1 = 1"];
  const params: unknown[] = [];
  if (filter.assigneeId) { clauses.push("t.assignee_id = ?"); params.push(filter.assigneeId); }
  if (filter.leadId) { clauses.push("t.lead_id = ?"); params.push(filter.leadId); }
  if (filter.status) { clauses.push("t.status = ?"); params.push(filter.status); }
  if (filter.dueFrom) { clauses.push("t.due_at >= ?"); params.push(toSqlDateTime(filter.dueFrom)); }
  if (filter.dueTo) { clauses.push("t.due_at < ?"); params.push(toSqlDateTime(filter.dueTo)); }
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1000);
  const { rows } = await db.query(`${select} WHERE ${clauses.join(" AND ")} ORDER BY t.due_at ASC NULLS LAST, t.id DESC LIMIT ${limit}`, params);
  return (rows as Row[]).map(toTask);
}

export async function getTask(id: number, db: Queryable = getDatabasePool()): Promise<Task | null> {
  const { rows } = await db.query(`${select} WHERE t.id = ?`, [id]);
  const row = (rows as Row[])[0];
  return row ? toTask(row) : null;
}

export function canManageTask(user: UserAccount, task: Task) {
  return hasPrivilege(user, "manage_tasks") && (task.assigneeId === user.id || task.creatorId === user.id || hasPrivilege(user, "edit_any_lead"));
}

export async function createTask(input: TaskInput, actor: UserAccount): Promise<Task> {
  return withTransaction(async (connection) => {
    const assigneeId = input.assigneeId ?? actor.id;
    if (assigneeId !== actor.id) {
      const assignee = await getUser(assigneeId, connection);
      if (!assignee || !assignee.active) throw new HttpError(400, "The assignee must be an active user.");
    }
    if (input.leadId) {
      const lead = await getLead(input.leadId, connection);
      if (!lead) throw new HttpError(400, "The lead does not exist.");
    }
    const now = new Date();
    const result = await connection.query(
      `INSERT INTO tasks (lead_id, title, description, assignee_id, creator_id, due_at, priority, status, checklist, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?) RETURNING id`,
      [input.leadId, input.title, input.description || null, assigneeId, actor.id, input.dueAt ? toSqlDateTime(new Date(input.dueAt)) : null, input.priority, JSON.stringify(input.checklist), toSqlDateTime(now)],
    );
    const task = (await getTask(insertId(result), connection))!;
    if (task.leadId) {
      await addActivity(connection, { leadId: task.leadId, userId: actor.id, type: "task", summary: `Task created: ${task.title}${task.dueAt ? ` (due ${task.dueAt.slice(0, 10)})` : ""}`, meta: { taskId: task.id, assigneeId }, occurredAt: now });
    }
    await recordAudit(connection, { actorId: actor.id, action: "task.created", entityType: "task", entityId: task.id, after: auditView(task), details: `${actor.name} created task "${task.title}"` }, now);
    await notifyUsers(connection, { userIds: [task.assigneeId], actorId: actor.id, type: "task_assigned", title: `Task assigned: ${task.title}`, body: `${actor.name} assigned you this task${task.leadName ? ` on ${task.leadName}` : ""}${task.dueAt ? `, due ${task.dueAt.slice(0, 16).replace("T", " ")}` : ""}.`, leadId: task.leadId, taskId: task.id });
    return task;
  });
}

const auditView = (task: Task): Record<string, unknown> => ({
  title: task.title, description: task.description, leadId: task.leadId, assignee: task.assigneeName, dueAt: task.dueAt, priority: task.priority, status: task.status, checklist: task.checklist,
});

export async function updateTask(id: number, changes: TaskPatch, actor: UserAccount): Promise<Task> {
  return withTransaction(async (connection) => {
    const existing = await getTask(id, connection);
    if (!existing) throw new HttpError(404, "Task not found.");
    if (!canManageTask(actor, existing)) throw new HttpError(403, "You can only update tasks assigned to you or created by you.");
    if (changes.assigneeId !== undefined && changes.assigneeId !== existing.assigneeId) {
      if (changes.assigneeId === null) throw new HttpError(400, "Assignee is required.");
      const assignee = await getUser(changes.assigneeId, connection);
      if (!assignee || !assignee.active) throw new HttpError(400, "The assignee must be an active user.");
    }
    const assignments: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => { assignments.push(`${column} = ?`); params.push(value); };
    if (changes.title !== undefined) set("title", changes.title);
    if (changes.description !== undefined) set("description", changes.description || null);
    if (changes.leadId !== undefined) set("lead_id", changes.leadId);
    if (changes.assigneeId !== undefined) set("assignee_id", changes.assigneeId);
    if (changes.dueAt !== undefined) set("due_at", changes.dueAt ? toSqlDateTime(new Date(changes.dueAt)) : null);
    if (changes.priority !== undefined) set("priority", changes.priority);
    if (changes.checklist !== undefined) set("checklist", JSON.stringify(changes.checklist));
    const now = new Date();
    if (changes.status !== undefined && changes.status !== existing.status) {
      set("status", changes.status);
      set("completed_at", changes.status === "done" ? toSqlDateTime(now) : null);
    }
    if (!assignments.length) return existing;
    params.push(id);
    await connection.query(`UPDATE tasks SET ${assignments.join(", ")} WHERE id = ?`, params);
    const updated = (await getTask(id, connection))!;
    const diff = diffRecords(auditView(existing), auditView(updated));
    if (diff.changed.length) {
      if (updated.leadId && updated.status !== existing.status) {
        await addActivity(connection, { leadId: updated.leadId, userId: actor.id, type: "task", summary: updated.status === "done" ? `Task completed: ${updated.title}` : `Task reopened: ${updated.title}`, meta: { taskId: id }, occurredAt: now });
      }
      await recordAudit(connection, { actorId: actor.id, action: updated.status === "done" && existing.status !== "done" ? "task.completed" : "task.updated", entityType: "task", entityId: id, before: diff.before, after: diff.after, details: `${actor.name} updated ${diff.changed.join(", ")} on task "${updated.title}"` }, now);
      const completed = updated.status === "done" && existing.status !== "done";
      if (updated.assigneeId !== existing.assigneeId) {
        await notifyUsers(connection, { userIds: [updated.assigneeId], actorId: actor.id, type: "task_assigned", title: `Task assigned: ${updated.title}`, body: `${actor.name} assigned you this task${updated.leadName ? ` on ${updated.leadName}` : ""}.`, leadId: updated.leadId, taskId: id });
      } else {
        await notifyUsers(connection, { userIds: [updated.assigneeId], actorId: actor.id, type: completed ? "task_completed" : "task_updated", title: completed ? `Task completed: ${updated.title}` : `Task updated: ${updated.title}`, body: `${actor.name} changed ${diff.changed.join(", ")}.`, leadId: updated.leadId, taskId: id });
      }
      if (completed && updated.creatorId !== updated.assigneeId) {
        await notifyUsers(connection, { userIds: [updated.creatorId], actorId: actor.id, type: "task_completed", title: `Task completed: ${updated.title}`, body: `${actor.name} completed the task you created.`, leadId: updated.leadId, taskId: id });
      }
    }
    return updated;
  });
}
