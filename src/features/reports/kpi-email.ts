import { getDatabasePool, insertId, toSqlDateTime, type Queryable } from "@/lib/db";
import { addDaysYmd, businessTimeZone, todayYmd } from "@/lib/dates";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { recordAudit } from "@/features/audit/repository";
import { buildTeamBoard } from "@/features/analytics/repository";
import { getSettings, listHolidayDates } from "@/features/settings/repository";
import type { UserAccount } from "@/features/users/model";
import { listUsersWithPrivilege } from "@/features/users/repository";
import { formatKpiHtml, formatKpiText, isKpiReportDue, kpiJobName, kpiPeriodKey, kpiPeriodLabel, kpiReportKinds, kpiReportLabels, kpiReportPeriod, kpiSubject, kpiTotals, type KpiReportData, type KpiReportKind, type KpiRow } from "./kpi-model";
import { performanceReport } from "./repository";

/**
 * The KPI report emails to administrators (SPEC §7.18): every Sales Manager's numbers for the last completed day,
 * week, or month next to their current state, and the system-wide totals and pipeline. `runKpiReports` is called by
 * the scheduler (POST /api/jobs/run) every minute and sends each report once per period, claimed through
 * `job_runs`; an administrator can also send one to themselves at once from Settings.
 */

export type KpiRunResult = { job: string; kind: KpiReportKind; periodKey: string; recipients: number; failures: number };

const reportsLink = () => { const base = process.env.APP_URL?.trim(); return base ? `${base.replace(/\/$/, "")}/#/reports` : null; };

/** The numbers: the team performance report for the period, the team board for the current state, the pipeline by status. */
export async function buildKpiReport(kind: KpiReportKind, viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<KpiReportData> {
  const [report, board, pipelineRows] = await Promise.all([
    performanceReport(kpiReportPeriod[kind], viewer, null),
    buildTeamBoard(viewer, db),
    db.query("SELECT s.value AS label, COUNT(*)::int AS count FROM leads l JOIN list_values s ON s.id = l.status_id WHERE l.record_state = 'active' GROUP BY s.value, s.sort_order ORDER BY s.sort_order"),
  ]);
  const current = new Map(board.rows.map((row) => [row.userId, row]));
  const rows: KpiRow[] = report.rows.map((row) => {
    const now = current.get(row.userId);
    return {
      userId: row.userId, name: row.name, role: row.role,
      leadsCreated: row.leadsCreated, leadsUpdated: row.leadsUpdated, calls: row.calls, emails: row.emails, visits: row.visits, notes: row.notes, conversions: row.conversions, tasksCompleted: row.tasksCompleted, targetPercent: row.targetPercent,
      activeLeads: now?.activeLeads ?? 0, overdueFollowUps: now?.overdueFollowUps ?? 0, stalled: now?.stalled ?? 0, repliesWaiting: now?.repliesWaiting ?? 0,
    };
  });
  const endYmd = addDaysYmd(report.range.endExclusiveYmd, -1);
  const pipeline = (pipelineRows.rows as { label: string; count: number }[]).map((status) => ({ label: status.label, count: Number(status.count) }));
  return {
    kind, startYmd: report.range.startYmd, endYmd, periodLabel: kpiPeriodLabel(report.range.startYmd, endYmd), generatedAt: new Date().toISOString(),
    rows, totals: kpiTotals(rows), pipeline, pipelineTotal: pipeline.reduce((sum, status) => sum + status.count, 0), appUrl: reportsLink(),
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
      const data = await buildKpiReport(kind, admins[0], db);
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
