import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { hasJobsKey } from "@/lib/jobs-key";
import { runDigestJobs } from "@/features/notifications/digests";
import { runScheduledOpportunities } from "@/features/opportunities/runner";
import { runStalledReport } from "@/features/analytics/report-email";
import { runMailboxWatch } from "@/features/gmail/watch";
import { runKpiReports } from "@/features/reports/kpi-email";
import { isKpiReportKind } from "@/features/reports/kpi-model";
import { getRequestUser, hasPrivilege } from "@/features/users/session";

/**
 * Scheduled jobs (TASK-06 digests, OPP-06 opportunity searches, the weekly report, the KPI reports to administrators, the MAIL-01 mailbox watch). The scheduler (scripts/jobs.mjs or an external cron) calls this every minute with
 * `X-Jobs-Key`; whatever is due runs once. An administrator may instead force a digest or a KPI report (`job: kpi_daily | kpi_weekly | kpi_monthly`) for themselves from Settings.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request)) ?? {};
    const job = body.job === "daily" || body.job === "weekly" ? body.job : null;
    const kpiJob = typeof body.job === "string" && body.job.startsWith("kpi_") ? body.job.slice(4) : "";
    const kpiKind = isKpiReportKind(kpiJob) ? kpiJob : null;
    if (hasJobsKey(request)) {
      const digests = await runDigestJobs({ force: body.force === true ? job : null });
      const opportunities = await runScheduledOpportunities().catch((error: unknown) => { console.error("Scheduled opportunity search failed.", error instanceof Error ? error.message : error); return null; });
      const stalledReport = await runStalledReport().catch((error: unknown) => { console.error("Stalled-leads report failed.", error instanceof Error ? error.message : error); return null; });
      const kpiReports = await runKpiReports().catch((error: unknown) => { console.error("KPI report failed.", error instanceof Error ? error.message : error); return []; });
      const mailboxWatch = await runMailboxWatch().catch((error: unknown) => { console.error("Mailbox watch failed.", error instanceof Error ? error.message : error); return null; });
      return NextResponse.json({ ...digests, ran: [...digests.ran, ...(opportunities ? [{ job: "opportunities" as const, ...opportunities }] : []), ...(stalledReport ? [{ job: "stalled_report" as const, ...stalledReport }] : []), ...kpiReports, ...(mailboxWatch ? [{ job: "mailbox_watch" as const, ...mailboxWatch }] : [])] });
    }
    requireSameOrigin(request);
    const user = await getRequestUser();
    if (!user || !hasPrivilege(user, "manage_settings")) return jsonError(403, "A valid X-Jobs-Key header or an administrator session is required.");
    if (kpiKind) return NextResponse.json({ ran: await runKpiReports({ force: kpiKind, onlyUserId: user.id, actorId: user.id }) });
    if (!job) return jsonError(400, "Choose the daily or the weekly digest, or a KPI report.");
    return NextResponse.json(await runDigestJobs({ force: job, onlyUserId: body.onlyMe === false ? null : user.id, actorId: user.id }));
  } catch (error) {
    return handleRouteError(error, "Run jobs");
  }
}
