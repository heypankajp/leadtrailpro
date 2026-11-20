import { fromSqlDateTime, getDatabasePool, toSqlDateTime, type Queryable } from "@/lib/db";
import { periodRange, todayYmd } from "@/lib/dates";
import type { UserAccount } from "@/features/users/model";
import type { LeadDashboard, LeadDashboardItem } from "./lead-dashboard-model";

export type { LeadDashboard, LeadDashboardItem } from "./lead-dashboard-model";

/**
 * The Action Center for leads (request of November 20, 2026): the Lead / Deal choice on the Action Center shows this one for
 * Lead. "My Work" is the leads the person added, decided on (converted or set not relevant), or that their job searches found;
 * "Whole Team" is every lead.
 */
const manualOrigin = "(o.added_by IS NOT NULL OR o.draft IS NOT NULL OR o.listings_count = 0)";
const mineClause = `(o.added_by = ? OR o.decided_by = ? OR EXISTS (SELECT 1 FROM opportunity_listings ml JOIN opportunity_searches ms ON ms.id = ml.search_id WHERE ml.opportunity_id = o.id AND ms.created_by = ?))`;

type ItemRow = {
  id: number; companyName: string; location: string; latestTitle: string; manual: boolean; createdAt: string; addedByName: string | null;
  todoSince: string | null; leadId: number | null; decidedAt: string | null; decidedByName: string | null; reason: string | null; dealOwnerName: string | null; dealStage: string | null;
};

const itemColumns = `
  o.id, o.company_name AS "companyName", o.location, o.latest_title AS "latestTitle", ${manualOrigin} AS manual, o.created_at AS "createdAt",
  NULLIF(TRIM(CONCAT(ua.first_name, ' ', ua.last_name)), '') AS "addedByName", o.todo_since AS "todoSince", o.lead_id AS "leadId",
  o.decided_at AS "decidedAt", NULLIF(TRIM(CONCAT(ud.first_name, ' ', ud.last_name)), '') AS "decidedByName", r.value AS reason,
  NULLIF(TRIM(CONCAT(uo.first_name, ' ', uo.last_name)), '') AS "dealOwnerName", st.value AS "dealStage"`;
const itemJoins = `
  FROM opportunities o
  LEFT JOIN users ua ON ua.id = o.added_by
  LEFT JOIN users ud ON ud.id = o.decided_by
  LEFT JOIN list_values r ON r.id = o.reason_id
  LEFT JOIN leads l ON l.id = o.lead_id
  LEFT JOIN users uo ON uo.id = l.owner_id
  LEFT JOIN list_values st ON st.id = l.stage_id`;

const toItem = (row: ItemRow): LeadDashboardItem => ({
  id: Number(row.id), companyName: row.companyName, location: row.location, latestTitle: row.latestTitle, origin: row.manual ? "manual" : "found",
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt, addedByName: row.addedByName, todoSince: fromSqlDateTime(row.todoSince),
  dealId: row.leadId === null ? null : Number(row.leadId), decidedAt: fromSqlDateTime(row.decidedAt), decidedByName: row.decidedByName, reason: row.reason,
  dealOwnerName: row.dealOwnerName, dealStage: row.dealStage,
});

export async function buildLeadDashboard(viewer: UserAccount, scope: "mine" | "team", db: Queryable = getDatabasePool()): Promise<LeadDashboard> {
  const teamWide = scope === "team";
  const mine = teamWide ? "o.deleted_at IS NULL" : `(${mineClause} AND o.deleted_at IS NULL)`;
  const mineParams: unknown[] = teamWide ? [] : [viewer.id, viewer.id, viewer.id];
  const thisWeek = periodRange("this_week");
  const lastWeek = periodRange("last_week");
  const weeks = [toSqlDateTime(thisWeek.start), toSqlDateTime(thisWeek.end), toSqlDateTime(lastWeek.start), toSqlDateTime(lastWeek.end)];
  const inWeek = (column: string, which: 0 | 2) => `${column} >= '${weeks[which]}' AND ${column} < '${weeks[which + 1]}'`;
  const open = "o.status = 'new' AND o.archived_at IS NULL";
  const items = (where: string, params: unknown[], order: string, limit: number) =>
    db.query(`SELECT ${itemColumns} ${itemJoins} WHERE ${where} AND ${mine} ORDER BY ${order} LIMIT ?`, [...params, ...mineParams, limit]).then((result) => (result.rows as ItemRow[]).map(toItem));

  const [countRows, sourceRows, newest, generated, toBeVisited, waiting, converted] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${manualOrigin} AND ${inWeek("o.created_at", 0)})::int AS "addedThis", COUNT(*) FILTER (WHERE ${manualOrigin} AND ${inWeek("o.created_at", 2)})::int AS "addedLast",
         COUNT(*) FILTER (WHERE o.status IN ('converted', 'attached') AND ${inWeek("o.decided_at", 0)})::int AS "convertedThis",
         COUNT(*) FILTER (WHERE o.status IN ('converted', 'attached') AND ${inWeek("o.decided_at", 2)})::int AS "convertedLast",
         COUNT(*) FILTER (WHERE o.status = 'not_relevant' AND ${inWeek("o.decided_at", 0)})::int AS "notRelevantThis",
         COUNT(*) FILTER (WHERE o.status = 'not_relevant' AND ${inWeek("o.decided_at", 2)})::int AS "notRelevantLast",
         COUNT(*) FILTER (WHERE ${open})::int AS "open",
         COUNT(*) FILTER (WHERE ${open} AND ${manualOrigin})::int AS "openManual",
         COUNT(*) FILTER (WHERE o.todo_list_id IS NOT NULL AND o.archived_at IS NULL AND o.status IN ('new', 'not_relevant'))::int AS "onTodo",
         COUNT(*) FILTER (WHERE o.todo_list_id IS NOT NULL AND o.archived_at IS NULL AND o.status IN ('new', 'not_relevant') AND tl.code = 'to_be_visited')::int AS "toBeVisited"
       FROM opportunities o LEFT JOIN list_values tl ON tl.id = o.todo_list_id WHERE ${mine}`,
      mineParams,
    ),
    // Every active Lead Source gets a bar, with none counted too, in the list's order (request of November 20, 2026);
    // leads without a source come last.
    db.query(
      `SELECT label, count FROM (
         SELECT src.value AS label, COUNT(o.id)::int AS count, 0 AS grp, src.sort_order AS sort, src.id AS sid
         FROM list_values src LEFT JOIN opportunities o ON o.lead_type_id = src.id AND ${open} AND ${mine}
         WHERE src.list_key = 'lead_type' AND src.is_active GROUP BY src.id, src.value, src.sort_order
         UNION ALL
         SELECT CASE WHEN ${manualOrigin} THEN 'No source' ELSE 'Job searches' END, COUNT(*)::int, 1, 0, 0
         FROM opportunities o WHERE o.lead_type_id IS NULL AND ${open} AND ${mine} GROUP BY 1
       ) s ORDER BY grp, sort, sid, label`,
      [...mineParams, ...mineParams],
    ),
    items(`${open} AND ${manualOrigin}`, [], "o.created_at DESC, o.id DESC", 6),
    items(`${open} AND NOT ${manualOrigin}`, [], "o.created_at DESC, o.last_seen_at DESC, o.id DESC", 6),
    items(`o.archived_at IS NULL AND o.status IN ('new', 'not_relevant') AND o.todo_list_id IN (SELECT id FROM list_values WHERE list_key = 'todo_list' AND code = 'to_be_visited')`, [], "o.todo_since ASC NULLS LAST, o.id", 6),
    items(`${open} AND o.todo_list_id IS NULL`, [], "o.created_at ASC, o.id", 6),
    items("o.status IN ('converted', 'attached') AND o.decided_at IS NOT NULL", [], "o.decided_at DESC, o.id DESC", 8),
  ]);
  const counts = (countRows.rows as Record<string, number>[])[0] ?? {};
  const n = (key: string) => Number(counts[key] ?? 0);
  return {
    today: todayYmd(), teamWide,
    metrics: {
      added: { thisWeek: n("addedThis"), lastWeek: n("addedLast") },
      converted: { thisWeek: n("convertedThis"), lastWeek: n("convertedLast") },
      notRelevant: { thisWeek: n("notRelevantThis"), lastWeek: n("notRelevantLast") },
    },
    open: n("open"), openManual: n("openManual"), onTodo: n("onTodo"), toBeVisitedCount: n("toBeVisited"),
    sources: (sourceRows.rows as { label: string; count: number }[]).map((row) => ({ label: row.label, count: Number(row.count) })),
    newest, generated, toBeVisited, waiting, converted,
  };
}
