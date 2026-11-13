import { fromSqlDateTime, getDatabasePool } from "@/lib/db";
import { statusLabel } from "@/features/list-values/model";
import { listStages } from "@/features/leads/repository";
import { getSettings } from "@/features/settings/repository";
import { resolveInactivityDays } from "@/features/settings/model";
import type { UserAccount } from "@/features/users/model";
import { entryStageCode } from "@/features/list-values/model";
import { offBoardStatusCodes, pipelinePageSize, quietDaysSince, type PipelineBoard, type PipelineCard, type PipelineFilters, type PipelineStage } from "./model";

type CardRow = {
  id: number; clientName: string; clientExecutive: string; city: string | null; leadTypeId: number; leadType: string;
  statusId: number; statusCode: string; status: string; statusReason: string | null; bdActionId: number | null; bdAction: string | null;
  ownerId: number; ownerName: string; stageId: number; dealValue: string | number | null; followUpDate: string | null; nextTaskDueAt: string | null; nextTaskTitle: string | null;
  lastActivityAt: string; lastClientEmailAt: string | null; lastTeamEmailAt: string | null; rn: number;
};

const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * The board (PIPE-04): one column per stage with its count and the first page of cards, for the viewer's own leads or the
 * team's. Cards are the active leads whose status is neither Client nor closed; a lead not yet placed (no stage) shows in
 * New Deal. With `stageId` and `offset` the call returns the next page of one column only.
 */
export async function listPipeline(filters: PipelineFilters, viewer: UserAccount): Promise<PipelineBoard> {
  const db = getDatabasePool();
  // PD-09: the board of one pipeline; without a choice, the default one, which also shows deals not yet placed.
  const [settings, stages, defaultStages] = await Promise.all([getSettings(db), listStages(db, filters.pipelineId ?? "default"), listStages(db, "default")]);
  const isDefault = !filters.pipelineId || defaultStages.some((stage) => stage.pipelineId !== null && stage.pipelineId === filters.pipelineId);
  const entry = stages.find((stage) => stage.code === entryStageCode) ?? stages.find((stage) => stage.active) ?? stages[0];
  if (!entry) return { scope: filters.scope, total: 0, stages: [] };

  const clauses: string[] = ["l.record_state = 'active'", "st.code <> ALL(?::text[])", isDefault ? "(l.stage_id IS NULL OR l.stage_id = ANY(?::int[]))" : "l.stage_id = ANY(?::int[])"];
  const params: unknown[] = [[...offBoardStatusCodes], stages.map((stage) => stage.id)];
  if (filters.scope === "mine") { clauses.push("l.owner_id = ?"); params.push(viewer.id); }
  else if (filters.ownerId) { clauses.push("l.owner_id = ?"); params.push(filters.ownerId); }
  if (filters.leadTypeId) { clauses.push("l.lead_type_id = ?"); params.push(filters.leadTypeId); }
  if (filters.statusId) { clauses.push("l.status_id = ?"); params.push(filters.statusId); }
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

  const pageOf = (stageId: number | null, offset: number) => {
    const sql = `
      WITH cards AS (
        SELECT l.id, l.client_name AS "clientName", l.client_executive AS "clientExecutive", ci.value AS city, l.lead_type_id AS "leadTypeId", lt.value AS "leadType",
          l.status_id AS "statusId", st.code AS "statusCode", st.value AS status, sr.value AS "statusReason", l.bd_action_id AS "bdActionId", ba.value AS "bdAction",
          l.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName", COALESCE(l.stage_id, ?) AS "stageId",
          l.follow_up_date AS "followUpDate", l.deal_value AS "dealValue", nt.due_at AS "nextTaskDueAt", nt.title AS "nextTaskTitle",
          l.last_activity_at AS "lastActivityAt", l.last_client_email_at AS "lastClientEmailAt", l.last_team_email_at AS "lastTeamEmailAt",
          LEAST(nt.due_at, l.follow_up_date::timestamp) AS next_step
        ${from.replace("FROM leads l", "FROM leads l LEFT JOIN LATERAL (SELECT t.due_at, t.title FROM tasks t WHERE t.lead_id = l.id AND t.status = 'open' ORDER BY t.due_at ASC NULLS LAST, t.id LIMIT 1) nt ON TRUE")}
      ), ranked AS (
        SELECT cards.*, ROW_NUMBER() OVER (PARTITION BY "stageId" ORDER BY next_step ASC NULLS LAST, "lastActivityAt" DESC, id DESC) AS rn FROM cards
      )
      SELECT * FROM ranked WHERE rn > ? AND rn <= ?${stageId ? ' AND "stageId" = ?' : ""} ORDER BY "stageId", rn`;
    return db.query<CardRow>(sql, [entry.id, ...params, offset, offset + pipelinePageSize, ...(stageId ? [stageId] : [])]);
  };

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ stageId: number; count: number; value: string | number }>(`SELECT COALESCE(l.stage_id, ?) AS "stageId", COUNT(*) AS count, COALESCE(SUM(l.deal_value), 0) AS value ${from} GROUP BY 1`, [entry.id, ...params]),
    pageOf(filters.stageId, filters.offset),
  ]);
  const counts = new Map(countRows.map((row) => [Number(row.stageId), Number(row.count)]));
  const values = new Map(countRows.map((row) => [Number(row.stageId), Number(row.value)]));
  const now = new Date();
  const cards = rows.map((row): PipelineCard => {
    const lastActivityAt = fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt;
    const quietLimit = resolveInactivityDays({ statusId: Number(row.statusId), bdActionId: row.bdActionId === null ? null : Number(row.bdActionId) }, settings.reminders);
    const quietDays = quietDaysSince(lastActivityAt, now);
    return {
      id: Number(row.id), clientName: row.clientName, clientExecutive: row.clientExecutive ?? "", city: row.city, leadTypeId: Number(row.leadTypeId), leadType: row.leadType,
      statusId: Number(row.statusId), statusCode: row.statusCode, statusLabel: statusLabel(row.status, row.statusReason),
      bdActionId: row.bdActionId === null ? null : Number(row.bdActionId), bdAction: row.bdAction, ownerId: Number(row.ownerId), ownerName: row.ownerName, stageId: Number(row.stageId),
      followUpDate: row.followUpDate, dealValue: row.dealValue === null || row.dealValue === undefined ? null : Number(row.dealValue), nextTaskDueAt: fromSqlDateTime(row.nextTaskDueAt), nextTaskTitle: row.nextTaskTitle,
      lastActivityAt, lastClientEmailAt: fromSqlDateTime(row.lastClientEmailAt), lastTeamEmailAt: fromSqlDateTime(row.lastTeamEmailAt),
      quietDays, quietLimit, quiet: quietDays > quietLimit,
    };
  });
  const columns: PipelineStage[] = stages
    .map((stage) => ({ ...stage, count: counts.get(stage.id) ?? 0, valueTotal: values.get(stage.id) ?? 0, leads: cards.filter((card) => card.stageId === stage.id) }))
    .filter((stage) => stage.active || stage.count > 0);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { scope: filters.scope, total, stages: filters.stageId ? columns.filter((stage) => stage.id === filters.stageId) : columns };
}
