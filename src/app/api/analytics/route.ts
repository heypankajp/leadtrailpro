import { NextResponse } from "next/server";
import { customRangeFrom, reportPeriods, type ReportPeriod } from "@/lib/dates";
import { handleRouteError, jsonError } from "@/lib/http";
import { parseAnalyticsFilters } from "@/features/analytics/model";
import { buildAnalytics } from "@/features/analytics/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The Analytics screen (RPT-*): every section for a period and a filter set; non-team viewers see their own leads only. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view analytics.");
    const params = new URL(request.url).searchParams;
    const period = params.get("period") ?? "last_30d";
    if (!reportPeriods.includes(period as ReportPeriod)) return jsonError(400, "Unknown report period.");
    return NextResponse.json(await buildAnalytics(user, period as ReportPeriod, customRangeFrom(params.get("from"), params.get("to")), parseAnalyticsFilters((key) => params.get(key))));
  } catch (error) {
    return handleRouteError(error, "Analytics");
  }
}
