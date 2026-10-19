import { NextResponse } from "next/server";
import { reportPeriods, type ReportPeriod } from "@/lib/dates";
import { handleRouteError, jsonError } from "@/lib/http";
import { drilldown } from "@/features/reports/repository";
import type { DrilldownMetric } from "@/features/reports/model";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

const metrics: DrilldownMetric[] = ["calls", "emails", "visits", "notes", "leads", "conversions", "tasks"];

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view reports.");
    const params = new URL(request.url).searchParams;
    const period = params.get("period") ?? "this_week";
    const metric = params.get("metric") ?? "";
    const userId = Number(params.get("userId"));
    if (!reportPeriods.includes(period as ReportPeriod)) return jsonError(400, "Unknown report period.");
    if (!metrics.includes(metric as DrilldownMetric)) return jsonError(400, "Unknown metric.");
    if (!Number.isSafeInteger(userId) || userId < 1) return jsonError(400, "Choose a user.");
    if (userId !== user.id && !hasPrivilege(user, "view_team_reports")) return jsonError(403, "You can only view your own report.");
    return NextResponse.json(await drilldown(period as ReportPeriod, user, userId, metric as DrilldownMetric));
  } catch (error) {
    return handleRouteError(error, "Report drill-down");
  }
}
