import { getDatabasePool, fromSqlDateTime, toSqlDateTime, type Queryable } from "@/lib/db";

import type { AuditEntry } from "./model";

export type AuditInput = {
  actorId: number | null;
  action: string;
  entityType: "lead" | "user" | "task" | "attachment" | "list_value" | "target_template" | "setting" | "session";
  entityId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  details?: string | null;
};

export async function recordAudit(db: Queryable, input: AuditInput, now = new Date()) {
  await db.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before_json, after_json, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.actorId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.details ? input.details.slice(0, 500) : null,
      toSqlDateTime(now),
    ],
  );
}

/** Returns only the keys whose values differ, as before/after objects. */
export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changedBefore[key] = before[key] ?? null;
      changedAfter[key] = after[key] ?? null;
    }
  }
  return { before: changedBefore, after: changedAfter, changed: Object.keys(changedAfter) };
}

type AuditRow = {
  id: number; actorId: number | null; actorName: string | null; action: string; entityType: string; entityId: number | null;
  beforeJson: string | Record<string, unknown> | null; afterJson: string | Record<string, unknown> | null; details: string | null; createdAt: string;
};

const parseJson = (value: string | Record<string, unknown> | null) => {
  if (value === null) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
  }
  return value;
};

export async function listAudit(filter: { entityType?: string; entityId?: number; actorId?: number; limit?: number }): Promise<AuditEntry[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.entityType) { clauses.push("a.entity_type = ?"); params.push(filter.entityType); }
  if (filter.entityId) { clauses.push("a.entity_id = ?"); params.push(filter.entityId); }
  if (filter.actorId) { clauses.push("a.actor_id = ?"); params.push(filter.actorId); }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const [rows] = await getDatabasePool().query(
    `SELECT a.id, a.actor_id AS actorId, CONCAT(u.first_name, ' ', u.last_name) AS actorName, a.action, a.entity_type AS entityType,
       a.entity_id AS entityId, a.before_json AS beforeJson, a.after_json AS afterJson, a.details, a.created_at AS createdAt
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY a.id DESC LIMIT ${limit}`,
    params,
  );
  return (rows as AuditRow[]).map((row) => ({
    id: Number(row.id),
    actorId: row.actorId === null ? null : Number(row.actorId),
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId === null ? null : Number(row.entityId),
    before: parseJson(row.beforeJson),
    after: parseJson(row.afterJson),
    details: row.details,
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  }));
}
