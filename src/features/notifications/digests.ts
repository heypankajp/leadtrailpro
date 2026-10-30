import { getDatabasePool, insertId, toSqlDateTime, type Queryable } from "@/lib/db";
import { businessTimeZone, startOfWeekYmd, todayYmd } from "@/lib/dates";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { recordAudit } from "@/features/audit/repository";
import { buildDashboard, performanceReport } from "@/features/reports/repository";
import { getSettings } from "@/features/settings/repository";
import type { DigestSettings } from "@/features/settings/model";
import { listUsers } from "@/features/users/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import { digestJobs, isDigestDue, type DigestJob } from "./model";
import { notifyUsers } from "./repository";

/**
 * TASK-06 / NTF-03 / NTF-04: daily and weekly digests. `runDigestJobs` is called by the scheduler (scripts/jobs.mjs
 * through POST /api/jobs/run) every minute and sends each digest once per period; an administrator can also force
 * one for themselves from Settings. Each digest is an in-app notification and, when a mail provider is configured,
 * an email to the person.
 */

export type DigestRunResult = { job: DigestJob; periodKey: string; recipients: number; failures: number };

export function digestPeriodKey(job: DigestJob, today: string): string {
  return job === "daily" ? today : `week-${startOfWeekYmd(today)}`;
}

const formatDate = (ymd: string | null) => ymd ?? "no date";
const appLink = (hash: string) => { const base = process.env.APP_URL?.trim(); return base ? `${base.replace(/\/$/, "")}/#/${hash}` : null; };
const list = (items: string[], max = 6) => items.slice(0, max).map((item) => `  - ${item}`).join("\n") + (items.length > max ? `\n  … and ${items.length - max} more` : "");

async function dailyDigest(user: UserAccount, today: string): Promise<{ title: string; text: string }> {
  const dashboard = await buildDashboard(user, "mine");
  const yesterday = await performanceReport("yesterday", user, user.id);
  const row = yesterday.rows[0];
  const overdueTasks = dashboard.openTasks.filter((task) => task.dueAt && task.dueAt < new Date().toISOString());
  const dueTodayTasks = dashboard.openTasks.filter((task) => task.dueAt && task.dueAt.slice(0, 10) === today);
  const title = `Daily digest: ${dashboard.followUps.overdue.length} overdue, ${dashboard.followUps.today.length} due today, ${dashboard.openTasks.length} open tasks`;
  const sections = [
    `Hi ${user.firstName}, here is your LeadTrailPro day for ${today}.`,
    `Follow-ups overdue (${dashboard.followUps.overdue.length})${dashboard.followUps.overdue.length ? ":\n" + list(dashboard.followUps.overdue.map((lead) => `${lead.clientName} (${lead.statusLabel}, due ${formatDate(lead.followUpDate)}, ${lead.bdAction ?? "no BD action"})`)) : ""}`,
    `Follow-ups today (${dashboard.followUps.today.length})${dashboard.followUps.today.length ? ":\n" + list(dashboard.followUps.today.map((lead) => `${lead.clientName} (${lead.statusLabel}${lead.clientExecutive ? `, ${lead.clientExecutive}` : ""})`)) : ""}`,
    `Follow-ups tomorrow (${dashboard.followUps.tomorrow.length})${dashboard.followUps.tomorrow.length ? ":\n" + list(dashboard.followUps.tomorrow.map((lead) => lead.clientName)) : ""}`,
    `Tasks: ${dashboard.openTasks.length} open, ${overdueTasks.length} overdue, ${dueTodayTasks.length} due today${overdueTasks.length || dueTodayTasks.length ? ":\n" + list([...overdueTasks, ...dueTodayTasks].map((task) => `${task.title}${task.leadName ? ` (${task.leadName})` : ""}, due ${task.dueAt ? task.dueAt.slice(0, 16).replace("T", " ") : "—"}`)) : ""}`,
    `Needs attention (${dashboard.inactiveLeads.length})${dashboard.inactiveLeads.length ? ":\n" + list(dashboard.inactiveLeads.map((lead) => `${lead.clientName}, quiet for more than ${dashboard.inactiveLimits[lead.id] ?? dashboard.inactivityDays} days`)) : ""}`,
    row ? `Yesterday: ${row.calls} calls, ${row.emails} emails, ${row.visits} visits, ${row.leadsCreated} leads created, ${row.conversions} conversions.` : "",
    appLink("home") ? `Open your Action Center: ${appLink("home")}` : "",
  ].filter(Boolean);
  return { title, text: sections.join("\n\n") };
}

async function weeklyDigest(user: UserAccount, today: string): Promise<{ title: string; text: string }> {
  const own = await performanceReport("last_week", user, user.id);
  const row = own.rows[0];
  const dashboard = await buildDashboard(user, "mine");
  const title = row
    ? `Weekly digest: ${row.calls} calls, ${row.emails} emails, ${row.visits} visits, ${row.leadsCreated} leads last week`
    : "Weekly digest";
  const sections = [
    `Hi ${user.firstName}, here is your LeadTrailPro week (week of ${startOfWeekYmd(today)}).`,
    row ? `Last week (${own.range.startYmd} to ${own.range.endExclusiveYmd}, exclusive): ${row.calls} calls, ${row.emails} emails, ${row.visits} visits, ${row.notes} notes, ${row.leadsCreated} leads created, ${row.leadsUpdated} leads updated, ${row.conversions} conversions, ${row.tasksCompleted} tasks completed${row.targetPercent === null ? "" : `, ${row.targetPercent}% of target`}.` : "No activity was recorded for you last week.",
    `This week: ${dashboard.followUps.overdue.length} overdue follow-ups, ${dashboard.followUps.today.length} due today, ${dashboard.openTasks.length} open tasks, ${dashboard.inactiveLeads.length} leads needing attention.`,
    dashboard.targets.template ? `Targets (${dashboard.targets.template.name}): ${dashboard.targets.leads.achieved}/${dashboard.targets.leads.target} leads, ${dashboard.targets.visits.achieved}/${dashboard.targets.visits.target} visits, ${dashboard.targets.conversions.achieved}/${dashboard.targets.conversions.target} conversions.` : "",
  ].filter(Boolean);
  if (hasPrivilege(user, "view_team_reports")) {
    const team = await performanceReport("last_week", user, null);
    const totals = team.rows.reduce((sum, item) => ({ calls: sum.calls + item.calls, emails: sum.emails + item.emails, visits: sum.visits + item.visits, leads: sum.leads + item.leadsCreated, conversions: sum.conversions + item.conversions }), { calls: 0, emails: 0, visits: 0, leads: 0, conversions: 0 });
    sections.push(`Team last week (${team.rows.length} people): ${totals.calls} calls, ${totals.emails} emails, ${totals.visits} visits, ${totals.leads} leads, ${totals.conversions} conversions.${team.rows.length ? "\n" + list(team.rows.map((item) => `${item.name}: ${item.leadsCreated} leads, ${item.calls} calls, ${item.visits} visits, ${item.conversions} conversions${item.targetPercent === null ? "" : `, ${item.targetPercent}% of target`}`), 12) : ""}`);
  }
  if (appLink("reports")) sections.push(`Open the reports: ${appLink("reports")}`);
  return { title, text: sections.join("\n\n") };
}

async function sendDigest(job: DigestJob, user: UserAccount, today: string, db: Queryable): Promise<void> {
  const digest = job === "daily" ? await dailyDigest(user, today) : await weeklyDigest(user, today);
  await notifyUsers(db, { userIds: [user.id], type: job === "daily" ? "daily_digest" : "weekly_digest", title: digest.title, body: digest.text, email: false });
  if (isMailerConfigured()) {
    await sendMail({ to: user.email, subject: job === "daily" ? `Your daily LeadTrailPro digest for ${today}` : "Your weekly LeadTrailPro digest", text: digest.text });
  }
}

/**
 * Runs the digests that are due (or the one forced). A job runs once per period: the (job, period_key) row in
 * job_runs is claimed first, so several schedulers or a retry cannot send twice.
 */
export async function runDigestJobs(options: { force?: DigestJob | null; onlyUserId?: number | null; actorId?: number | null } = {}): Promise<{ ran: DigestRunResult[]; settings: DigestSettings }> {
  const db = getDatabasePool();
  const settings = await getSettings(db);
  const now = new Date();
  const timeZone = businessTimeZone();
  const today = todayYmd(now, timeZone);
  const jobs = options.force ? [options.force] : digestJobs.filter((job) => isDigestDue(job, settings.digests, now, timeZone, today));
  const ran: DigestRunResult[] = [];
  for (const job of jobs) {
    const periodKey = options.force ? `manual-${now.toISOString().slice(0, 19)}-${options.actorId ?? 0}` : digestPeriodKey(job, today);
    const claim = await db.query("INSERT INTO job_runs (job, period_key, status, started_at) VALUES (?, ?, 'running', ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id", [job, periodKey, toSqlDateTime(now)]);
    if (!claim.rowCount) continue;
    const runId = insertId(claim);
    let recipients = 0;
    let failures = 0;
    const users = (await listUsers({}, db)).filter((user) =>
      user.role !== "recruiter" && (options.onlyUserId ? user.id === options.onlyUserId : (job === "daily" ? user.notificationPrefs.dailyDigest : user.notificationPrefs.weeklyDigest)));
    for (const user of users) {
      try { await sendDigest(job, user, today, db); recipients += 1; } catch (error) { failures += 1; console.error(`${job} digest for ${user.email} failed.`, error instanceof Error ? error.message : error); }
    }
    const status = failures === 0 ? "success" : recipients ? "partial" : "failed";
    await db.query("UPDATE job_runs SET status = ?, finished_at = ?, details = ? WHERE id = ?", [status, toSqlDateTime(new Date()), `${recipients} recipient(s), ${failures} failure(s)`, runId]);
    await recordAudit(db, { actorId: options.actorId ?? null, action: `digest.${job}`, entityType: "job", entityId: runId, after: { periodKey, recipients, failures, status }, details: `${job} digest ${status}: ${recipients} recipient(s), ${failures} failure(s)${options.force ? " (sent on demand)" : ""}` });
    ran.push({ job, periodKey, recipients, failures });
  }
  return { ran, settings: settings.digests };
}
