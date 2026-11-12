import { getDatabasePool, fromSqlDateTime, toSqlDateTime, type Queryable } from "@/lib/db";
import { businessTimeZone, periodRange, startOfDayUtc, startOfWeekYmd, todayYmd, zonedParts, formatYmd, type CustomRange, type ReportPeriod } from "@/lib/dates";
import { selectLeads } from "@/features/leads/repository";
import type { LeadSummary } from "@/features/leads/model";
import { statusLabel } from "@/features/list-values/model";
import { resolveInactivityDays } from "@/features/settings/model";
import { getSettings } from "@/features/settings/repository";
import { listUsers } from "@/features/users/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import {
  bucketKindFor, buckets, closedCodes, median, percentile, spellsOf, stalledAssessment, statusSeries, summarizeTransitions,
  sortTeamBoard, type AnalyticsFilters, type AnalyticsReport, type BreakdownRow, type StalledLead, type StatusEvent, type TeamBoard, type TeamBoardMetric, type Transition,
} from "./model";

/** The Analytics screen's data (SPEC §7.16): one call builds every section for a period and a filter set. */

type LeadRow = {
  id: number; ownerId: number; ownerName: string; statusId: number; statusCode: string; status: string; statusReason: string | null; bdActionId: number | null; stageId: number | null;
  createdAt: string; lastActivityAt: string; followUpDate: string | null; recordState: string; industry: string; city: string | null; leadType: string | null; clientName: string;
};

/** WHERE clauses on `l` (leads) and `st` (its status) for the lead-based sections; archived leads are never counted. */
export function leadFilterSql(filters: AnalyticsFilters): { where: string; params: unknown[] } {
  const clauses = ["l.record_state <> 'archived'"];
  const params: unknown[] = [];
  const like = (value: string) => `%${value.toLowerCase()}%`;
  if (filters.ownerId) { clauses.push("l.owner_id = ?"); params.push(filters.ownerId); }
  if (filters.statusId) { clauses.push("l.status_id = ?"); params.push(filters.statusId); }
  if (filters.leadTypeId) { clauses.push("l.lead_type_id = ?"); params.push(filters.leadTypeId); }
  if (filters.cityId) { clauses.push("l.city_id = ?"); params.push(filters.cityId); }
  if (filters.industry) { clauses.push("LOWER(l.industry) LIKE ?"); params.push(like(filters.industry)); }
  if (filters.client) { clauses.push("LOWER(l.client_name) LIKE ?"); params.push(like(filters.client)); }
  if (filters.source === "pool") clauses.push("EXISTS (SELECT 1 FROM opportunities op WHERE op.lead_id = l.id)");
  if (filters.source === "other") clauses.push("NOT EXISTS (SELECT 1 FROM opportunities op WHERE op.lead_id = l.id)");
  if (filters.jobType) { clauses.push("EXISTS (SELECT 1 FROM opportunity_listings ol WHERE ol.lead_id = l.id AND LOWER(COALESCE(ol.employment_type, '')) LIKE ?)"); params.push(like(filters.jobType)); }
  return { where: clauses.join(" AND "), params };
}

const scopedFilters = (viewer: UserAccount, filters: AnalyticsFilters): { filters: AnalyticsFilters; teamWide: boolean } => {
  const teamWide = hasPrivilege(viewer, "view_team_reports");
  return { teamWide, filters: teamWide ? filters : { ...filters, ownerId: viewer.id } };
};

const dayOf = (value: string) => { const parts = zonedParts(new Date(fromSqlDateTime(value) ?? value)); return formatYmd(parts.year, parts.month, parts.day); };
const daysSince = (iso: string, nowMs: number) => Math.max(0, (nowMs - new Date(iso).getTime()) / 86_400_000);
const top = (map: Map<string, BreakdownRow>, limit = 10) => [...map.values()].sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label)).slice(0, limit);

export async function buildAnalytics(viewer: UserAccount, period: ReportPeriod, custom: CustomRange | null, requested: AnalyticsFilters): Promise<AnalyticsReport> {
  const db = getDatabasePool();
  const { filters, teamWide } = scopedFilters(viewer, requested);
  const settings = await getSettings(db);
  const holidays = settings.holidays.map((holiday) => holiday.date);
  const range = periodRange(period, undefined, undefined, holidays, custom);
  const startSql = toSqlDateTime(range.start);
  const endSql = toSqlDateTime(range.end);
  const now = new Date();
  const nowMs = now.getTime();
  const today = todayYmd(now);
  const timeZone = businessTimeZone();
  const { where, params } = leadFilterSql(filters);

  const [{ rows: statusRows }, { rows: leadRows }] = await Promise.all([
    db.query("SELECT code, value FROM list_values WHERE list_key = 'status' AND is_active = TRUE ORDER BY sort_order, id"),
    db.query(
      `SELECT l.id, l.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName", l.status_id AS "statusId", st.code AS "statusCode", st.value AS status, sr.value AS "statusReason",
         l.bd_action_id AS "bdActionId", l.stage_id AS "stageId", l.created_at AS "createdAt", l.last_activity_at AS "lastActivityAt", l.follow_up_date AS "followUpDate", l.record_state AS "recordState",
         l.industry, ci.value AS city, lt.value AS "leadType", l.client_name AS "clientName"
       FROM leads l JOIN list_values st ON st.id = l.status_id JOIN users o ON o.id = l.owner_id
       LEFT JOIN list_values sr ON sr.id = l.status_reason_id LEFT JOIN list_values ci ON ci.id = l.city_id LEFT JOIN list_values lt ON lt.id = l.lead_type_id
       WHERE ${where}`,
      params,
    ),
  ]);
  const statuses = (statusRows as { code: string; value: string }[]).map((row) => ({ code: row.code, label: row.value }));
  const codes = statuses.map((status) => status.code);
  const labelOf = (code: string) => statuses.find((status) => status.code === code)?.label ?? code;
  const leads = (leadRows as LeadRow[]).map((row) => ({
    ...row, id: Number(row.id), ownerId: Number(row.ownerId), statusId: Number(row.statusId), bdActionId: row.bdActionId === null ? null : Number(row.bdActionId), stageId: row.stageId === null || row.stageId === undefined ? null : Number(row.stageId),
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt, lastActivityAt: fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt,
    followUpDate: row.followUpDate ? String(row.followUpDate).slice(0, 10) : null,
  }));
  const ids = leads.map((lead) => lead.id);

  // Status history of the filtered leads: the created entry carries the first status, each status_change the next one.
  type EventRow = { leadId: number; at: string; type: string; code: string | null; meta: Record<string, unknown> | string | null; userId: number | null };
  const events = ids.length
    ? ((await db.query(`SELECT lead_id AS "leadId", occurred_at AS at, activity_type AS type, value_code AS code, meta, user_id AS "userId" FROM lead_activities WHERE activity_type IN ('created', 'status_change') AND lead_id = ANY(?) ORDER BY occurred_at, id`, [ids])).rows as EventRow[])
      .map((row) => { let meta: Record<string, unknown> = {}; if (typeof row.meta === "string") { try { meta = JSON.parse(row.meta) as Record<string, unknown>; } catch { meta = {}; } } else if (row.meta) meta = row.meta; return { ...row, leadId: Number(row.leadId), at: fromSqlDateTime(row.at) ?? row.at, meta }; })
    : [];
  const initialCode = new Map<number, string>();
  const changes: StatusEvent[] = [];
  const transitions: (Transition & { at: string; leadId: number })[] = [];
  const perLead = new Map<number, { at: string; code: string }[]>();
  for (const event of events) {
    const list = perLead.get(event.leadId) ?? [];
    if (!perLead.has(event.leadId)) perLead.set(event.leadId, list);
    if (event.type === "created") {
      const code = event.code ?? "";
      if (!initialCode.has(event.leadId) && code) { initialCode.set(event.leadId, code); list.push({ at: event.at, code }); }
      continue;
    }
    const toCode = (typeof event.meta.toCode === "string" ? event.meta.toCode : event.code) ?? "";
    const fromCode = typeof event.meta.fromCode === "string" ? event.meta.fromCode : "";
    if (!toCode || !fromCode) continue; // a reason-only update keeps the status
    changes.push({ leadId: event.leadId, at: event.at, code: toCode });
    list.push({ at: event.at, code: toCode });
    transitions.push({ fromCode, toCode, reason: typeof event.meta.toReason === "string" ? event.meta.toReason : null, at: event.at, leadId: event.leadId });
  }
  const leadInfo = new Map(leads.map((lead) => [lead.id, lead]));

  // Pipeline now
  const byStatusCount = new Map<string, number>();
  const byOwnerMap = new Map<number, { ownerId: number; name: string; counts: Record<string, number>; total: number }>();
  for (const lead of leads) {
    byStatusCount.set(lead.statusCode, (byStatusCount.get(lead.statusCode) ?? 0) + 1);
    const owner = byOwnerMap.get(lead.ownerId) ?? { ownerId: lead.ownerId, name: lead.ownerName, counts: Object.fromEntries(codes.map((code) => [code, 0])), total: 0 };
    if (!byOwnerMap.has(lead.ownerId)) byOwnerMap.set(lead.ownerId, owner);
    owner.counts[lead.statusCode] = (owner.counts[lead.statusCode] ?? 0) + 1;
    owner.total += 1;
  }

  // Status over time
  const bucketKind = bucketKindFor(range.startYmd, range.endExclusiveYmd);
  const bucketList = buckets(range.startYmd, range.endExclusiveYmd, bucketKind);
  const bucketEnds = bucketList.map((bucket, index) => ({ label: bucket.start, endIso: index === bucketList.length - 1 ? range.end.toISOString() : startOfDayUtc(bucket.endExclusive, timeZone).toISOString() }));
  const statusOverTime = statusSeries(leads.map((lead) => ({ id: lead.id, createdAt: lead.createdAt, initialCode: initialCode.get(lead.id) ?? lead.statusCode })), changes, bucketEnds, codes);

  // Movement in the period
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();
  const inRange = transitions.filter((transition) => transition.at >= startIso && transition.at < endIso);
  const movement = summarizeTransitions(inRange);
  const movementByOwner = new Map<number, { ownerId: number; name: string; toWarm: number; toHot: number; toClient: number; lost: number; disqualified: number }>();
  for (const transition of inRange) {
    const lead = leadInfo.get(transition.leadId);
    if (!lead) continue;
    const row = movementByOwner.get(lead.ownerId) ?? { ownerId: lead.ownerId, name: lead.ownerName, toWarm: 0, toHot: 0, toClient: 0, lost: 0, disqualified: 0 };
    if (!movementByOwner.has(lead.ownerId)) movementByOwner.set(lead.ownerId, row);
    if (transition.toCode === "warm") row.toWarm += 1;
    if (transition.toCode === "hot") row.toHot += 1;
    if (transition.toCode === "client") row.toClient += 1;
    if (transition.toCode === "lost") row.lost += 1;
    if (transition.toCode === "disqualified") row.disqualified += 1;
  }

  // Time in status: completed stays that ended in the period
  const spellsByCode = new Map<string, number[]>();
  for (const list of perLead.values()) {
    for (const spell of spellsOf(list)) {
      if (spell.endedAt < startIso || spell.endedAt >= endIso) continue;
      const values = spellsByCode.get(spell.code) ?? [];
      if (!spellsByCode.has(spell.code)) spellsByCode.set(spell.code, values);
      values.push(spell.days);
    }
  }
  const timeInStatus = codes.filter((code) => !closedCodes.includes(code) && code !== "client").map((code) => {
    const values = spellsByCode.get(code) ?? [];
    return { code, label: labelOf(code), medianDays: median(values), p75Days: percentile(values, 0.75), samples: values.length };
  });

  // Stalled leads (TASK-05 rules decide the allowed days per status)
  const stalledLeads: StalledLead[] = [];
  for (const lead of leads) {
    if (lead.recordState !== "active" || closedCodes.includes(lead.statusCode) || lead.statusCode === "client") continue;
    const history = perLead.get(lead.id) ?? [];
    const sinceIso = history.length ? history[history.length - 1].at : lead.createdAt;
    const allowedDays = resolveInactivityDays({ statusId: lead.statusId, bdActionId: lead.bdActionId, stageId: lead.stageId }, settings.reminders);
    const overdueDays = lead.followUpDate && lead.followUpDate < today ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${lead.followUpDate}T00:00:00Z`).getTime()) / 86_400_000) : null;
    const input = { statusCode: lead.statusCode, daysInStatus: daysSince(sinceIso, nowMs), daysSinceActivity: daysSince(lead.lastActivityAt, nowMs), overdueDays };
    const assessment = stalledAssessment(input, allowedDays);
    if (!assessment) continue;
    stalledLeads.push({
      id: lead.id, clientName: lead.clientName, ownerId: lead.ownerId, ownerName: lead.ownerName, statusCode: lead.statusCode, statusLabel: statusLabel(lead.status, lead.statusReason),
      daysInStatus: Math.round(input.daysInStatus), allowedDays, daysSinceActivity: Math.round(input.daysSinceActivity), followUpDate: lead.followUpDate, overdueDays, score: assessment.score, reasons: assessment.reasons,
    });
  }
  stalledLeads.sort((a, b) => b.score - a.score || a.clientName.localeCompare(b.clientName));

  // Opportunity pool in the period (shared pool: the owner filter narrows who assigned)
  const assignedBy = filters.ownerId ? " AND decided_by = ?" : "";
  const assignedParams = filters.ownerId ? [filters.ownerId] : [];
  const [runs, assigned, notRelevant, attached, byJobType] = await Promise.all([
    db.query('SELECT started_at AS "startedAt", listings_found AS "listingsFound", new_companies AS "newCompanies", attached FROM opportunity_runs WHERE started_at >= ? AND started_at < ? ORDER BY started_at', [startSql, endSql]).then((result) => result.rows as { startedAt: string; listingsFound: number; newCompanies: number; attached: number }[]),
    db.query(`SELECT COUNT(*)::int AS count, percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - first_seen_at)) / 3600) AS hours FROM opportunities WHERE status = 'converted' AND decided_at >= ? AND decided_at < ?${assignedBy}`, [startSql, endSql, ...assignedParams]).then((result) => (result.rows as { count: number; hours: number | null }[])[0]),
    db.query(`SELECT COUNT(*)::int AS count FROM opportunities WHERE status = 'not_relevant' AND decided_at >= ? AND decided_at < ?${assignedBy}`, [startSql, endSql, ...assignedParams]).then((result) => Number((result.rows as { count: number }[])[0]?.count ?? 0)),
    db.query("SELECT COUNT(*)::int AS count FROM opportunities WHERE status = 'attached' AND last_seen_at >= ? AND last_seen_at < ?", [startSql, endSql]).then((result) => Number((result.rows as { count: number }[])[0]?.count ?? 0)),
    db.query(
      `SELECT COALESCE(NULLIF(ol.employment_type, ''), 'Unspecified') AS type, COUNT(DISTINCT ol.opportunity_id)::int AS companies, COUNT(DISTINCT CASE WHEN o.status = 'converted' THEN ol.opportunity_id END)::int AS assigned
       FROM opportunity_listings ol JOIN opportunities o ON o.id = ol.opportunity_id WHERE ol.first_seen_at >= ? AND ol.first_seen_at < ? GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`,
      [startSql, endSql],
    ).then((result) => (result.rows as { type: string; companies: number; assigned: number }[]).map((row) => ({ type: row.type, companies: Number(row.companies), assigned: Number(row.assigned) }))),
  ]);
  const pool = {
    totals: {
      found: runs.reduce((sum, run) => sum + Number(run.listingsFound), 0), newCompanies: runs.reduce((sum, run) => sum + Number(run.newCompanies), 0),
      assigned: Number(assigned?.count ?? 0), notRelevant, attached, medianHoursToAssign: assigned?.hours === null || assigned?.hours === undefined ? null : Math.round(Number(assigned.hours) * 10) / 10,
    },
    runs: runs.map((run) => ({ date: dayOf(run.startedAt), listingsFound: Number(run.listingsFound), newCompanies: Number(run.newCompanies), attached: Number(run.attached) })),
    byJobType,
  };

  // Breakdown of the current leads
  const industries = new Map<string, BreakdownRow>();
  const cities = new Map<string, BreakdownRow>();
  const leadTypes = new Map<string, BreakdownRow>();
  const bump = (map: Map<string, BreakdownRow>, rawLabel: string, isClient: boolean) => {
    const key = rawLabel.trim().toLowerCase() || "(not set)";
    const row = map.get(key) ?? { label: rawLabel.trim() || "Not set", leads: 0, clients: 0 };
    if (!map.has(key)) map.set(key, row);
    row.leads += 1;
    if (isClient) row.clients += 1;
  };
  for (const lead of leads) {
    const isClient = lead.statusCode === "client";
    bump(industries, lead.industry, isClient);
    bump(cities, lead.city ?? "", isClient);
    bump(leadTypes, lead.leadType ?? "", isClient);
  }
  const topClientRows = ids.length
    ? ((await db.query(`SELECT lead_id AS "leadId", COUNT(*)::int AS count FROM lead_activities WHERE activity_type IN ('call', 'email', 'visit', 'note') AND occurred_at >= ? AND occurred_at < ? AND lead_id = ANY(?) GROUP BY lead_id ORDER BY 2 DESC LIMIT 10`, [startSql, endSql, ids])).rows as { leadId: number; count: number }[])
    : [];
  const topClients = topClientRows.flatMap((row) => { const lead = leadInfo.get(Number(row.leadId)); return lead ? [{ leadId: lead.id, clientName: lead.clientName, ownerName: lead.ownerName, statusLabel: statusLabel(lead.status, lead.statusReason), activities: Number(row.count) }] : []; });

  // Leaderboard
  const people = (await listUsers({}, db)).filter((person) => person.active && person.role !== "recruiter" && (!filters.ownerId || person.id === filters.ownerId));
  const personIds = people.map((person) => person.id);
  const countMap = async (sql: string, extra: unknown[] = []) => {
    if (!personIds.length) return new Map<number, number>();
    const { rows } = await db.query(sql, [...extra, personIds]);
    return new Map((rows as { userId: number; count: number }[]).map((row) => [Number(row.userId), Number(row.count)]));
  };
  const [created, conversions, activities, overdue, taken] = await Promise.all([
    countMap('SELECT created_by AS "userId", COUNT(*)::int AS count FROM leads WHERE created_at >= ? AND created_at < ? AND created_by = ANY(?) GROUP BY created_by', [startSql, endSql]),
    countMap(`SELECT user_id AS "userId", COUNT(*)::int AS count FROM lead_activities WHERE activity_type = 'status_change' AND value_code = 'client' AND occurred_at >= ? AND occurred_at < ? AND user_id = ANY(?) GROUP BY user_id`, [startSql, endSql]),
    countMap(`SELECT user_id AS "userId", COUNT(*)::int AS count FROM lead_activities WHERE activity_type IN ('call', 'email', 'visit', 'note') AND occurred_at >= ? AND occurred_at < ? AND user_id = ANY(?) GROUP BY user_id`, [startSql, endSql]),
    countMap(`SELECT owner_id AS "userId", COUNT(*)::int AS count FROM leads WHERE record_state = 'active' AND follow_up_date < ? AND owner_id = ANY(?) GROUP BY owner_id`, [today]),
    countMap(`SELECT decided_by AS "userId", COUNT(*)::int AS count FROM opportunities WHERE status = 'converted' AND decided_at >= ? AND decided_at < ? AND decided_by = ANY(?) GROUP BY decided_by`, [startSql, endSql]),
  ]);
  const leaderboard = people.map((person) => ({
    ownerId: person.id, name: person.name, leadsCreated: created.get(person.id) ?? 0, conversions: conversions.get(person.id) ?? 0, activities: activities.get(person.id) ?? 0,
    overdueFollowUps: overdue.get(person.id) ?? 0, opportunitiesTaken: taken.get(person.id) ?? 0,
  })).sort((a, b) => b.conversions - a.conversions || b.leadsCreated - a.leadsCreated || a.name.localeCompare(b.name));

  return {
    range: { startYmd: range.startYmd, endExclusiveYmd: range.endExclusiveYmd },
    bucketKind,
    teamWide,
    statuses,
    pipeline: { total: leads.length, byStatus: statuses.map((status) => ({ ...status, count: byStatusCount.get(status.code) ?? 0 })), byOwner: [...byOwnerMap.values()].sort((a, b) => b.total - a.total) },
    statusOverTime,
    movement: { ...movement, byOwner: [...movementByOwner.values()].sort((a, b) => b.toClient - a.toClient || b.toHot - a.toHot) },
    timeInStatus,
    stalled: { total: stalledLeads.length, leads: stalledLeads.slice(0, 100) },
    pool,
    breakdown: { industries: top(industries), cities: top(cities), leadTypes: top(leadTypes), topClients },
    leaderboard,
  };
}

/** The leads behind a chart segment: the same filters, narrowed to a status and/or an owner (drill-down). */
export async function listAnalyticsLeads(viewer: UserAccount, requested: AnalyticsFilters, statusCode: string | null, ownerId: number | null, db: Queryable = getDatabasePool()): Promise<LeadSummary[]> {
  const { filters } = scopedFilters(viewer, requested);
  const { where, params } = leadFilterSql(ownerId ? { ...filters, ownerId } : filters);
  const clauses = [where];
  if (statusCode) { clauses.push("st.code = ?"); params.push(statusCode); }
  return selectLeads(clauses.join(" AND "), params, "l.last_activity_at DESC", 200, db);
}

// ---------------------------------------------------------------------------------------------------------------------
// Team board (one row per salesperson, as things stand now)

/** The Action Center's "needs attention" rule: quiet for longer than the status/action allows (TASK-05). */
const quietClause = "l.record_state = 'active' AND st.code NOT IN ('lost', 'disqualified')";
const repliesClause = "l.record_state = 'active' AND l.last_client_email_at IS NOT NULL AND l.last_client_email_at > COALESCE(l.last_team_email_at, '1970-01-01'::timestamp) AND l.last_client_email_at > l.last_activity_at";

type QuietRow = { id: number; ownerId: number; statusId: number; bdActionId: number | null; stageId: number | null; lastActivityAt: string };

async function quietCandidates(db: Queryable, ownerIds: number[], shortestDays: number, nowMs: number): Promise<QuietRow[]> {
  if (!ownerIds.length) return [];
  const { rows } = await db.query(
    `SELECT l.id, l.owner_id AS "ownerId", l.status_id AS "statusId", l.bd_action_id AS "bdActionId", l.stage_id AS "stageId", l.last_activity_at AS "lastActivityAt"
     FROM leads l JOIN list_values st ON st.id = l.status_id WHERE ${quietClause} AND l.last_activity_at < ? AND l.owner_id = ANY(?)`,
    [toSqlDateTime(new Date(nowMs - shortestDays * 86_400_000)), ownerIds],
  );
  return (rows as QuietRow[]).map((row) => ({ ...row, id: Number(row.id), ownerId: Number(row.ownerId), statusId: Number(row.statusId), bdActionId: row.bdActionId === null ? null : Number(row.bdActionId), stageId: row.stageId === null || row.stageId === undefined ? null : Number(row.stageId), lastActivityAt: fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt }));
}

const isStalled = (lead: { statusId: number; bdActionId: number | null; stageId?: number | null; lastActivityAt: string }, reminders: Parameters<typeof resolveInactivityDays>[1], nowMs: number) =>
  new Date(lead.lastActivityAt).getTime() < nowMs - resolveInactivityDays(lead, reminders) * 86_400_000;

/** Who the board shows: every active non-recruiter for team-report viewers, only the viewer otherwise. */
async function boardPeople(viewer: UserAccount, db: Queryable): Promise<UserAccount[]> {
  const people = (await listUsers({}, db)).filter((person) => person.active && person.role !== "recruiter");
  return hasPrivilege(viewer, "view_team_reports") ? people : people.filter((person) => person.id === viewer.id);
}

/** The team board: counts per salesperson now (active, overdue, stalled, replies waiting), this week's activity, and when each person last did anything. */
export async function buildTeamBoard(viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<TeamBoard> {
  const people = await boardPeople(viewer, db);
  const ids = people.map((person) => person.id);
  const settings = await getSettings(db);
  const today = todayYmd();
  const weekStartYmd = startOfWeekYmd(today);
  const week = periodRange("this_week", undefined, undefined, settings.holidays.map((holiday) => holiday.date));
  const nowMs = Date.now();
  const countMap = async (sql: string, extra: unknown[] = []) => {
    if (!ids.length) return new Map<number, number>();
    const { rows } = await db.query(sql, [...extra, ids]);
    return new Map((rows as { userId: number; count: number }[]).map((row) => [Number(row.userId), Number(row.count)]));
  };
  const shortest = Math.min(settings.reminders.inactivityDays, ...settings.reminders.rules.map((rule) => rule.days));
  const [active, overdue, replies, created, activity, lastActivity, quiet] = await Promise.all([
    countMap('SELECT owner_id AS "userId", COUNT(*)::int AS count FROM leads WHERE record_state = \'active\' AND owner_id = ANY(?) GROUP BY owner_id'),
    countMap('SELECT owner_id AS "userId", COUNT(*)::int AS count FROM leads WHERE record_state = \'active\' AND follow_up_date < ? AND owner_id = ANY(?) GROUP BY owner_id', [today]),
    countMap(`SELECT l.owner_id AS "userId", COUNT(*)::int AS count FROM leads l WHERE ${repliesClause} AND l.owner_id = ANY(?) GROUP BY l.owner_id`),
    countMap('SELECT created_by AS "userId", COUNT(*)::int AS count FROM leads WHERE created_at >= ? AND created_at < ? AND created_by = ANY(?) GROUP BY created_by', [toSqlDateTime(week.start), toSqlDateTime(week.end)]),
    ids.length ? db.query(
      `SELECT user_id AS "userId", SUM(CASE WHEN activity_type = 'call' THEN 1 ELSE 0 END)::int AS calls, SUM(CASE WHEN activity_type = 'email' THEN 1 ELSE 0 END)::int AS emails, SUM(CASE WHEN activity_type = 'visit' THEN 1 ELSE 0 END)::int AS visits
       FROM lead_activities WHERE occurred_at >= ? AND occurred_at < ? AND user_id = ANY(?) GROUP BY user_id`,
      [toSqlDateTime(week.start), toSqlDateTime(week.end), ids],
    ).then((result) => new Map((result.rows as { userId: number; calls: number; emails: number; visits: number }[]).map((row) => [Number(row.userId), { calls: Number(row.calls), emails: Number(row.emails), visits: Number(row.visits) }]))) : new Map<number, { calls: number; emails: number; visits: number }>(),
    ids.length ? db.query('SELECT user_id AS "userId", MAX(occurred_at) AS "lastAt" FROM lead_activities WHERE user_id = ANY(?) GROUP BY user_id', [ids])
      .then((result) => new Map((result.rows as { userId: number; lastAt: string }[]).map((row) => [Number(row.userId), fromSqlDateTime(row.lastAt)]))) : new Map<number, string | null>(),
    quietCandidates(db, ids, shortest, nowMs),
  ]);
  const stalled = new Map<number, number>();
  for (const lead of quiet) if (isStalled(lead, settings.reminders, nowMs)) stalled.set(lead.ownerId, (stalled.get(lead.ownerId) ?? 0) + 1);
  const rows = people.map((person) => ({
    userId: person.id, name: person.name, role: person.role,
    activeLeads: active.get(person.id) ?? 0, overdueFollowUps: overdue.get(person.id) ?? 0, stalled: stalled.get(person.id) ?? 0, repliesWaiting: replies.get(person.id) ?? 0,
    calls: activity.get(person.id)?.calls ?? 0, emails: activity.get(person.id)?.emails ?? 0, visits: activity.get(person.id)?.visits ?? 0, leadsCreated: created.get(person.id) ?? 0,
    lastActivityAt: lastActivity.get(person.id) ?? null,
  }));
  return { weekStartYmd, rows: sortTeamBoard(rows) };
}

/** The leads behind one number of the board; a non-team viewer only sees their own. */
export async function teamBoardLeads(viewer: UserAccount, userId: number, metric: TeamBoardMetric, db: Queryable = getDatabasePool()): Promise<LeadSummary[]> {
  if (!hasPrivilege(viewer, "view_team_reports") && userId !== viewer.id) return [];
  const today = todayYmd();
  if (metric === "active") return selectLeads("l.record_state = 'active' AND l.owner_id = ?", [userId], "l.last_activity_at DESC", 200, db);
  if (metric === "overdue") return selectLeads("l.record_state = 'active' AND l.follow_up_date < ? AND l.owner_id = ?", [today, userId], "l.follow_up_date ASC, l.id DESC", 200, db);
  if (metric === "replies") return selectLeads(`${repliesClause} AND l.owner_id = ?`, [userId], "l.last_client_email_at DESC", 200, db);
  const settings = await getSettings(db);
  const nowMs = Date.now();
  const shortest = Math.min(settings.reminders.inactivityDays, ...settings.reminders.rules.map((rule) => rule.days));
  const candidates = await selectLeads(`${quietClause} AND l.last_activity_at < ? AND l.owner_id = ?`, [toSqlDateTime(new Date(nowMs - shortest * 86_400_000)), userId], "l.last_activity_at ASC", 500, db);
  return candidates.filter((lead) => isStalled(lead, settings.reminders, nowMs)).slice(0, 200);
}
