import { getDatabasePool, fromSqlDateTime, toSqlDateTime, type Queryable } from "@/lib/db";
import { addDaysYmd, businessDaysBetween, daysBetween, formatYmd, periodRange, startOfWeekYmd, startOfMonthYmd, todayYmd, zonedParts, type DateRange, type ReportPeriod } from "@/lib/dates";
import { selectLeads } from "@/features/leads/repository";
import type { LeadSummary } from "@/features/leads/model";
import { listTasks } from "@/features/tasks/repository";
import type { Task } from "@/features/tasks/model";
import { getSettings } from "@/features/settings/repository";
import { resolveTargetTemplate } from "@/features/targets/repository";
import type { TargetTemplate } from "@/features/targets/model";
import { listUsers } from "@/features/users/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import type { ActivityCounts, Dashboard, DrilldownMetric, PerformanceRow, TargetProgress } from "./model";

async function activityCounts(db: Queryable, userIds: number[] | null, range: DateRange): Promise<Map<number, ActivityCounts>> {
  const params: unknown[] = [toSqlDateTime(range.start), toSqlDateTime(range.end)];
  let userClause = "";
  if (userIds) {
    if (!userIds.length) return new Map();
    userClause = `AND user_id IN (${userIds.map(() => "?").join(",")})`;
    params.push(...userIds);
  }
  const [rows] = await db.query(
    `SELECT user_id AS userId, activity_type AS type, COUNT(*) AS count FROM lead_activities
     WHERE activity_type IN ('call', 'email', 'visit', 'note') AND occurred_at >= ? AND occurred_at < ? ${userClause}
     GROUP BY user_id, activity_type`,
    params,
  );
  const counts = new Map<number, ActivityCounts>();
  for (const row of rows as { userId: number; type: string; count: number }[]) {
    const entry = counts.get(Number(row.userId)) ?? { calls: 0, emails: 0, visits: 0, notes: 0 };
    if (row.type === "call") entry.calls = Number(row.count);
    if (row.type === "email") entry.emails = Number(row.count);
    if (row.type === "visit") entry.visits = Number(row.count);
    if (row.type === "note") entry.notes = Number(row.count);
    counts.set(Number(row.userId), entry);
  }
  return counts;
}

async function countBy(db: Queryable, sql: string, params: unknown[]): Promise<Map<number, number>> {
  const [rows] = await db.query(sql, params);
  const map = new Map<number, number>();
  for (const row of rows as { userId: number; count: number }[]) map.set(Number(row.userId), Number(row.count));
  return map;
}

const inList = (ids: number[]) => ids.map(() => "?").join(",");

function progressPercent(parts: { achieved: number; target: number }[]): number | null {
  const scored = parts.filter((part) => part.target > 0);
  if (!scored.length) return null;
  const total = scored.reduce((sum, part) => sum + Math.min(part.achieved / part.target, 1), 0);
  return Math.round((total / scored.length) * 100);
}

/** Targets scaled to the period: daily figures by business days, monthly conversions by calendar days. */
function scaledTargets(template: TargetTemplate | null, range: DateRange) {
  if (!template) return { leads: 0, visits: 0, conversions: 0 };
  const businessDays = Math.max(businessDaysBetween(range.startYmd, range.endExclusiveYmd), 1);
  const days = Math.max(daysBetween(range.startYmd, range.endExclusiveYmd), 1);
  const weeks = days / 7;
  return {
    leads: template.dailyLeads > 0 ? template.dailyLeads * businessDays : Math.round(template.weeklyLeads * weeks),
    visits: template.dailyVisits > 0 ? template.dailyVisits * businessDays : Math.round(template.weeklyVisits * weeks),
    conversions: Math.max(Math.round(template.monthlyConversions * (days / 30)), template.monthlyConversions > 0 ? 1 : 0),
  };
}

export async function performanceReport(period: ReportPeriod, viewer: UserAccount, userId: number | null): Promise<{ range: DateRange; rows: PerformanceRow[]; series: { date: string; calls: number; emails: number; visits: number; leads: number }[] }> {
  const db = getDatabasePool();
  const range = periodRange(period);
  const teamWide = hasPrivilege(viewer, "view_team_reports");
  let users = await listUsers({ includeInactive: true }, db);
  if (!teamWide) users = users.filter((user) => user.id === viewer.id);
  else if (userId) users = users.filter((user) => user.id === userId);
  else users = users.filter((user) => user.active && user.role !== "recruiter");
  const ids = users.map((user) => user.id);
  if (!ids.length) return { range, rows: [], series: [] };
  const startSql = toSqlDateTime(range.start);
  const endSql = toSqlDateTime(range.end);

  const activities = await activityCounts(db, ids, range);
  const leadsCreated = await countBy(db, `SELECT created_by AS userId, COUNT(*) AS count FROM leads WHERE created_at >= ? AND created_at < ? AND created_by IN (${inList(ids)}) GROUP BY created_by`, [startSql, endSql, ...ids]);
  const leadsUpdated = await countBy(db, `SELECT actor_id AS userId, COUNT(*) AS count FROM audit_log WHERE action = 'lead.updated' AND created_at >= ? AND created_at < ? AND actor_id IN (${inList(ids)}) GROUP BY actor_id`, [startSql, endSql, ...ids]);
  const conversions = await countBy(db, `SELECT user_id AS userId, COUNT(*) AS count FROM lead_activities WHERE activity_type = 'status_change' AND value_code = 'client' AND occurred_at >= ? AND occurred_at < ? AND user_id IN (${inList(ids)}) GROUP BY user_id`, [startSql, endSql, ...ids]);
  const tasksCreated = await countBy(db, `SELECT creator_id AS userId, COUNT(*) AS count FROM tasks WHERE created_at >= ? AND created_at < ? AND creator_id IN (${inList(ids)}) GROUP BY creator_id`, [startSql, endSql, ...ids]);
  const tasksCompleted = await countBy(db, `SELECT assignee_id AS userId, COUNT(*) AS count FROM tasks WHERE status = 'done' AND completed_at >= ? AND completed_at < ? AND assignee_id IN (${inList(ids)}) GROUP BY assignee_id`, [startSql, endSql, ...ids]);
  const files = await countBy(db, `SELECT uploaded_by AS userId, COUNT(*) AS count FROM lead_attachments WHERE created_at >= ? AND created_at < ? AND uploaded_by IN (${inList(ids)}) GROUP BY uploaded_by`, [startSql, endSql, ...ids]);
  const logins = await countBy(db, `SELECT user_id AS userId, COUNT(*) AS count FROM login_history WHERE succeeded = TRUE AND created_at >= ? AND created_at < ? AND user_id IN (${inList(ids)}) GROUP BY user_id`, [startSql, endSql, ...ids]);

  const rows: PerformanceRow[] = [];
  for (const user of users) {
    const activity = activities.get(user.id) ?? { calls: 0, emails: 0, visits: 0, notes: 0 };
    const template = await resolveTargetTemplate(user, db);
    const targets = scaledTargets(template, range);
    const achieved = { leads: leadsCreated.get(user.id) ?? 0, visits: activity.visits, conversions: conversions.get(user.id) ?? 0 };
    rows.push({
      userId: user.id, name: user.name, role: user.role, stage: user.stage,
      leadsCreated: achieved.leads, leadsUpdated: leadsUpdated.get(user.id) ?? 0,
      calls: activity.calls, emails: activity.emails, visits: activity.visits, notes: activity.notes,
      conversions: achieved.conversions, tasksCreated: tasksCreated.get(user.id) ?? 0, tasksCompleted: tasksCompleted.get(user.id) ?? 0,
      filesUploaded: files.get(user.id) ?? 0, logins: logins.get(user.id) ?? 0,
      targetPercent: progressPercent([
        { achieved: achieved.leads, target: targets.leads }, { achieved: achieved.visits, target: targets.visits }, { achieved: achieved.conversions, target: targets.conversions },
      ]),
      template: template?.name ?? null,
    });
  }
  rows.sort((a, b) => b.leadsCreated - a.leadsCreated || a.name.localeCompare(b.name));

  // Daily series bucketed in the business timezone.
  const [activityRows] = await db.query(
    `SELECT occurred_at AS occurredAt, activity_type AS type FROM lead_activities WHERE activity_type IN ('call', 'email', 'visit') AND occurred_at >= ? AND occurred_at < ? AND user_id IN (${inList(ids)})`,
    [startSql, endSql, ...ids],
  );
  const [leadRows] = await db.query(`SELECT created_at AS createdAt FROM leads WHERE created_at >= ? AND created_at < ? AND created_by IN (${inList(ids)})`, [startSql, endSql, ...ids]);
  const buckets = new Map<string, { date: string; calls: number; emails: number; visits: number; leads: number }>();
  for (let cursor = range.startYmd; cursor < range.endExclusiveYmd; cursor = addDaysYmd(cursor, 1)) buckets.set(cursor, { date: cursor, calls: 0, emails: 0, visits: 0, leads: 0 });
  const dayOf = (value: string) => { const parts = zonedParts(new Date(fromSqlDateTime(value) ?? value)); return formatYmd(parts.year, parts.month, parts.day); };
  for (const row of activityRows as { occurredAt: string; type: string }[]) {
    const bucket = buckets.get(dayOf(row.occurredAt));
    if (!bucket) continue;
    if (row.type === "call") bucket.calls += 1; else if (row.type === "email") bucket.emails += 1; else bucket.visits += 1;
  }
  for (const row of leadRows as { createdAt: string }[]) {
    const bucket = buckets.get(dayOf(row.createdAt));
    if (bucket) bucket.leads += 1;
  }
  return { range, rows, series: [...buckets.values()] };
}

export async function drilldown(period: ReportPeriod, viewer: UserAccount, userId: number, metric: DrilldownMetric): Promise<{ activities?: { id: number; leadId: number; leadName: string; summary: string; body: string | null; occurredAt: string }[]; leads?: LeadSummary[]; tasks?: Task[] }> {
  const db = getDatabasePool();
  const range = periodRange(period);
  const startSql = toSqlDateTime(range.start);
  const endSql = toSqlDateTime(range.end);
  if (metric === "leads") {
    return { leads: await selectLeads("l.created_by = ? AND l.created_at >= ? AND l.created_at < ?", [userId, startSql, endSql], "l.created_at DESC", 200, db) };
  }
  if (metric === "tasks") {
    return { tasks: (await listTasks({ assigneeId: userId, limit: 200 }, db)).filter((task) => task.createdAt >= range.start.toISOString() && task.createdAt < range.end.toISOString()) };
  }
  const typeClause = metric === "conversions" ? "a.activity_type = 'status_change' AND a.value_code = 'client'" : `a.activity_type = '${{ calls: "call", emails: "email", visits: "visit", notes: "note" }[metric]}'`;
  const [rows] = await db.query(
    `SELECT a.id, a.lead_id AS leadId, l.client_name AS leadName, a.summary, a.body, a.occurred_at AS occurredAt
     FROM lead_activities a JOIN leads l ON l.id = a.lead_id
     WHERE ${typeClause} AND a.user_id = ? AND a.occurred_at >= ? AND a.occurred_at < ? ORDER BY a.occurred_at DESC LIMIT 300`,
    [userId, startSql, endSql],
  );
  return {
    activities: (rows as { id: number; leadId: number; leadName: string; summary: string; body: string | null; occurredAt: string }[]).map((row) => ({
      id: Number(row.id), leadId: Number(row.leadId), leadName: row.leadName, summary: row.summary, body: row.body, occurredAt: fromSqlDateTime(row.occurredAt) ?? row.occurredAt,
    })),
  };
}

export async function buildDashboard(viewer: UserAccount, scope: "mine" | "team"): Promise<Dashboard> {
  const db = getDatabasePool();
  const teamWide = scope === "team" && hasPrivilege(viewer, "view_team_reports");
  const userIds = teamWide ? null : [viewer.id];
  const today = todayYmd();
  const thisWeek = periodRange("this_week");
  const lastWeek = periodRange("last_week");
  const sum = (counts: Map<number, ActivityCounts>, key: keyof ActivityCounts) => [...counts.values()].reduce((total, entry) => total + entry[key], 0);
  const thisCounts = await activityCounts(db, userIds, thisWeek);
  const lastCounts = await activityCounts(db, userIds, lastWeek);

  const ownerClause = teamWide ? "" : "AND l.owner_id = ?";
  const ownerParams = teamWide ? [] : [viewer.id];
  const followUps = {
    overdue: await selectLeads(`l.record_state = 'active' AND l.follow_up_date < ? ${ownerClause}`, [today, ...ownerParams], "l.follow_up_date ASC, l.id DESC", 50, db),
    today: await selectLeads(`l.record_state = 'active' AND l.follow_up_date = ? ${ownerClause}`, [today, ...ownerParams], "l.last_activity_at DESC", 50, db),
    tomorrow: await selectLeads(`l.record_state = 'active' AND l.follow_up_date = ? ${ownerClause}`, [addDaysYmd(today, 1), ...ownerParams], "l.last_activity_at DESC", 50, db),
  };

  const template = await resolveTargetTemplate(viewer, db);
  const monthRange = periodRange("month_to_date");
  const weekStart = startOfWeekYmd(today);
  const [weekLeads] = await db.query("SELECT COUNT(*) AS count FROM leads WHERE created_by = ? AND created_at >= ? AND created_at < ?", [viewer.id, toSqlDateTime(thisWeek.start), toSqlDateTime(thisWeek.end)]);
  const [monthConversions] = await db.query("SELECT COUNT(*) AS count FROM lead_activities WHERE user_id = ? AND activity_type = 'status_change' AND value_code = 'client' AND occurred_at >= ? AND occurred_at < ?", [viewer.id, toSqlDateTime(monthRange.start), toSqlDateTime(monthRange.end)]);
  const ownCounts = teamWide ? await activityCounts(db, [viewer.id], thisWeek) : thisCounts;
  const weekVisits = ownCounts.get(viewer.id)?.visits ?? 0;
  const targets: TargetProgress = {
    template,
    leads: { achieved: Number((weekLeads as { count: number }[])[0].count), target: template?.weeklyLeads ?? 0, label: `Leads this week (from ${weekStart})` },
    visits: { achieved: weekVisits, target: template?.weeklyVisits ?? 0, label: "Road visits this week" },
    conversions: { achieved: Number((monthConversions as { count: number }[])[0].count), target: template?.monthlyConversions ?? 0, label: `Conversions since ${startOfMonthYmd(today)}` },
    percent: null,
  };
  targets.percent = progressPercent([targets.leads, targets.visits, targets.conversions]);

  const settings = await getSettings(db);
  const inactiveSince = toSqlDateTime(new Date(Date.now() - settings.reminders.inactivityDays * 86_400_000));
  const inactiveLeads = await selectLeads(`l.record_state = 'active' AND l.last_activity_at < ? ${ownerClause}`, [inactiveSince, ...ownerParams], "l.last_activity_at ASC", 20, db);
  const openTasks = await listTasks({ assigneeId: teamWide ? undefined : viewer.id, status: "open", limit: 200 }, db);
  const nowIso = new Date().toISOString();
  const recentLeads = await selectLeads(`l.record_state = 'active' ${ownerClause}`, ownerParams, "l.last_activity_at DESC", 8, db);

  return {
    today,
    metrics: {
      calls: { thisWeek: sum(thisCounts, "calls"), lastWeek: sum(lastCounts, "calls") },
      emails: { thisWeek: sum(thisCounts, "emails"), lastWeek: sum(lastCounts, "emails") },
      visits: { thisWeek: sum(thisCounts, "visits"), lastWeek: sum(lastCounts, "visits") },
    },
    followUps,
    targets,
    inactiveLeads,
    inactivityDays: settings.reminders.inactivityDays,
    openTasks: openTasks.slice(0, 10),
    overdueTaskCount: openTasks.filter((task) => task.dueAt && task.dueAt < nowIso).length,
    recentLeads,
    teamWide,
  };
}
