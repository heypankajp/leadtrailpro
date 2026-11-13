import { getDatabasePool, insertId, toSqlDateTime } from "@/lib/db";
import { businessTimeZone, startOfWeekYmd, todayYmd } from "@/lib/dates";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { recordAudit } from "@/features/audit/repository";
import { isDigestDue } from "@/features/notifications/model";
import { getSettings } from "@/features/settings/repository";
import { listUsersWithPrivilege } from "@/features/users/repository";
import { buildAnalytics } from "./repository";
import { emptyAnalyticsFilters } from "./model";

/**
 * The weekly stalled-leads report to administrators, behind the "Send report emails" switch under Settings → Email
 * delivery (off by default, decided November 6, 2026). It rides on the weekly summary-email day and time and is
 * claimed through `job_runs` so it goes out once a week.
 */
export async function runStalledReport(now = new Date()): Promise<{ periodKey: string; recipients: number } | null> {
  const db = getDatabasePool();
  const settings = await getSettings(db);
  if (!settings.email.reportEmails || !isMailerConfigured()) return null;
  const timeZone = businessTimeZone();
  const today = todayYmd(now, timeZone);
  if (!isDigestDue("weekly", { ...settings.digests, enabled: true }, now, timeZone, today)) return null;
  const periodKey = `week-${startOfWeekYmd(today)}`;
  const claim = await db.query("INSERT INTO job_runs (job, period_key, status, started_at) VALUES ('stalled_report', ?, 'running', ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id", [periodKey, toSqlDateTime(now)]);
  if (!claim.rowCount) return null;
  const runId = insertId(claim);
  const admins = (await listUsersWithPrivilege("manage_settings", db)).filter((person) => person.active);
  let recipients = 0;
  let failures = 0;
  if (admins.length) {
    const report = await buildAnalytics(admins[0], "last_7d", null, emptyAnalyticsFilters);
    const lines = report.stalled.leads.slice(0, 10).map((lead) => `  - ${lead.clientName} (${lead.statusLabel}, ${lead.ownerName}): ${lead.reasons.join("; ")}`);
    const text = [
      `Stalled deals this week: ${report.stalled.total}.`, "",
      lines.length ? lines.join("\n") : "  Nothing is stalled. Well done.", "",
      `Pipeline now: ${report.pipeline.byStatus.map((status) => `${status.label} ${status.count}`).join(", ")}.`,
      `Last 7 days: ${report.movement.funnel.anyToClient} conversion${report.movement.funnel.anyToClient === 1 ? "" : "s"}, ${report.movement.backwards} move${report.movement.backwards === 1 ? "" : "s"} backwards.`,
      "", "Open Analytics in LeadTrailPro for the full picture.",
    ].join("\n");
    for (const admin of admins) {
      try { await sendMail({ to: admin.email, subject: `LeadTrailPro: ${report.stalled.total} stalled deal${report.stalled.total === 1 ? "" : "s"} need attention`, text }); recipients += 1; } catch (error) { failures += 1; console.error(`Stalled report to ${admin.email} failed.`, error instanceof Error ? error.message : error); }
    }
  }
  const status = failures === 0 ? "success" : recipients ? "partial" : "failed";
  await db.query("UPDATE job_runs SET status = ?, finished_at = ?, details = ? WHERE id = ?", [status, toSqlDateTime(new Date()), `${recipients} recipient(s), ${failures} failure(s)`, runId]);
  await recordAudit(db, { actorId: null, action: "report.stalled_leads", entityType: "job", entityId: runId, after: { periodKey, recipients, failures, status }, details: `Weekly stalled-leads report ${status}: ${recipients} recipient(s)` });
  return { periodKey, recipients };
}
