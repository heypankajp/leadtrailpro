import { fromSqlDateTime, toSqlDateTime, type Queryable } from "@/lib/db";
import { todayYmd } from "@/lib/dates";
import { entryStageCode } from "@/features/list-values/model";
import { quietDaysSince } from "@/features/pipeline/model";
import { resolveInactivityDays } from "@/features/settings/model";
import { getSettings } from "@/features/settings/repository";
import { monthsBefore, quickFilterStatusCodes, type QuickFilterKey } from "./quick-filters";

/**
 * The SQL of a ready-made or data cleanup filter (PD-30) over `leads l`, for the board and the list. Statuses are read
 * through a subquery so the clause fits any query that has `l`. Quiet deals depend on the needs-attention rules, so their
 * ids are worked out here first (a few thousand active deals at most).
 */
export async function quickFilterClause(db: Queryable, key: QuickFilterKey): Promise<{ clause: string; params: unknown[] }> {
  const statuses = quickFilterStatusCodes(key);
  const parts: string[] = [];
  const params: unknown[] = [];
  if (statuses.only) { parts.push("l.status_id IN (SELECT id FROM list_values WHERE list_key = 'status' AND code = ANY(?::text[]))"); params.push(statuses.only); }
  if (statuses.exclude.length) { parts.push("l.status_id NOT IN (SELECT id FROM list_values WHERE list_key = 'status' AND code = ANY(?::text[]))"); params.push(statuses.exclude); }
  const today = todayYmd();
  const yearAgo = toSqlDateTime(new Date(`${monthsBefore(today, 12)}T00:00:00Z`));
  switch (key) {
    case "old_3m": parts.push("l.first_contact_date < ?::date"); params.push(monthsBefore(today, 3)); break;
    case "quiet": parts.push("l.id = ANY(?::int[])"); params.push(await quietLeadIds(db)); break;
    case "first_stage_stale":
      parts.push("(l.stage_id IS NULL OR l.stage_id IN (SELECT id FROM list_values WHERE list_key = 'stage' AND code = ?)) AND l.last_activity_at < ?");
      params.push(entryStageCode, yearAgo);
      break;
    case "no_stage": parts.push("l.stage_id IS NULL"); break;
    case "inactive_owner": parts.push("l.owner_id IN (SELECT id FROM users WHERE is_active = FALSE)"); break;
    case "close_date_passed": parts.push("l.expected_close_date < ?::date"); params.push(today); break;
    case "no_next_step":
      // The Action Center's rule: no follow-up date from today on and no open task.
      parts.push("(l.follow_up_date IS NULL OR l.follow_up_date < ?::date) AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id = l.id AND t.status = 'open')");
      params.push(today);
      break;
    case "no_stage_change_3m": {
      const cutoff = monthsBefore(today, 3);
      parts.push("l.first_contact_date < ?::date AND NOT EXISTS (SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id AND a.activity_type = 'stage_change' AND a.occurred_at >= ?)");
      params.push(cutoff, toSqlDateTime(new Date(`${cutoff}T00:00:00Z`)));
      break;
    }
    case "no_update_12m": parts.push("l.last_activity_at < ?"); params.push(yearAgo); break;
    default: break;
  }
  return { clause: parts.length ? `(${parts.join(" AND ")})` : "TRUE", params };
}

/** Active, open deals past their needs-attention limit (the board's "Quiet" mark). */
async function quietLeadIds(db: Queryable): Promise<number[]> {
  const settings = await getSettings(db);
  const { rows } = await db.query(
    `SELECT l.id, l.status_id AS "statusId", l.bd_action_id AS "bdActionId", l.stage_id AS "stageId", l.last_activity_at AS "lastActivityAt"
     FROM leads l JOIN list_values st ON st.id = l.status_id
     WHERE l.record_state = 'active' AND st.code NOT IN ('client', 'lost', 'disqualified')`,
  );
  const now = new Date();
  return (rows as { id: number; statusId: number; bdActionId: number | null; stageId: number | null; lastActivityAt: string }[])
    .filter((row) => {
      const limit = resolveInactivityDays({ statusId: Number(row.statusId), bdActionId: row.bdActionId === null ? null : Number(row.bdActionId), stageId: row.stageId === null ? null : Number(row.stageId) }, settings.reminders);
      return quietDaysSince(fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt, now) > limit;
    })
    .map((row) => Number(row.id));
}
