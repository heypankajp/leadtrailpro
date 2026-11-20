import { fromSqlDateTime, getDatabasePool } from "@/lib/db";
import { statusLabel } from "@/features/list-values/model";
import { listStages } from "@/features/leads/repository";
import { quickFilterClause } from "@/features/leads/quick-filter-sql";
import { getSettings } from "@/features/settings/repository";
import { resolveInactivityDays } from "@/features/settings/model";
import type { UserAccount } from "@/features/users/model";
import { entryStageCode } from "@/features/list-values/model";
import { offBoardStatusCodes, pipelinePageSize, quietDaysSince, type PipelineBoard, type PipelineCard, type PipelineFilters, type PipelineStage, type StageValue } from "./model";

type CardRow = {
  id: number; clientName: string; clientExecutive: string; city: string | null; leadTypeId: number; leadType: string;
  statusId: number; statusCode: string; status: string; statusReason: string | null; statusReasonId: number | null; bdActionId: number | null; bdAction: string | null;
  ownerId: number; ownerName: string; stageId: number; columnId: number; dealValue: string | number | null; followUpDate: string | null; nextTaskDueAt: string | null; nextTaskTitle: string | null;
  lastActivityAt: string; lastClientEmailAt: string | null; lastTeamEmailAt: string | null; todoListId: number | null; favorite: boolean; rn: number;
};

const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * The board (PIPE-04): one column per stage with its count and the first page of cards, for the viewer's own leads or the
 * team's. Cards are the active leads whose status is neither Client nor closed; a lead not yet placed (no stage) shows in
 * New Deal. With `stageId` (or `column`) and `offset` the call returns the next page of one column only.
 * PD-24: with `groupBy=status` the columns are the statuses (every one, Client and the closed ones too) and `stageId`
 * filters the deals of one stage; `column` names the status column of Show more. PD-23: the date filter applies to both.
 */
export async function listPipeline(filters: PipelineFilters, viewer: UserAccount): Promise<PipelineBoard> {
  const db = getDatabasePool();
  const byStatus = filters.groupBy === "status";
  // PD-09: the board of one pipeline; without a choice, the default one, which also shows deals not yet placed.
  const [settings, stages, defaultStages, statusRows] = await Promise.all([
    getSettings(db), listStages(db, filters.pipelineId ?? "default"), listStages(db, "default"),
    byStatus ? db.query<StageValue>(`SELECT id, code, value, sort_order AS "sortOrder", is_active AS active FROM list_values WHERE list_key = 'status' ORDER BY sort_order, value`) : Promise.resolve(null),
  ]);
  const isDefault = !filters.pipelineId || defaultStages.some((stage) => stage.pipelineId !== null && stage.pipelineId === filters.pipelineId);
  const entry = stages.find((stage) => stage.code === entryStageCode) ?? stages.find((stage) => stage.active) ?? stages[0];
  if (!entry) return { scope: filters.scope, groupBy: filters.groupBy, total: 0, stages: [] };

  const clauses: string[] = ["l.record_state = 'active'", isDefault ? "(l.stage_id IS NULL OR l.stage_id = ANY(?::int[]))" : "l.stage_id = ANY(?::int[])"];
  const params: unknown[] = [stages.map((stage) => stage.id)];
  // The stage board leaves closed deals out, unless the ready-made filter asks for lost or won ones (PD-30).
  if (!byStatus && filters.quick !== "lost" && filters.quick !== "won") { clauses.push("st.code <> ALL(?::text[])"); params.push([...offBoardStatusCodes]); }
  if (filters.quick) {
    const quick = await quickFilterClause(db, filters.quick);
    clauses.push(quick.clause);
    params.push(...quick.params);
  }
  // Favourites (request of November 20, 2026): the viewer's own marks, on anyone's deals, so My deals does not hide them.
  if (filters.favorites) { clauses.push("EXISTS (SELECT 1 FROM deal_favorites fav WHERE fav.lead_id = l.id AND fav.user_id = ?)"); params.push(viewer.id); }
  else if (filters.scope === "mine") { clauses.push("l.owner_id = ?"); params.push(viewer.id); }
  else if (filters.ownerId) { clauses.push("l.owner_id = ?"); params.push(filters.ownerId); }
  if (filters.leadTypeId) { clauses.push("l.lead_type_id = ?"); params.push(filters.leadTypeId); }
  if (filters.statusId && !byStatus) { clauses.push("l.status_id = ?"); params.push(filters.statusId); }
  if (filters.stageId && byStatus) { clauses.push("COALESCE(l.stage_id, ?) = ?"); params.push(entry.id, filters.stageId); }
  const dates: [string | null, string][] = [
    [filters.firstContactFrom, "l.first_contact_date >= ?::date"], [filters.firstContactTo, "l.first_contact_date <= ?::date"],
    [filters.followUpFrom, "l.follow_up_date >= ?::date"], [filters.followUpTo, "l.follow_up_date <= ?::date"],
  ];
  for (const [value, clause] of dates) if (value) { clauses.push(clause); params.push(value); }
  if (filters.q) {
    const pattern = likePattern(filters.q.toLowerCase());
    const fields = ["l.client_name", "l.client_executive", "ci.value", "ba.value", "l.industry", "CONCAT(o.first_name, ' ', o.last_name)"];
    clauses.push(`(${fields.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ?`).join(" OR ")})`);
    for (let index = 0; index < fields.length; index += 1) params.push(pattern);
  }
  const from = `
    FROM leads l
    JOIN users o ON o.id = l.owner_id
    JOIN list_values st ON st.id = l.status_id
    JOIN list_values lt ON lt.id = l.lead_type_id
    LEFT JOIN list_values sr ON sr.id = l.status_reason_id
    LEFT JOIN list_values ba ON ba.id = l.bd_action_id
    LEFT JOIN list_values ci ON ci.id = l.city_id
    WHERE ${clauses.join(" AND ")}`;
  // The column a deal sits in: its stage (New Deal while it has none), or its status.
  const columnSql = byStatus ? "l.status_id" : "COALESCE(l.stage_id, ?)";
  const columnParams = byStatus ? [] : [entry.id];
  const showMore = filters.column ?? (byStatus ? null : filters.stageId);

  const pageOf = (column: number | null, offset: number) => {
    const sql = `
      WITH cards AS (
        SELECT l.id, l.client_name AS "clientName", l.client_executive AS "clientExecutive", ci.value AS city, l.lead_type_id AS "leadTypeId", lt.value AS "leadType",
          l.status_id AS "statusId", st.code AS "statusCode", st.value AS status, sr.value AS "statusReason", l.status_reason_id AS "statusReasonId", l.bd_action_id AS "bdActionId", ba.value AS "bdAction",
          l.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName", COALESCE(l.stage_id, ?) AS "stageId", ${columnSql} AS "columnId",
          l.follow_up_date AS "followUpDate", l.deal_value AS "dealValue", nt.due_at AS "nextTaskDueAt", nt.title AS "nextTaskTitle",
          l.last_activity_at AS "lastActivityAt", l.last_client_email_at AS "lastClientEmailAt", l.last_team_email_at AS "lastTeamEmailAt", l.todo_list_id AS "todoListId",
          EXISTS (SELECT 1 FROM deal_favorites fav WHERE fav.lead_id = l.id AND fav.user_id = ${Number(viewer.id)}) AS favorite,
          LEAST(nt.due_at, l.follow_up_date::timestamp) AS next_step
        ${from.replace("FROM leads l", "FROM leads l LEFT JOIN LATERAL (SELECT t.due_at, t.title FROM tasks t WHERE t.lead_id = l.id AND t.status = 'open' ORDER BY t.due_at ASC NULLS LAST, t.id LIMIT 1) nt ON TRUE")}
      ), ranked AS (
        SELECT cards.*, ROW_NUMBER() OVER (PARTITION BY "columnId" ORDER BY next_step ASC NULLS LAST, "lastActivityAt" DESC, id DESC) AS rn FROM cards
      )
      SELECT * FROM ranked WHERE rn > ? AND rn <= ?${column ? ' AND "columnId" = ?' : ""} ORDER BY "columnId", rn`;
    return db.query<CardRow>(sql, [entry.id, ...columnParams, ...params, offset, offset + pipelinePageSize, ...(column ? [column] : [])]);
  };

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ columnId: number; count: number; value: string | number }>(`SELECT ${columnSql} AS "columnId", COUNT(*) AS count, COALESCE(SUM(l.deal_value), 0) AS value ${from} GROUP BY 1`, [...columnParams, ...params]),
    pageOf(showMore, filters.offset),
  ]);
  const counts = new Map(countRows.map((row) => [Number(row.columnId), Number(row.count)]));
  const values = new Map(countRows.map((row) => [Number(row.columnId), Number(row.value)]));
  const now = new Date();
  const placed = rows.map((row): { columnId: number; card: PipelineCard } => {
    const lastActivityAt = fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt;
    const quietLimit = resolveInactivityDays({ statusId: Number(row.statusId), bdActionId: row.bdActionId === null ? null : Number(row.bdActionId) }, settings.reminders);
    const quietDays = quietDaysSince(lastActivityAt, now);
    return { columnId: Number(row.columnId), card: {
      id: Number(row.id), clientName: row.clientName, clientExecutive: row.clientExecutive ?? "", city: row.city, leadTypeId: Number(row.leadTypeId), leadType: row.leadType,
      statusId: Number(row.statusId), statusCode: row.statusCode, statusLabel: statusLabel(row.status, row.statusReason), statusReasonId: row.statusReasonId === null ? null : Number(row.statusReasonId),
      bdActionId: row.bdActionId === null ? null : Number(row.bdActionId), bdAction: row.bdAction, ownerId: Number(row.ownerId), ownerName: row.ownerName, stageId: Number(row.stageId),
      followUpDate: row.followUpDate, dealValue: row.dealValue === null || row.dealValue === undefined ? null : Number(row.dealValue), nextTaskDueAt: fromSqlDateTime(row.nextTaskDueAt), nextTaskTitle: row.nextTaskTitle,
      lastActivityAt, lastClientEmailAt: fromSqlDateTime(row.lastClientEmailAt), lastTeamEmailAt: fromSqlDateTime(row.lastTeamEmailAt), todoListId: row.todoListId === null ? null : Number(row.todoListId),
      quietDays, quietLimit, quiet: quietDays > quietLimit, favorite: Boolean(row.favorite),
    } };
  });
  const columnValues: StageValue[] = byStatus
    ? (statusRows?.rows ?? []).map((row) => ({ id: Number(row.id), code: row.code, value: row.value, sortOrder: Number(row.sortOrder), active: Boolean(row.active) }))
    : stages;
  const columns: PipelineStage[] = columnValues
    .map((column) => ({ ...column, count: counts.get(column.id) ?? 0, valueTotal: values.get(column.id) ?? 0, leads: placed.filter((item) => item.columnId === column.id).map((item) => item.card) }))
    .filter((column) => column.active || column.count > 0);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { scope: filters.scope, groupBy: filters.groupBy, total, stages: showMore ? columns.filter((column) => column.id === showMore) : columns };
}
