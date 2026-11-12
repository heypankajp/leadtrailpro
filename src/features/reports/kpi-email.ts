import { getDatabasePool, insertId, toSqlDateTime, type Queryable } from "@/lib/db";
import { addDaysYmd, businessTimeZone, formatYmd, todayYmd, zonedParts } from "@/lib/dates";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { recordAudit } from "@/features/audit/repository";
import { buildTeamBoard } from "@/features/analytics/repository";
import { getSettings, listHolidayDates } from "@/features/settings/repository";
import type { UserAccount } from "@/features/users/model";
import { listUsers, listUsersWithPrivilege } from "@/features/users/repository";
import { formatKpiHtml, formatKpiText, hasKpiActivity, isKpiReportDue, kpiActivityPeriod, kpiActivityTotals, kpiJobName, kpiPeriodKey, kpiPeriodLabel, kpiReportKinds, kpiReportLabels, kpiSubject, kpiTotals, type KpiActivityRow, type KpiReportData, type KpiReportKind, type KpiRow, type KpiStatus } from "./kpi-model";
import { performanceReport } from "./repository";

/**
 * The KPI report emails to administrators (SPEC §7.18): where every Sales Manager's leads stand when the report is
 * built (how many, by status, what is waiting on the person), the totals, and the pipeline by stage; the weekly and
 * monthly reports add what was recorded in the last completed week or month. `runKpiReports` is called by the
 * scheduler (POST /api/jobs/run) every minute and sends each report once per period, claimed through `job_runs`;
 * an administrator can also send one to themselves at once from Settings.
 */

export type KpiRunResult = { job: string; kind: KpiReportKind; periodKey: string; recipients: number; failures: number };

const reportsLink = () => { const base = process.env.APP_URL?.trim(); return base ? `${base.replace(/\/$/, "")}/#/reports` : null; };

/**
 * The numbers. Listed: every active Sales Manager, and anyone else who owns a lead (an administrator, an account since
 * switched off), so the totals row covers every lead that is neither archived nor deleted.
 */
export async function buildKpiReport(kind: KpiReportKind, viewer: UserAccount, db: Queryable = getDatabasePool(), now = new Date()): Promise<KpiReportData> {
  const period = kpiActivityPeriod[kind];
  const [users, statusRows, stageRows, report] = await Promise.all([
    listUsers({ includeInactive: true }, db),
    db.query(`SELECT l.owner_id AS "ownerId", s.id AS "statusId", s.value AS label, COUNT(*)::int AS count
      FROM leads l JOIN list_values s ON s.id = l.status_id WHERE l.record_state = 'active' GROUP BY l.owner_id, s.id, s.value, s.sort_order ORDER BY s.sort_order, s.id`),
    // PIPE-12: the board's population by stage; a lead never placed counts in New Deal.
    db.query(`SELECT COALESCE(sg.value, 'New Deal') AS label, MIN(COALESCE(sg.sort_order, 0)) AS ord, COUNT(*)::int AS count
      FROM leads l JOIN list_values st ON st.id = l.status_id LEFT JOIN list_values sg ON sg.id = l.stage_id
      WHERE l.record_state = 'active' AND st.code NOT IN ('client', 'lost', 'disqualified') GROUP BY 1 ORDER BY ord, 1`),
    period ? performanceReport(period, viewer, null) : null,
  ]);
  const statuses: KpiStatus[] = [];
  const byOwner = new Map<number, Record<string, number>>();
  for (const row of statusRows.rows as { ownerId: number; statusId: number; label: string; count: number }[]) {
    const key = String(row.statusId);
    if (!statuses.some((status) => status.key === key)) statuses.push({ key, label: row.label });
    const counts = byOwner.get(Number(row.ownerId)) ?? {};
    counts[key] = Number(row.count);
    byOwner.set(Number(row.ownerId), counts);
  }
  const people = users.filter((person) => (person.active && person.role === "sales_manager") || byOwner.has(person.id));
  const board = await buildTeamBoard(viewer, db, people);
  const current = new Map(board.rows.map((row) => [row.userId, row]));
  const rows: KpiRow[] = people.map((person) => {
    const byStatus = byOwner.get(person.id) ?? {};
    const state = current.get(person.id);
    return {
      userId: person.id, name: person.active ? person.name : `${person.name} (inactive)`, role: person.role,
      leads: Object.values(byStatus).reduce((sum, value) => sum + value, 0), byStatus,
      overdueFollowUps: state?.overdueFollowUps ?? 0, stalled: state?.stalled ?? 0, repliesWaiting: state?.repliesWaiting ?? 0,
    };
  }).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
  const activityRows: KpiActivityRow[] = (report?.rows ?? []).map((row) => ({
    userId: row.userId, name: row.name, role: row.role,
    leadsCreated: row.leadsCreated, leadsUpdated: row.leadsUpdated, calls: row.calls, emails: row.emails, visits: row.visits, notes: row.notes, conversions: row.conversions, tasksCompleted: row.tasksCompleted, targetPercent: row.targetPercent,
  }));
  const timeZone = businessTimeZone();
  const at = zonedParts(now, timeZone);
  return {
    kind, asOf: `${formatYmd(at.year, at.month, at.day)} ${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`, timeZone,
    statuses, rows, totals: kpiTotals(rows),
    pipelineByStage: (stageRows.rows as { label: string; count: number }[]).map((stage) => ({ label: stage.label, count: Number(stage.count) })),
    activity: report ? { periodLabel: kpiPeriodLabel(report.range.startYmd, addDaysYmd(report.range.endExclusiveYmd, -1)), rows: activityRows.filter(hasKpiActivity), totals: kpiActivityTotals(activityRows) } : null,
    appUrl: reportsLink(),
  };
}

/**
 * Sends the reports that are due (or the one forced, to the caller only). A scheduled run claims its period first so
 * several schedulers or a retry cannot send twice; when no mail delivery is configured nothing is claimed, so the
 * period is still sent once delivery is set up the same day.
 */
export async function runKpiReports(options: { force?: KpiReportKind | null; onlyUserId?: number | null; actorId?: number | null } = {}, now = new Date()): Promise<KpiRunResult[]> {
  const db = getDatabasePool();
  const settings = await getSettings(db);
  const timeZone = businessTimeZone();
  const today = todayYmd(now, timeZone);
  const holidays = options.force ? [] : await listHolidayDates(db);
  const kinds = options.force ? [options.force] : kpiReportKinds.filter((kind) => settings.email.kpiReports[kind] && isKpiReportDue(kind, settings.digests, now, timeZone, today, holidays));
  const ran: KpiRunResult[] = [];
  if (!kinds.length || (!options.force && !isMailerConfigured())) return ran;
  for (const kind of kinds) {
    const periodKey = options.force ? `manual-${now.toISOString().slice(0, 19)}-${options.actorId ?? 0}` : kpiPeriodKey(kind, today);
    const claim = await db.query("INSERT INTO job_runs (job, period_key, status, started_at) VALUES (?, ?, 'running', ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id", [kpiJobName(kind), periodKey, toSqlDateTime(now)]);
    if (!claim.rowCount) continue;
    const runId = insertId(claim);
    const admins = (await listUsersWithPrivilege("manage_settings", db)).filter((person) => person.active && (!options.onlyUserId || person.id === options.onlyUserId));
    let recipients = 0;
    let failures = 0;
    if (admins.length && isMailerConfigured()) {
      const data = await buildKpiReport(kind, admins[0], db, now);
      const subject = kpiSubject(data);
      const text = formatKpiText(data);
      const html = formatKpiHtml(data);
      for (const admin of admins) {
        try { await sendMail({ to: admin.email, subject, text, html }); recipients += 1; } catch (error) { failures += 1; console.error(`${kind} KPI report to ${admin.email} failed.`, error instanceof Error ? error.message : error); }
      }
    }
    const status = failures === 0 ? "success" : recipients ? "partial" : "failed";
    await db.query("UPDATE job_runs SET status = ?, finished_at = ?, details = ? WHERE id = ?", [status, toSqlDateTime(new Date()), `${recipients} recipient(s), ${failures} failure(s)`, runId]);
    await recordAudit(db, {
      actorId: options.actorId ?? null, action: "report.kpi", entityType: "job", entityId: runId, after: { kind, periodKey, recipients, failures, status },
      details: `${kpiReportLabels[kind]} KPI report ${status}: ${recipients} recipient(s), ${failures} failure(s)${options.force ? " (sent on demand)" : ""}`,
    });
    ran.push({ job: kpiJobName(kind), kind, periodKey, recipients, failures });
  }
  return ran;
}
