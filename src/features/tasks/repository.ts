import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit, diffRecords } from "@/features/audit/repository";
import { addActivity, getLead } from "@/features/leads/repository";
import { assertListValue } from "@/features/list-values/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { getUser } from "@/features/users/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import { isTaskActivityType, type ChecklistItem, type Task, type TaskInput, type TaskPatch, type TaskPriority, type TaskStatus } from "./model";

type Row = {
  id: number; leadId: number | null; leadName: string | null; title: string; description: string | null; assigneeId: number; assigneeName: string;
  creatorId: number; creatorName: string; dueAt: string | null; endsAt: string | null; activityType: string; priority: string; status: string; checklist: string | ChecklistItem[];
  completedAt: string | null; commentCount: number; createdAt: string; updatedAt: string;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null; organization: string | null;
  outcomeId: number | null; outcome: string | null; note: string | null; attachmentCount: number;
  organizationId: number | null; personId: number | null; people: string | { id: number; name: string }[] | null;
  assignees: string | { id: number; name: string }[] | null;
};

const select = `
  SELECT t.id, t.lead_id AS "leadId", l.client_name AS "leadName", t.title, t.description, t.assignee_id AS "assigneeId",
    CONCAT(a.first_name, ' ', a.last_name) AS "assigneeName", t.creator_id AS "creatorId", CONCAT(c.first_name, ' ', c.last_name) AS "creatorName",
    t.due_at AS "dueAt", t.ends_at AS "endsAt", t.activity_type AS "activityType", t.priority, t.status, t.checklist, t.completed_at AS "completedAt", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
    (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.deleted_at IS NULL)::int AS "commentCount",
    COALESCE(tp.name, NULLIF(l.client_executive, '')) AS "contactName", COALESCE(tp.emails->>0, l.client_emails->>0) AS "contactEmail",
    COALESCE(NULLIF(tp.phone, ''), NULLIF(l.contact_phone, '')) AS "contactPhone",
    COALESCE(tor.name, og.name, l.client_name) AS organization, t.organization_id AS "organizationId", t.person_id AS "personId",
    (SELECT COALESCE(json_agg(json_build_object('id', pp.id, 'name', pp.name) ORDER BY tps.position, pp.name), '[]'::json)
       FROM task_persons tps JOIN persons pp ON pp.id = tps.person_id WHERE tps.task_id = t.id) AS people,
    (SELECT COALESCE(json_agg(json_build_object('id', au.id, 'name', CONCAT(au.first_name, ' ', au.last_name)) ORDER BY tas.position), '[]'::json)
       FROM task_assignees tas JOIN users au ON au.id = tas.user_id WHERE tas.task_id = t.id) AS assignees, t.outcome_id AS "outcomeId", ov.value AS outcome,
    t.note, (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id)::int AS "attachmentCount"
  FROM tasks t
  JOIN users a ON a.id = t.assignee_id
  JOIN users c ON c.id = t.creator_id
  LEFT JOIN leads l ON l.id = t.lead_id
  LEFT JOIN organizations og ON og.id = l.organization_id
  LEFT JOIN list_values ov ON ov.id = t.outcome_id
  LEFT JOIN organizations tor ON tor.id = t.organization_id
  LEFT JOIN persons tp ON tp.id = t.person_id
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
    endsAt: fromSqlDateTime(row.endsAt),
    activityType: isTaskActivityType(row.activityType) ? row.activityType : "task",
    priority: (["low", "normal", "medium", "high"].includes(row.priority) ? row.priority : "normal") as TaskPriority,
    status: (row.status === "done" ? "done" : "open") as TaskStatus,
    checklist: Array.isArray(checklist) ? checklist.filter((item) => item && typeof item.text === "string") : [],
    completedAt: fromSqlDateTime(row.completedAt),
    commentCount: Number(row.commentCount ?? 0),
    contactName: row.contactName ?? null,
    contactEmail: row.contactEmail ?? null,
    contactPhone: row.contactPhone ?? null,
    organization: row.organization ?? null,
    outcomeId: row.outcomeId === null || row.outcomeId === undefined ? null : Number(row.outcomeId),
    outcome: row.outcome ?? null,
    note: row.note ?? "",
    organizationId: row.organizationId === null || row.organizationId === undefined ? null : Number(row.organizationId),
    personId: row.personId === null || row.personId === undefined ? null : Number(row.personId),
    people: (typeof row.people === "string" ? JSON.parse(row.people) : row.people ?? []).map((item: { id: number; name: string }) => ({ id: Number(item.id), name: item.name })),
    // Everyone assigned; an activity saved before the list existed has its one assignee.
    assignees: (() => {
      const list = (typeof row.assignees === "string" ? JSON.parse(row.assignees) : row.assignees ?? []) as { id: number; name: string }[];
      return list.length ? list.map((item) => ({ id: Number(item.id), name: item.name })) : [{ id: Number(row.assigneeId), name: row.assigneeName }];
    })(),
    attachmentCount: Number(row.attachmentCount ?? 0),
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
    updatedAt: fromSqlDateTime(row.updatedAt) ?? row.updatedAt,
  };
};

export type TaskFilter = { assigneeId?: number; leadId?: number; status?: TaskStatus; dueFrom?: Date; dueTo?: Date; limit?: number };

export async function listTasks(filter: TaskFilter, db: Queryable = getDatabasePool()): Promise<Task[]> {
  // Tasks of a deleted deal are out of every list until it is restored (request of November 20, 2026).
  const clauses: string[] = ["(l.id IS NULL OR l.record_state <> 'deleted')"];
  const params: unknown[] = [];
  // A person's activities include those they are one of several assignees of.
  if (filter.assigneeId) { clauses.push("(t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees tas WHERE tas.task_id = t.id AND tas.user_id = ?))"); params.push(filter.assigneeId, filter.assigneeId); }
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

/**
 * The organization and person of an activity must exist, and the person must be a contact of the organization. With
 * only a person, the person's organization is used.
 */
/** Every person must be a contact of the organization (taken from the first person when none is given). */
async function checkedPeople(db: Queryable, organizationId: number | null, personIds: number[]): Promise<{ organizationId: number | null; personIds: number[] }> {
  let org = organizationId;
  for (const id of personIds) {
    const checked = await checkedLinks(db, org, id);
    org = checked.organizationId;
  }
  if (!personIds.length && org !== null) await checkedLinks(db, org, null);
  return { organizationId: org, personIds };
}

/** Writes an activity's people, in order; the first is also `tasks.person_id`. */
async function savePeople(db: Queryable, taskId: number, personIds: number[]): Promise<void> {
  await db.query("DELETE FROM task_persons WHERE task_id = ?", [taskId]);
  for (const [position, personId] of personIds.entries()) {
    await db.query("INSERT INTO task_persons (task_id, person_id, position) VALUES (?, ?, ?)", [taskId, personId, position]);
  }
}

async function checkedLinks(db: Queryable, organizationId: number | null, personId: number | null): Promise<{ organizationId: number | null; personId: number | null }> {
  if (organizationId !== null) {
    const { rows } = await db.query("SELECT 1 FROM organizations WHERE id = ?", [organizationId]);
    if (!rows.length) throw new HttpError(400, "The company does not exist.");
  }
  if (personId === null) return { organizationId, personId };
  const { rows } = await db.query(`SELECT organization_id AS "organizationId" FROM persons WHERE id = ?`, [personId]);
  const person = (rows as { organizationId: number | null }[])[0];
  if (!person) throw new HttpError(400, "The contact does not exist.");
  const own = person.organizationId === null ? null : Number(person.organizationId);
  if (organizationId !== null && own !== organizationId) throw new HttpError(400, "The contact is not a contact of that company.");
  return { organizationId: organizationId ?? own, personId };
}

export function canManageTask(user: UserAccount, task: Task) {
  return hasPrivilege(user, "manage_tasks") && (task.assigneeId === user.id || (task.assignees ?? []).some((item) => item.id === user.id) || task.creatorId === user.id || hasPrivilege(user, "edit_any_lead"));
}

/** The team members of an activity must be active users; the first one is `tasks.assignee_id`. */
async function checkedAssignees(db: Queryable, ids: number[], actor: UserAccount): Promise<number[]> {
  for (const id of ids) {
    if (id === actor.id) continue;
    const assignee = await getUser(id, db);
    if (!assignee || !assignee.active) throw new HttpError(400, "Every assignee must be an active user.");
  }
  return ids;
}

async function saveAssignees(db: Queryable, taskId: number, ids: number[]): Promise<void> {
  await db.query("DELETE FROM task_assignees WHERE task_id = ?", [taskId]);
  for (const [position, userId] of ids.entries()) {
    await db.query("INSERT INTO task_assignees (task_id, user_id, position) VALUES (?, ?, ?)", [taskId, userId, position]);
  }
}

export async function createTask(input: TaskInput, actor: UserAccount): Promise<Task> {
  return withTransaction(async (connection) => {
    const assigneeIds = await checkedAssignees(connection, input.assigneeIds?.length ? input.assigneeIds : [input.assigneeId ?? actor.id], actor);
    const assigneeId = assigneeIds[0];
    // An activity on a deal with no organization or person of its own takes the deal's.
    let dealLinks: { organizationId: number | null; personId: number | null } = { organizationId: null, personId: null };
    if (input.leadId) {
      const lead = await getLead(input.leadId, connection);
      if (!lead) throw new HttpError(400, "The deal does not exist.");
      dealLinks = { organizationId: lead.organizationId ?? null, personId: lead.personId ?? null };
    }
    const now = new Date();
    // PD-29: "Mark as done" records an activity that already happened, with its outcome when one was picked.
    const done = input.done === true;
    const outcomeId = done ? input.outcomeId ?? null : null;
    const own = input.organizationId || input.personId || input.personIds?.length;
    const askedPeople = input.personIds ?? (input.personId ? [input.personId] : []);
    const checked = await checkedPeople(connection, own ? input.organizationId ?? null : dealLinks.organizationId, own ? askedPeople : dealLinks.personId ? [dealLinks.personId] : []);
    const links = { organizationId: checked.organizationId, personId: checked.personIds[0] ?? null };
    if (outcomeId !== null) await assertListValue(connection, "activity_outcome", outcomeId, { label: "Outcome" });
    const result = await connection.query(
      `INSERT INTO tasks (lead_id, title, description, assignee_id, creator_id, due_at, ends_at, activity_type, priority, status, completed_at, checklist, created_at, outcome_id, note, organization_id, person_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [input.leadId, input.title, input.description || null, assigneeId, actor.id, input.dueAt ? toSqlDateTime(new Date(input.dueAt)) : null, input.endsAt ? toSqlDateTime(new Date(input.endsAt)) : null,
        input.activityType ?? "task", input.priority, done ? "done" : "open", done ? toSqlDateTime(now) : null, JSON.stringify(input.checklist), toSqlDateTime(now), outcomeId, input.note || null, links.organizationId, links.personId],
    );
    await savePeople(connection, insertId(result), checked.personIds);
    await saveAssignees(connection, insertId(result), assigneeIds);
    const task = (await getTask(insertId(result), connection))!;
    if (task.leadId) {
      await addActivity(connection, { leadId: task.leadId, userId: actor.id, type: "task", summary: done ? `Done: ${task.title}${task.outcome ? ` — ${task.outcome}` : ""}` : `Task created: ${task.title}${task.dueAt ? ` (due ${task.dueAt.slice(0, 10)})` : ""}`, meta: { taskId: task.id, assigneeId, activityType: task.activityType, done }, occurredAt: now });
    }
    await recordAudit(connection, { actorId: actor.id, action: "task.created", entityType: "task", entityId: task.id, after: auditView(task), details: `${actor.name} created task "${task.title}"` }, now);
    await notifyUsers(connection, { userIds: assigneeIds, actorId: actor.id, type: "task_assigned", title: `Task assigned: ${task.title}`, body: `${actor.name} assigned you this task${task.leadName ? ` on ${task.leadName}` : ""}${task.dueAt ? `, due ${task.dueAt.slice(0, 16).replace("T", " ")}` : ""}.`, leadId: task.leadId, taskId: task.id });
    return task;
  });
}

const auditView = (task: Task): Record<string, unknown> => ({
  title: task.title, description: task.description, leadId: task.leadId, assignee: task.assigneeName, dueAt: task.dueAt, priority: task.priority, status: task.status, checklist: task.checklist,
  outcome: task.outcome ?? null,
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
    // Several team members: the first becomes the assignee; the ones added are told.
    const beforeAssignees = (existing.assignees ?? []).map((item) => item.id);
    let addedAssignees: number[] = [];
    if (changes.assigneeIds !== undefined) {
      const ids = await checkedAssignees(connection, changes.assigneeIds, actor);
      await saveAssignees(connection, id, ids);
      changes.assigneeId = ids[0];
      addedAssignees = ids.filter((userId) => !beforeAssignees.includes(userId));
    } else if (changes.assigneeId !== undefined && changes.assigneeId !== null) {
      await saveAssignees(connection, id, [changes.assigneeId]);
    }
    const assignments: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => { assignments.push(`${column} = ?`); params.push(value); };
    if (changes.title !== undefined) set("title", changes.title);
    if (changes.description !== undefined) set("description", changes.description || null);
    if (changes.leadId !== undefined) set("lead_id", changes.leadId);
    if (changes.assigneeId !== undefined) set("assignee_id", changes.assigneeId);
    if (changes.dueAt !== undefined) set("due_at", changes.dueAt ? toSqlDateTime(new Date(changes.dueAt)) : null);
    if (changes.endsAt !== undefined) set("ends_at", changes.endsAt ? toSqlDateTime(new Date(changes.endsAt)) : null);
    if (changes.activityType !== undefined) set("activity_type", changes.activityType);
    if (changes.priority !== undefined) set("priority", changes.priority);
    if (changes.checklist !== undefined) set("checklist", JSON.stringify(changes.checklist));
    if (changes.note !== undefined) set("note", changes.note || null);
    if (changes.organizationId !== undefined || changes.personId !== undefined || changes.personIds !== undefined) {
      const people = changes.personIds ?? (changes.personId !== undefined ? (changes.personId ? [changes.personId] : []) : (existing.people ?? []).map((item) => item.id));
      const checked = await checkedPeople(connection, changes.organizationId !== undefined ? changes.organizationId : existing.organizationId ?? null, people);
      set("organization_id", checked.organizationId);
      set("person_id", checked.personIds[0] ?? null);
      await savePeople(connection, id, checked.personIds);
    }
    if (changes.outcomeId !== undefined) {
      if (changes.outcomeId !== null) await assertListValue(connection, "activity_outcome", changes.outcomeId, { label: "Outcome", allowInactive: changes.outcomeId === existing.outcomeId });
      set("outcome_id", changes.outcomeId);
    }
    const now = new Date();
    if (changes.status !== undefined && changes.status !== existing.status) {
      set("status", changes.status);
      set("completed_at", changes.status === "done" ? toSqlDateTime(now) : null);
      // Reopening an activity clears what came of it.
      if (changes.status === "open" && changes.outcomeId === undefined) set("outcome_id", null);
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
      if (addedAssignees.length) {
        await notifyUsers(connection, { userIds: addedAssignees, actorId: actor.id, type: "task_assigned", title: `Task assigned: ${updated.title}`, body: `${actor.name} added you to this activity${updated.leadName ? ` on ${updated.leadName}` : ""}.`, leadId: updated.leadId });
      }
      if (updated.assigneeId !== existing.assigneeId && !addedAssignees.includes(updated.assigneeId)) {
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
