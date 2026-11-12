import { summarizeTodoCounts, todoMoveSummary, type TodoCounts } from "./todo-model";
import { getDatabasePool, affectedRows, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { addDaysYmd, todayYmd } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { recordAudit, diffRecords } from "@/features/audit/repository";
import { reasonListFor, statusLabel } from "@/features/list-values/model";
import { resolveStageForAction, stageAdvances, type StageValue } from "@/features/pipeline/model";
import { assertListValue, getListValue } from "@/features/list-values/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { getUser, listUsersWithPrivilege } from "@/features/users/repository";
import { hasPrivilege } from "@/features/users/model";
import { claimOpportunityForLead, opportunityHasDraft } from "@/features/opportunities/claim";
import { matchLead, normalizeCompanyName, type MatchableLead, type MatchedOn } from "@/features/trips/matching";
import type { UserAccount } from "@/features/users/model";
import { activityTypes } from "./model";
import type { ActivityType, LeadActivity, LeadFilters, LeadInput, LeadPage, LeadRecordState, LeadSummary, LoggableActivityType } from "./model";

// ---- Row mapping ----

type LeadRow = Omit<LeadSummary, "clientEmails" | "lastActivityAt" | "lastClientEmailAt" | "lastTeamEmailAt" | "createdAt" | "updatedAt" | "statusLabel"> & {
  clientEmails: string | string[];
  lastActivityAt: string;
  lastClientEmailAt: string | null;
  lastTeamEmailAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const leadSelect = `
  SELECT l.id, l.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName",
    l.created_by AS "createdById", CONCAT(c.first_name, ' ', c.last_name) AS "createdByName",
    l.lead_type_id AS "leadTypeId", lt.value AS "leadType",
    l.status_id AS "statusId", st.value AS status, st.code AS "statusCode",
    l.status_reason_id AS "statusReasonId", sr.value AS "statusReason",
    l.bd_action_id AS "bdActionId", ba.value AS "bdAction",
    l.stage_id AS "stageId", sg.value AS stage, sg.code AS "stageCode",
    l.todo_list_id AS "todoListId", td.value AS "todoList", l.todo_since AS "todoSince",
    l.client_response_id AS "clientResponseId", cr.value AS "clientResponse",
    l.lead_category_id AS "leadCategoryId", lc.value AS "leadCategory",
    l.company_size_id AS "companySizeId", cs.value AS "companySize",
    l.city_id AS "cityId", ci.value AS city,
    l.client_name AS "clientName", l.company_url AS "companyUrl", l.address, COALESCE(l.comments, '') AS comments,
    l.client_executive AS "clientExecutive", l.contact_phone AS "contactPhone", l.contact_alt_phone AS "contactAltPhone",
    l.contact_remark AS "contactRemark", l.client_emails AS "clientEmails", l.industry, COALESCE(l.positions, '') AS positions,
    l.first_contact_date AS "firstContactDate", l.follow_up_date AS "followUpDate", l.contract_signed_date AS "contractSignedDate",
    l.record_state AS "recordState", l.state_reason AS "stateReason", l.last_activity_at AS "lastActivityAt",
    l.last_client_email_at AS "lastClientEmailAt", l.last_team_email_at AS "lastTeamEmailAt",
    l.created_at AS "createdAt", l.updated_at AS "updatedAt"
  FROM leads l
  JOIN users o ON o.id = l.owner_id
  JOIN users c ON c.id = l.created_by
  JOIN list_values lt ON lt.id = l.lead_type_id
  JOIN list_values st ON st.id = l.status_id
  LEFT JOIN list_values sr ON sr.id = l.status_reason_id
  LEFT JOIN list_values ba ON ba.id = l.bd_action_id
  LEFT JOIN list_values cr ON cr.id = l.client_response_id
  LEFT JOIN list_values lc ON lc.id = l.lead_category_id
  LEFT JOIN list_values cs ON cs.id = l.company_size_id
  LEFT JOIN list_values ci ON ci.id = l.city_id
  LEFT JOIN list_values sg ON sg.id = l.stage_id
  LEFT JOIN list_values td ON td.id = l.todo_list_id
`;

const parseEmails = (value: string | string[]): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export function toLead(row: LeadRow): LeadSummary {
  return {
    ...row,
    id: Number(row.id),
    ownerId: Number(row.ownerId),
    createdById: Number(row.createdById),
    leadTypeId: Number(row.leadTypeId),
    statusId: Number(row.statusId),
    statusReasonId: row.statusReasonId === null ? null : Number(row.statusReasonId),
    statusLabel: statusLabel(row.status, row.statusReason),
    bdActionId: row.bdActionId === null ? null : Number(row.bdActionId),
    stageId: row.stageId === null ? null : Number(row.stageId),
    todoListId: row.todoListId === null ? null : Number(row.todoListId),
    todoSince: fromSqlDateTime(row.todoSince),
    clientResponseId: row.clientResponseId === null ? null : Number(row.clientResponseId),
    leadCategoryId: row.leadCategoryId === null ? null : Number(row.leadCategoryId),
    companySizeId: row.companySizeId === null ? null : Number(row.companySizeId),
    cityId: row.cityId === null ? null : Number(row.cityId),
    clientEmails: parseEmails(row.clientEmails),
    lastActivityAt: fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt,
    lastClientEmailAt: fromSqlDateTime(row.lastClientEmailAt),
    lastTeamEmailAt: fromSqlDateTime(row.lastTeamEmailAt),
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
    updatedAt: fromSqlDateTime(row.updatedAt) ?? row.updatedAt,
  };
}

/** Readable snapshot for audit entries (display values rather than ids). */
export function leadAuditView(lead: LeadSummary): Record<string, unknown> {
  return {
    clientName: lead.clientName, companyUrl: lead.companyUrl, address: lead.address, comments: lead.comments,
    clientExecutive: lead.clientExecutive, contactPhone: lead.contactPhone, contactAltPhone: lead.contactAltPhone,
    contactRemark: lead.contactRemark, clientEmails: lead.clientEmails, industry: lead.industry, positions: lead.positions,
    leadType: lead.leadType, status: lead.status, statusReason: lead.statusReason, bdAction: lead.bdAction, stage: lead.stage, clientResponse: lead.clientResponse,
    leadCategory: lead.leadCategory, companySize: lead.companySize, city: lead.city,
    firstContactDate: lead.firstContactDate, followUpDate: lead.followUpDate, contractSignedDate: lead.contractSignedDate,
    owner: lead.ownerName, recordState: lead.recordState, stateReason: lead.stateReason,
  };
}

// ---- Access rules ----

export function canEditLead(user: UserAccount, lead: LeadSummary) {
  return hasPrivilege(user, "edit_any_lead") || (hasPrivilege(user, "edit_leads") && lead.ownerId === user.id);
}

export function canTransferLead(user: UserAccount, lead: LeadSummary) {
  return hasPrivilege(user, "reassign_leads") || (hasPrivilege(user, "transfer_leads") && lead.ownerId === user.id);
}

// ---- Queries ----

export async function selectLeads(where: string, params: unknown[], orderBy: string, limit: number, db: Queryable = getDatabasePool()): Promise<LeadSummary[]> {
  const { rows } = await db.query(`${leadSelect} WHERE ${where} ORDER BY ${orderBy} LIMIT ${Math.max(1, Math.min(limit, 500))}`, params);
  return (rows as LeadRow[]).map(toLead);
}

export async function getLead(id: number, db: Queryable = getDatabasePool()): Promise<LeadSummary | null> {
  const { rows } = await db.query(`${leadSelect} WHERE l.id = ? LIMIT 1`, [id]);
  const row = (rows as LeadRow[])[0];
  return row ? toLead(row) : null;
}

const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const sortColumns: Record<LeadFilters["sort"], string> = {
  last_activity: "l.last_activity_at",
  first_contact: "l.first_contact_date",
  follow_up: "l.follow_up_date",
  client_name: "l.client_name",
  owner: '"ownerName"',
  created: "l.created_at",
  client_reply: "l.last_client_email_at",
  todo_since: "l.todo_since",
};

export async function listLeads(filters: LeadFilters, viewer: UserAccount): Promise<LeadPage> {
  const clauses: string[] = ["l.record_state = ?"];
  const params: unknown[] = [filters.state];
  if (filters.mine) { clauses.push("l.owner_id = ?"); params.push(viewer.id); }
  if (filters.ownerId) { clauses.push("l.owner_id = ?"); params.push(filters.ownerId); }
  if (filters.statusCode) { clauses.push("st.code = ?"); params.push(filters.statusCode); }
  if (filters.todo) clauses.push("l.todo_list_id IS NOT NULL");
  const idFilters: [number | null, string][] = [
    [filters.statusId, "l.status_id"], [filters.statusReasonId, "l.status_reason_id"], [filters.leadTypeId, "l.lead_type_id"], [filters.leadCategoryId, "l.lead_category_id"],
    [filters.companySizeId, "l.company_size_id"], [filters.cityId, "l.city_id"], [filters.clientResponseId, "l.client_response_id"],
    [filters.bdActionId, "l.bd_action_id"], [filters.stageId, "l.stage_id"], [filters.todoListId, "l.todo_list_id"],
  ];
  for (const [value, column] of idFilters) {
    if (value) { clauses.push(`${column} = ?`); params.push(value); }
  }
  const dateFilters: [string | null, string, string][] = [
    [filters.firstContactFrom, "l.first_contact_date", ">="], [filters.firstContactTo, "l.first_contact_date", "<="],
    [filters.followUpFrom, "l.follow_up_date", ">="], [filters.followUpTo, "l.follow_up_date", "<="],
    [filters.contractSignedFrom, "l.contract_signed_date", ">="], [filters.contractSignedTo, "l.contract_signed_date", "<="],
  ];
  for (const [value, column, operator] of dateFilters) {
    if (value) { clauses.push(`${column} ${operator} ?`); params.push(value); }
  }
  if (filters.q) {
    const pattern = likePattern(filters.q.toLowerCase());
    const fields = [
      "l.client_name", "l.client_executive", "l.address", "l.comments", "l.industry", "l.positions", "l.contact_phone",
      "l.contact_alt_phone", "l.contact_remark", "l.client_emails::text", "st.value", "sr.value", "ci.value", "ba.value", "cr.value",
      "lt.value", "CONCAT(o.first_name, ' ', o.last_name)",
    ];
    clauses.push(`(${fields.map((field) => `LOWER(${field}) LIKE ?`).join(" OR ")} OR EXISTS (SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id AND (LOWER(a.summary) LIKE ? OR LOWER(a.body) LIKE ?)))`);
    for (let index = 0; index < fields.length + 2; index += 1) params.push(pattern);
  }
  const where = clauses.join(" AND ");
  const direction = filters.direction === "asc" ? "ASC" : "DESC";
  const sortColumn = sortColumns[filters.sort];
  const orderBy = filters.sort === "follow_up"
    ? `l.follow_up_date ${direction} NULLS LAST, l.id DESC`
    : filters.sort === "client_reply" ? `l.last_client_email_at ${direction} NULLS LAST, l.id DESC`
    : filters.sort === "todo_since" ? `l.todo_since ${direction} NULLS LAST, l.id DESC`
    : `${sortColumn} ${direction}, l.id DESC`;
  const offset = (filters.page - 1) * filters.pageSize;
  const db = getDatabasePool();
  // The count and the page are independent, so they run concurrently on the pool.
  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM leads l JOIN users o ON o.id = l.owner_id JOIN list_values st ON st.id = l.status_id JOIN list_values lt ON lt.id = l.lead_type_id
       LEFT JOIN list_values sr ON sr.id = l.status_reason_id LEFT JOIN list_values ba ON ba.id = l.bd_action_id LEFT JOIN list_values cr ON cr.id = l.client_response_id LEFT JOIN list_values ci ON ci.id = l.city_id
       WHERE ${where}`,
      params,
    ),
    db.query(`${leadSelect} WHERE ${where} ORDER BY ${orderBy} LIMIT ${filters.pageSize} OFFSET ${offset}`, params),
  ]);
  const total = Number((countRows as { total: number }[])[0].total);
  return { leads: (rows as LeadRow[]).map(toLead), total, page: filters.page, pageSize: filters.pageSize };
}

// ---- Activities ----

type ActivityRow = { id: number; leadId: number; userId: number | null; userName: string; type: string; summary: string; body: string | null; valueCode: string | null; meta: string | Record<string, unknown> | null; occurredAt: string; createdAt: string };

const toActivity = (row: ActivityRow): LeadActivity => {
  let meta: Record<string, unknown> | null = null;
  if (typeof row.meta === "string") {
    try { meta = JSON.parse(row.meta) as Record<string, unknown>; } catch { meta = null; }
  } else {
    meta = row.meta;
  }
  return {
    id: Number(row.id),
    leadId: Number(row.leadId),
    userId: row.userId === null ? null : Number(row.userId),
    userName: row.userName,
    type: activityTypes.includes(row.type as ActivityType) ? (row.type as ActivityType) : "edit",
    summary: row.summary,
    body: row.body,
    valueCode: row.valueCode,
    meta,
    occurredAt: fromSqlDateTime(row.occurredAt) ?? row.occurredAt,
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  };
};

export async function listActivities(leadId: number, db: Queryable = getDatabasePool()): Promise<LeadActivity[]> {
  const { rows } = await db.query(
    `SELECT a.id, a.lead_id AS "leadId", a.user_id AS "userId", COALESCE(NULLIF(CONCAT(u.first_name, ' ', u.last_name), ' '), 'LeadTrailPro') AS "userName", a.activity_type AS type,
       a.summary, a.body, a.value_code AS "valueCode", a.meta, a.occurred_at AS "occurredAt", a.created_at AS "createdAt"
     FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.lead_id = ? ORDER BY a.occurred_at DESC, a.id DESC LIMIT 500`,
    [leadId],
  );
  return (rows as ActivityRow[]).map(toActivity);
}

export type ActivityInput = { leadId: number; userId: number | null; type: ActivityType; summary: string; body?: string | null; valueCode?: string | null; meta?: Record<string, unknown> | null; occurredAt?: Date; /** false: a system entry (job listing) that does not count as sales activity. */ touch?: boolean };

/** Appends a timeline entry and bumps the lead's last-activity timestamp. Call inside the caller's transaction. */
export async function addActivity(db: Queryable, input: ActivityInput): Promise<number> {
  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
  const result = await db.query(
    `INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, body, value_code, meta, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [input.leadId, input.userId, input.type, input.summary.slice(0, 500), input.body ?? null, input.valueCode ?? null, input.meta ? JSON.stringify(input.meta) : null, toSqlDateTime(occurredAt), toSqlDateTime(now)],
  );
  if (input.touch !== false) await db.query("UPDATE leads SET last_activity_at = GREATEST(last_activity_at, ?::timestamp) WHERE id = ?", [toSqlDateTime(occurredAt), input.leadId]);
  return insertId(result);
}

export async function logActivity(lead: LeadSummary, actor: UserAccount, entry: { type: LoggableActivityType; summary: string; body: string; occurredAt: Date | null }): Promise<LeadActivity> {
  return withTransaction(async (connection) => {
    const defaults: Record<LoggableActivityType, string> = {
      call: `Call with ${lead.clientExecutive || lead.clientName}`,
      email: `Email to ${lead.clientExecutive || lead.clientName}`,
      visit: `Visit to ${lead.clientName}`,
      note: "Interaction note",
    };
    const id = await addActivity(connection, {
      leadId: lead.id, userId: actor.id, type: entry.type, summary: entry.summary || defaults[entry.type], body: entry.body || null,
      occurredAt: entry.occurredAt ?? undefined,
    });
    await recordAudit(connection, {
      actorId: actor.id, action: `lead.${entry.type}_logged`, entityType: "lead", entityId: lead.id,
      after: { type: entry.type, summary: entry.summary || defaults[entry.type], body: entry.body || null }, details: `${actor.name} logged a ${entry.type} on ${lead.clientName}`,
    });
    const { rows } = await connection.query(
      `SELECT a.id, a.lead_id AS "leadId", a.user_id AS "userId", COALESCE(NULLIF(CONCAT(u.first_name, ' ', u.last_name), ' '), 'LeadTrailPro') AS "userName", a.activity_type AS type,
         a.summary, a.body, a.value_code AS "valueCode", a.meta, a.occurred_at AS "occurredAt", a.created_at AS "createdAt"
       FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?`,
      [id],
    );
    return toActivity((rows as ActivityRow[])[0]);
  });
}

// ---- Mutations ----

async function validateListReferences(db: Queryable, input: Partial<LeadInput>) {
  if (input.leadTypeId !== undefined) await assertListValue(db, "lead_type", input.leadTypeId, { required: true, label: "Lead type" });
  if (input.statusId !== undefined) await assertListValue(db, "status", input.statusId, { required: true, label: "Status" });
  if (input.bdActionId !== undefined) await assertListValue(db, "bd_action", input.bdActionId, { label: "BD action" });
  if (input.stageId !== undefined) await assertListValue(db, "stage", input.stageId, { label: "Stage" });
  if (input.clientResponseId !== undefined) await assertListValue(db, "client_response", input.clientResponseId, { label: "Client response" });
  if (input.leadCategoryId !== undefined) await assertListValue(db, "lead_category", input.leadCategoryId, { label: "Lead category" });
  if (input.companySizeId !== undefined) await assertListValue(db, "company_size", input.companySizeId, { label: "Company size" });
  if (input.cityId !== undefined) await assertListValue(db, "city", input.cityId, { label: "City" });
}

/**
 * LEAD-06: a closed status (Lost Lead, Disqualified) must carry a reason from its own list; every other status
 * stores no reason. Returns the reason id to persist.
 */
async function enforceStatusReason(db: Queryable, statusId: number, statusReasonId: number | null | undefined): Promise<number | null> {
  const status = await getListValue(statusId, db);
  const listKey = reasonListFor(status?.code);
  if (!status || !listKey) return null;
  if (!statusReasonId) throw new HttpError(400, `Choose a reason for the ${status.value} status.`);
  await assertListValue(db, listKey, statusReasonId, { required: true, label: "Status reason" });
  return statusReasonId;
}

// ---- Pipeline stages (PIPE-02/03, SPEC §10.11) ----

type StageRow = { id: number; code: string; value: string; sortOrder: number; active: boolean };

/** Every stage in board order, active or not (a lead keeps an inactive stage until it moves). */
export async function listStages(db: Queryable = getDatabasePool()): Promise<StageValue[]> {
  const { rows } = await db.query(`SELECT id, code, value, sort_order AS "sortOrder", is_active AS active FROM list_values WHERE list_key = 'stage' ORDER BY sort_order, value`);
  return (rows as StageRow[]).map((row) => ({ id: Number(row.id), code: row.code, value: row.value, sortOrder: Number(row.sortOrder), active: Boolean(row.active) }));
}

/** The stage a BD action lands a lead in (List of values → BD action): its mapped stage, Contact Made when unmapped, New Deal without an action. */
export async function stageForAction(db: Queryable, bdActionId: number | null | undefined): Promise<StageValue | null> {
  const stages = await listStages(db);
  let actionStageId: number | null = null;
  if (bdActionId) {
    const { rows } = await db.query(`SELECT stage_id AS "stageId" FROM list_values WHERE id = ?`, [bdActionId]);
    const raw = (rows as { stageId: number | null }[])[0]?.stageId;
    actionStageId = raw === null || raw === undefined ? null : Number(raw);
  }
  return resolveStageForAction(bdActionId ?? null, actionStageId, stages);
}

/** Moves a lead to a stage from the board or the lead page (PIPE-05): a timeline entry and an audit row; whoever may edit the lead may move it. */
export async function setLeadStage(id: number, stageId: number, actor: UserAccount, via: "board" | "detail" | "list" = "board"): Promise<LeadSummary> {
  return withTransaction(async (connection) => {
    const lead = await getLead(id, connection);
    if (!lead) throw new HttpError(404, "Lead not found.");
    if (!canEditLead(actor, lead)) throw new HttpError(403, "You can only move leads you own.");
    if (lead.recordState !== "active") throw new HttpError(400, "Only active leads move through the pipeline.");
    await assertListValue(connection, "stage", stageId, { required: true, label: "Stage" });
    if (lead.stageId === stageId) return lead;
    const now = new Date();
    await connection.query("UPDATE leads SET stage_id = ? WHERE id = ?", [stageId, id]);
    const updated = (await getLead(id, connection))!;
    await addActivity(connection, {
      leadId: id, userId: actor.id, type: "stage_change", summary: `Stage changed from ${lead.stage ?? "no stage"} to ${updated.stage}`, valueCode: updated.stageCode,
      meta: { fromStageId: lead.stageId, toStageId: stageId, fromCode: lead.stageCode, toCode: updated.stageCode, via }, occurredAt: now,
    });
    await recordAudit(connection, {
      actorId: actor.id, action: "lead.stage", entityType: "lead", entityId: id, before: { stage: lead.stage }, after: { stage: updated.stage },
      details: `${actor.name} moved ${lead.clientName} from ${lead.stage ?? "no stage"} to ${updated.stage}`,
    }, now);
    return updated;
  });
}

/** Bulk move from the lead list (PIPE-11): every selected active lead the actor may edit moves to the stage; the others are skipped. */
/**
 * TODO-02: puts a lead on a To Do list, moves it to another, or (listId null) takes it off. By hand only: nothing in the
 * app puts a lead on a list or removes it. One list at a time; the timeline keeps each move.
 */
export async function setLeadTodo(id: number, listId: number | null, actor: UserAccount): Promise<LeadSummary> {
  return withTransaction(async (connection) => {
    const lead = await getLead(id, connection);
    if (!lead) throw new HttpError(404, "Lead not found.");
    if (!canEditLead(actor, lead)) throw new HttpError(403, "You can only change the To Do list of leads you own.");
    // A lead already on a list can always be taken off it, whatever its state.
    if (listId && lead.recordState !== "active") throw new HttpError(400, "Only active leads go on a To Do list.");
    if (listId) await assertListValue(connection, "todo_list", listId, { required: true, label: "To Do list" });
    if (lead.todoListId === listId) return lead;
    const now = new Date();
    await connection.query("UPDATE leads SET todo_list_id = ?, todo_since = ? WHERE id = ?", [listId, listId ? toSqlDateTime(now) : null, id]);
    const updated = (await getLead(id, connection))!;
    const summary = todoMoveSummary(lead.todoList, updated.todoList);
    await addActivity(connection, { leadId: id, userId: actor.id, type: "todo", summary, meta: { fromListId: lead.todoListId, toListId: listId }, occurredAt: now });
    await recordAudit(connection, {
      actorId: actor.id, action: "lead.todo", entityType: "lead", entityId: id, before: { todoList: lead.todoList }, after: { todoList: updated.todoList },
      details: `${actor.name}: ${lead.clientName} — ${summary}`,
    }, now);
    return updated;
  });
}

/** TODO-03: the same move for many leads; leads the person may not edit, and leads already there, are skipped. */
export async function bulkSetTodo(ids: number[], listId: number | null, actor: UserAccount): Promise<number> {
  let count = 0;
  for (const id of ids) {
    const lead = await getLead(id);
    if (!lead || lead.todoListId === listId || !canEditLead(actor, lead) || (listId && lead.recordState !== "active")) continue;
    await setLeadTodo(id, listId, actor);
    count += 1;
  }
  return count;
}

/** TODO-04: how many active leads are on each To Do list, the viewer's own and everyone's. */
export async function todoCounts(viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<TodoCounts> {
  const { rows } = await db.query(
    `SELECT todo_list_id AS "listId", COUNT(*)::int AS everyone, (COUNT(*) FILTER (WHERE owner_id = ?))::int AS mine
     FROM leads WHERE record_state = 'active' AND todo_list_id IS NOT NULL GROUP BY todo_list_id`,
    [viewer.id],
  );
  return summarizeTodoCounts((rows as { listId: number; everyone: number; mine: number }[]).map((row) => ({ listId: Number(row.listId), everyone: Number(row.everyone), mine: Number(row.mine) })));
}

export async function bulkSetStage(ids: number[], stageId: number, actor: UserAccount): Promise<number> {
  let count = 0;
  for (const id of ids) {
    const lead = await getLead(id);
    if (!lead || lead.recordState !== "active" || lead.stageId === stageId || !canEditLead(actor, lead)) continue;
    await setLeadStage(id, stageId, actor, "list");
    count += 1;
  }
  return count;
}

/**
 * Places every lead again from its BD action through the current mapping (the migration's one-time placement, repeatable from
 * List of values → BD action after the mapping changed). Writes no timeline entries; returns how many leads changed stage.
 */
export async function recomputeLeadStages(actor: UserAccount): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await connection.query(
      `WITH target AS (
         SELECT l.id, COALESCE(ba.stage_id, s.id) AS stage_id
         FROM leads l
         LEFT JOIN list_values ba ON ba.id = l.bd_action_id
         JOIN list_values s ON s.list_key = 'stage' AND s.code = CASE WHEN l.bd_action_id IS NULL THEN ? ELSE ? END
       )
       UPDATE leads l SET stage_id = target.stage_id FROM target WHERE target.id = l.id AND l.stage_id IS DISTINCT FROM target.stage_id`,
      ["new_deal", "contact_made"],
    );
    const count = affectedRows(result);
    await recordAudit(connection, { actorId: actor.id, action: "lead.stages_recomputed", entityType: "lead", after: { count }, details: `${actor.name} placed ${count} lead${count === 1 ? "" : "s"} again from their BD actions` });
    return count;
  });
}

// ---- Company matching (TRIP-07, duplicate check on creation) ----

export type MatchableLeadRow = MatchableLead & { ownerId: number; ownerName: string; clientEmails: string[] };

const emailList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") { try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
  return [];
};

/** Every lead with the fields the company matcher needs (`features/trips/matching`), plus its owner and client emails. */
export async function listMatchableLeads(db: Queryable = getDatabasePool()): Promise<MatchableLeadRow[]> {
  const { rows } = await db.query(`
    SELECT l.id, l.client_name AS "clientName", l.company_url AS "companyUrl", l.contact_phone AS "contactPhone", l.contact_alt_phone AS "contactAltPhone",
      l.address, ci.value AS city, st.code AS "statusCode", st.value AS status, sr.value AS "statusReason", l.record_state AS "recordState", l.last_activity_at AS "lastActivityAt",
      l.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName", l.client_emails AS "clientEmails"
    FROM leads l
    JOIN list_values st ON st.id = l.status_id
    JOIN users o ON o.id = l.owner_id
    LEFT JOIN list_values sr ON sr.id = l.status_reason_id
    LEFT JOIN list_values ci ON ci.id = l.city_id
  `);
  type Row = Omit<MatchableLeadRow, "statusLabel" | "lastActivityAt" | "clientEmails"> & { statusReason: string | null; lastActivityAt: string; clientEmails: unknown };
  return (rows as Row[]).map((row) => ({
    ...row, id: Number(row.id), ownerId: Number(row.ownerId), clientEmails: emailList(row.clientEmails),
    statusLabel: statusLabel(row.status, row.statusReason), lastActivityAt: fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt,
  }));
}

export type DuplicateMatch = { lead: MatchableLeadRow; matchedOn: MatchedOn | "email"; exact: boolean };
const exactMatches: readonly string[] = ["email", "domain", "phone", "name_address", "name"];
const liveliest = (a: MatchableLeadRow, b: MatchableLeadRow) => (a.recordState === "archived" ? 1 : 0) - (b.recordState === "archived" ? 1 : 0) || b.lastActivityAt.localeCompare(a.lastActivityAt);

/**
 * The existing lead a new one would duplicate: the same client email, website domain, phone number, or company name
 * counts as exact; a very similar name at the same address as similar. An archived lead never blocks: it is reported
 * as similar so the person can restore it instead of creating a second record.
 */
export async function findDuplicateLead(input: Pick<LeadInput, "clientName" | "companyUrl" | "contactPhone" | "contactAltPhone" | "address" | "clientEmails">, db: Queryable = getDatabasePool(), excludeId: number | null = null): Promise<DuplicateMatch | null> {
  const leads = (await listMatchableLeads(db)).filter((lead) => lead.id !== excludeId);
  const result = (lead: MatchableLeadRow, matchedOn: MatchedOn | "email"): DuplicateMatch => ({ lead, matchedOn, exact: exactMatches.includes(matchedOn) && lead.recordState !== "archived" });
  const emails = new Set(input.clientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const byEmail = emails.size ? leads.filter((lead) => lead.clientEmails.some((email) => emails.has(email.trim().toLowerCase()))).sort(liveliest)[0] : undefined;
  if (byEmail) return result(byEmail, "email");
  const facts = { name: input.clientName, website: input.companyUrl, phone: input.contactPhone, address: input.address };
  const match = matchLead(facts, leads) ?? (input.contactAltPhone ? matchLead({ ...facts, phone: input.contactAltPhone }, leads) : null);
  const found = (id: number) => leads.find((lead) => lead.id === id)!;
  if (match && exactMatches.includes(match.matchedOn)) return result(found(match.lead.id), match.matchedOn);
  const name = normalizeCompanyName(input.clientName);
  const sameName = name ? leads.filter((lead) => normalizeCompanyName(lead.clientName) === name).sort(liveliest)[0] : undefined;
  if (sameName) return result(sameName, "name");
  return match ? result(found(match.lead.id), match.matchedOn) : null;
}

const duplicateWording: Record<MatchedOn | "email", string> = {
  email: "the same client email", domain: "the same website", phone: "the same phone number", name_address: "the same name and address", name: "the same company name", similar_name_address: "a very similar name at the same address",
};

export type CreateLeadOptions = { allowSimilar?: boolean; opportunityId?: number | null };

/** A first-contact date earlier than yesterday needs Admin approval unless the creator can approve queued leads. */
export function isHistoricalFirstContact(firstContactDate: string): boolean {
  return firstContactDate < addDaysYmd(todayYmd(), -1);
}

export async function createLead(input: LeadInput, actor: UserAccount, ownerId: number | null, options: CreateLeadOptions = {}): Promise<LeadSummary> {
  return withTransaction(async (connection) => {
    await validateListReferences(connection, input);
    const duplicate = await findDuplicateLead(input, connection);
    if (duplicate && (duplicate.exact || !options.allowSimilar)) {
      const found = duplicate.lead;
      const where = found.recordState === "archived" ? "an archived lead" : `a ${found.statusLabel} lead owned by ${found.ownerName}`;
      const how = duplicateWording[duplicate.matchedOn];
      const message = duplicate.exact
        ? `${found.clientName} already exists as ${where} (${how}). Open that lead, or ask its owner or an administrator to transfer it to you.`
        : `${found.clientName} looks like the same company (${how}; ${where}). Open it to check, or save anyway if this is a different company.`;
      throw new HttpError(409, message, {
        duplicate: { leadId: found.id, clientName: found.clientName, ownerId: found.ownerId, ownerName: found.ownerName, statusLabel: found.statusLabel, recordState: found.recordState, matchedOn: duplicate.matchedOn },
        canOverride: !duplicate.exact,
      });
    }
    const statusReasonId = await enforceStatusReason(connection, input.statusId, input.statusReasonId);
    let owner = actor;
    if (ownerId && ownerId !== actor.id) {
      if (!hasPrivilege(actor, "reassign_leads")) throw new HttpError(403, "You do not have permission to create a lead for someone else.");
      const candidate = await getUser(ownerId, connection);
      if (!candidate || !candidate.active || candidate.role === "recruiter") throw new HttpError(400, "The owner must be an active Sales Manager or Admin.");
      owner = candidate;
    }
    // A card from the sales tracker carries the company's real first-contact date (§10.9), so the approval queue for historical dates does not apply.
    const fromTracker = options.opportunityId ? await opportunityHasDraft(connection, options.opportunityId) : false;
    const queued = isHistoricalFirstContact(input.firstContactDate) && !hasPrivilege(actor, "review_queued") && !fromTracker;
    // PIPE-02: a chosen stage, else the stage of the BD action, else New Deal.
    const stageId = input.stageId ?? (await stageForAction(connection, input.bdActionId))?.id ?? null;
    const now = new Date();
    const nowSql = toSqlDateTime(now);
    const result = await connection.query(
      `INSERT INTO leads (owner_id, created_by, lead_type_id, status_id, status_reason_id, bd_action_id, client_response_id, lead_category_id, company_size_id, city_id, stage_id,
         client_name, company_url, address, comments, client_executive, contact_phone, contact_alt_phone, contact_remark, client_emails, industry, positions,
         first_contact_date, follow_up_date, contract_signed_date, record_state, state_reason, state_changed_at, last_activity_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        owner.id, actor.id, input.leadTypeId, input.statusId, statusReasonId, input.bdActionId, input.clientResponseId, input.leadCategoryId, input.companySizeId, input.cityId, stageId,
        input.clientName, input.companyUrl, input.address, input.comments || null, input.clientExecutive, input.contactPhone, input.contactAltPhone, input.contactRemark,
        JSON.stringify(input.clientEmails), input.industry, input.positions || null,
        input.firstContactDate, input.followUpDate, input.contractSignedDate,
        queued ? "queued" : "active", queued ? "Historical first-contact date awaiting Admin approval" : null, nowSql, nowSql, nowSql,
      ],
    );
    const id = insertId(result);
    const lead = (await getLead(id, connection))!;
    await addActivity(connection, {
      leadId: id, userId: actor.id, type: "created", occurredAt: now,
      summary: queued ? `Lead created and queued for approval (first contact ${input.firstContactDate})` : `Lead created as ${lead.status}`,
      valueCode: lead.statusCode, meta: { statusId: lead.statusId, stageId: lead.stageId, queued },
    });
    if (options.opportunityId) {
      const claimed = await claimOpportunityForLead(connection, options.opportunityId, { id, clientName: lead.clientName, ownerId: owner.id }, actor, now);
      const parts: string[] = [];
      if (claimed.listings.length || !claimed.trackerEntries) parts.push(`${claimed.listings.length} job listing${claimed.listings.length === 1 ? "" : "s"}`);
      if (claimed.trackerEntries) parts.push(`${claimed.trackerEntries} timeline entr${claimed.trackerEntries === 1 ? "y" : "ies"} from the sales tracker`);
      await addActivity(connection, {
        leadId: id, userId: actor.id, type: "listing", occurredAt: now, touch: false, meta: { opportunityId: options.opportunityId, trackerEntries: claimed.trackerEntries },
        summary: `Created from the opportunity pool: ${parts.join(", ")}`,
        body: claimed.listings.map((item) => `${item.title} (${item.source}) ${item.url}`).join("\n") || null,
      });
    }
    // The tracker's latest BD action is already on the timeline from the sheet; only a typed-in action gets an entry of today.
    if (lead.bdActionId && !fromTracker) {
      const action = await getListValue(lead.bdActionId, connection);
      if (action) await addActivity(connection, { leadId: id, userId: actor.id, type: "bd_action", summary: action.value, valueCode: action.code, occurredAt: now });
    }
    await recordAudit(connection, { actorId: actor.id, action: queued ? "lead.queued" : "lead.created", entityType: "lead", entityId: id, after: leadAuditView(lead), details: `${actor.name} created ${lead.clientName}${duplicate ? ` (saved although it resembles ${duplicate.lead.clientName}, lead #${duplicate.lead.id})` : ""}` }, now);
    if (queued) {
      const reviewers = await listUsersWithPrivilege("review_queued", connection);
      await notifyUsers(connection, { userIds: reviewers.map((user) => user.id), actorId: actor.id, type: "queued_lead", title: `Queued lead awaiting approval: ${lead.clientName}`, body: `${actor.name} created it with first contact on ${input.firstContactDate}.`, leadId: id });
    }
    return lead;
  });
}

export async function updateLead(id: number, changes: Partial<LeadInput>, actor: UserAccount): Promise<LeadSummary> {
  return withTransaction(async (connection) => {
    const existing = await getLead(id, connection);
    if (!existing) throw new HttpError(404, "Lead not found.");
    await validateListReferences(connection, changes);
    // PIPE-03: a BD action that belongs to a later stage moves the lead forward, never back; a stage chosen outright wins.
    let stageVia: "detail" | "bd_action" = "detail";
    if (changes.stageId === undefined && changes.bdActionId && changes.bdActionId !== existing.bdActionId) {
      const mapped = await stageForAction(connection, changes.bdActionId);
      const current = existing.stageId ? (await listStages(connection)).find((stage) => stage.id === existing.stageId) ?? null : null;
      if (mapped && stageAdvances(current, mapped)) { changes = { ...changes, stageId: mapped.id }; stageVia = "bd_action"; }
    }
    if (changes.statusId !== undefined || changes.statusReasonId !== undefined) {
      const statusId = changes.statusId ?? existing.statusId;
      const statusChanged = statusId !== existing.statusId;
      const candidate = changes.statusReasonId !== undefined ? changes.statusReasonId : statusChanged ? null : existing.statusReasonId;
      changes = { ...changes, statusReasonId: await enforceStatusReason(connection, statusId, candidate) };
    }
    const columnMap: Record<keyof LeadInput, string> = {
      clientName: "client_name", companyUrl: "company_url", address: "address", comments: "comments", clientExecutive: "client_executive",
      contactPhone: "contact_phone", contactAltPhone: "contact_alt_phone", contactRemark: "contact_remark", clientEmails: "client_emails",
      industry: "industry", positions: "positions", leadTypeId: "lead_type_id", statusId: "status_id", statusReasonId: "status_reason_id", bdActionId: "bd_action_id",
      clientResponseId: "client_response_id", leadCategoryId: "lead_category_id", companySizeId: "company_size_id", cityId: "city_id",
      firstContactDate: "first_contact_date", followUpDate: "follow_up_date", contractSignedDate: "contract_signed_date", stageId: "stage_id",
    };
    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const key of Object.keys(changes) as (keyof LeadInput)[]) {
      const value = changes[key];
      if (value === undefined) continue;
      assignments.push(`${columnMap[key]} = ?`);
      if (key === "clientEmails") params.push(JSON.stringify(value));
      else if ((key === "comments" || key === "positions") && value === "") params.push(null);
      else params.push(value);
    }
    if (!assignments.length) return existing;
    const now = new Date();
    params.push(id);
    await connection.query(`UPDATE leads SET ${assignments.join(", ")} WHERE id = ?`, params);
    const updated = (await getLead(id, connection))!;
    const diff = diffRecords(leadAuditView(existing), leadAuditView(updated));
    if (!diff.changed.length) return updated;

    if (updated.statusId !== existing.statusId) {
      await addActivity(connection, {
        leadId: id, userId: actor.id, type: "status_change", summary: `Status changed from ${existing.statusLabel} to ${updated.statusLabel}`,
        valueCode: updated.statusCode,
        meta: { fromStatusId: existing.statusId, toStatusId: updated.statusId, fromCode: existing.statusCode, toCode: updated.statusCode, fromReason: existing.statusReason, toReason: updated.statusReason },
        occurredAt: now,
      });
    } else if (updated.statusReasonId !== existing.statusReasonId) {
      await addActivity(connection, {
        leadId: id, userId: actor.id, type: "status_change", summary: `Status reason updated: ${updated.statusLabel}`,
        valueCode: updated.statusCode, meta: { statusId: updated.statusId, fromReason: existing.statusReason, toReason: updated.statusReason }, occurredAt: now,
      });
    }
    if (updated.bdActionId !== existing.bdActionId && updated.bdActionId) {
      const action = await getListValue(updated.bdActionId, connection);
      await addActivity(connection, { leadId: id, userId: actor.id, type: "bd_action", summary: updated.bdAction ?? "BD action updated", valueCode: action?.code ?? null, occurredAt: now });
    }
    if (updated.stageId !== existing.stageId) {
      await addActivity(connection, {
        leadId: id, userId: actor.id, type: "stage_change", summary: `Stage changed from ${existing.stage ?? "no stage"} to ${updated.stage ?? "no stage"}`, valueCode: updated.stageCode,
        meta: { fromStageId: existing.stageId, toStageId: updated.stageId, fromCode: existing.stageCode, toCode: updated.stageCode, via: stageVia }, occurredAt: now,
      });
    }
    if (updated.clientResponseId !== existing.clientResponseId && updated.clientResponseId) {
      const response = await getListValue(updated.clientResponseId, connection);
      await addActivity(connection, { leadId: id, userId: actor.id, type: "client_response", summary: `Client response: ${updated.clientResponse}`, valueCode: response?.code ?? null, occurredAt: now });
    }
    if (updated.followUpDate !== existing.followUpDate) {
      await addActivity(connection, { leadId: id, userId: actor.id, type: "follow_up", summary: updated.followUpDate ? `Follow-up scheduled for ${updated.followUpDate}` : "Follow-up date cleared", occurredAt: now });
    }
    const otherChanges = diff.changed.filter((key) => !["status", "statusReason", "bdAction", "stage", "clientResponse", "followUpDate"].includes(key));
    if (otherChanges.length) {
      await addActivity(connection, { leadId: id, userId: actor.id, type: "edit", summary: `Updated ${otherChanges.join(", ")}`, occurredAt: now });
    }
    await recordAudit(connection, { actorId: actor.id, action: "lead.updated", entityType: "lead", entityId: id, before: diff.before, after: diff.after, details: `${actor.name} updated ${diff.changed.join(", ")} on ${updated.clientName}` }, now);
    if (updated.statusId !== existing.statusId || updated.statusReasonId !== existing.statusReasonId) {
      await notifyUsers(connection, { userIds: [updated.ownerId], actorId: actor.id, type: "lead_status", title: `${updated.clientName} is now ${updated.statusLabel}`, body: `${actor.name} changed the status from ${existing.statusLabel}.`, leadId: id });
    }
    return (await getLead(id, connection))!;
  });
}

export async function transferLead(id: number, newOwnerId: number, reason: string, actor: UserAccount): Promise<LeadSummary> {
  return withTransaction(async (connection) => {
    const lead = await getLead(id, connection);
    if (!lead) throw new HttpError(404, "Lead not found.");
    if (!canTransferLead(actor, lead)) throw new HttpError(403, "You can only transfer leads you own.");
    if (lead.ownerId === newOwnerId) throw new HttpError(400, "That person already owns this lead.");
    const newOwner = await getUser(newOwnerId, connection);
    if (!newOwner || !newOwner.active || newOwner.role === "recruiter") throw new HttpError(400, "Leads can only be transferred to an active Sales Manager or Admin.");
    const now = new Date();
    await connection.query("UPDATE leads SET owner_id = ? WHERE id = ?", [newOwnerId, id]);
    const taskResult = await connection.query(
      "UPDATE tasks SET assignee_id = ? WHERE lead_id = ? AND assignee_id = ? AND status = 'open'", [newOwnerId, id, lead.ownerId],
    );
    await addActivity(connection, {
      leadId: id, userId: actor.id, type: "transfer", summary: `Ownership transferred from ${lead.ownerName} to ${newOwner.name}${reason ? ` — ${reason}` : ""}`,
      meta: { fromOwnerId: lead.ownerId, toOwnerId: newOwnerId, reason, tasksReassigned: affectedRows(taskResult) }, occurredAt: now,
    });
    // The owner "transfers"; an administrator acting on someone else's lead "reassigns" (BRD section 7).
    const byOwner = actor.id === lead.ownerId;
    await recordAudit(connection, {
      actorId: actor.id, action: byOwner ? "lead.transferred" : "lead.reassigned", entityType: "lead", entityId: id,
      before: { ownerId: lead.ownerId, owner: lead.ownerName }, after: { ownerId: newOwnerId, owner: newOwner.name },
      details: `${actor.name} ${byOwner ? "transferred" : "reassigned"} ${lead.clientName} to ${newOwner.name}${reason ? `: ${reason}` : ""}. ${affectedRows(taskResult)} open task(s) reassigned.`,
    }, now);
    await notifyUsers(connection, { userIds: [newOwnerId, lead.ownerId], actorId: actor.id, type: "lead_transferred", title: `${lead.clientName} ${byOwner ? "transferred" : "reassigned"} to ${newOwner.name}`, body: `${actor.name} moved the lead from ${lead.ownerName} to ${newOwner.name}${reason ? `: ${reason}` : ""}.`, leadId: id });
    return (await getLead(id, connection))!;
  });
}

export async function reviewQueuedLead(id: number, approve: boolean, comment: string, actor: UserAccount): Promise<LeadSummary> {
  return withTransaction(async (connection) => {
    const lead = await getLead(id, connection);
    if (!lead) throw new HttpError(404, "Lead not found.");
    if (lead.recordState !== "queued") throw new HttpError(400, "Only queued leads can be approved or rejected.");
    const now = new Date();
    const state: LeadRecordState = approve ? "active" : "archived";
    const reason = approve ? null : `Rejected${comment ? `: ${comment}` : ""}`;
    await connection.query(
      "UPDATE leads SET record_state = ?, state_reason = ?, state_changed_by = ?, state_changed_at = ? WHERE id = ?",
      [state, reason, actor.id, toSqlDateTime(now), id],
    );
    await addActivity(connection, {
      leadId: id, userId: actor.id, type: "state_change", summary: approve ? `Queued lead approved${comment ? ` — ${comment}` : ""}` : `Queued lead rejected${comment ? ` — ${comment}` : ""}`,
      valueCode: approve ? "approved" : "rejected", meta: { comment }, occurredAt: now,
    });
    await recordAudit(connection, {
      actorId: actor.id, action: approve ? "lead.approved" : "lead.rejected", entityType: "lead", entityId: id,
      before: { recordState: "queued" }, after: { recordState: state, comment }, details: `${actor.name} ${approve ? "approved" : "rejected"} ${lead.clientName}${comment ? `: ${comment}` : ""}`,
    }, now);
    await notifyUsers(connection, { userIds: [lead.createdById, lead.ownerId], actorId: actor.id, type: "queued_reviewed", title: `${lead.clientName} ${approve ? "approved" : "rejected"}`, body: `${actor.name} ${approve ? "approved the queued lead" : "rejected the queued lead"}${comment ? `: ${comment}` : ""}.`, leadId: id });
    return (await getLead(id, connection))!;
  });
}

export async function setLeadState(id: number, state: "active" | "archived", reason: string, actor: UserAccount, db?: Queryable): Promise<LeadSummary> {
  const run = async (connection: Queryable) => {
    const lead = await getLead(id, connection);
    if (!lead) throw new HttpError(404, "Lead not found.");
    if (lead.recordState === state) return lead;
    if (lead.recordState === "queued") throw new HttpError(400, "Approve or reject the queued lead instead.");
    const now = new Date();
    await connection.query(
      "UPDATE leads SET record_state = ?, state_reason = ?, state_changed_by = ?, state_changed_at = ? WHERE id = ?",
      [state, reason || null, actor.id, toSqlDateTime(now), id],
    );
    await addActivity(connection, {
      leadId: id, userId: actor.id, type: "state_change", summary: state === "archived" ? `Lead archived${reason ? ` — ${reason}` : ""}` : `Lead restored${reason ? ` — ${reason}` : ""}`,
      valueCode: state, occurredAt: now,
    });
    await recordAudit(connection, {
      actorId: actor.id, action: state === "archived" ? "lead.archived" : "lead.restored", entityType: "lead", entityId: id,
      before: { recordState: lead.recordState }, after: { recordState: state, reason }, details: `${actor.name} ${state === "archived" ? "archived" : "restored"} ${lead.clientName}${reason ? `: ${reason}` : ""}`,
    }, now);
    return (await getLead(id, connection))!;
  };
  return db ? run(db) : withTransaction(run);
}

export async function bulkSetState(ids: number[], state: "active" | "archived", reason: string, actor: UserAccount): Promise<number> {
  return withTransaction(async (connection) => {
    let count = 0;
    for (const id of ids) {
      const before = await getLead(id, connection);
      if (!before || before.recordState === state || before.recordState === "queued") continue;
      await setLeadState(id, state, reason, actor, connection);
      count += 1;
    }
    return count;
  });
}

export async function bulkReassign(ids: number[], newOwnerId: number, reason: string, actor: UserAccount): Promise<number> {
  if (!hasPrivilege(actor, "reassign_leads")) throw new HttpError(403, "You do not have permission to reassign leads.");
  let count = 0;
  for (const id of ids) {
    const lead = await getLead(id);
    if (!lead || lead.ownerId === newOwnerId) continue;
    await transferLead(id, newOwnerId, reason, actor);
    count += 1;
  }
  return count;
}
