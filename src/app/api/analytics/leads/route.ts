import { NextResponse } from "next/server";
import { asString, handleRouteError } from "@/lib/http";
import { parseAnalyticsFilters } from "@/features/analytics/model";
import { listAnalyticsLeads } from "@/features/analytics/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Drill-down: the leads behind a chart segment (same filters, plus a status and/or an owner). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view analytics.");
    const params = new URL(request.url).searchParams;
    const drillOwner = Number(params.get("drillOwnerId"));
    const stageId = Number(params.get("stageId"));
    const leads = await listAnalyticsLeads(user, parseAnalyticsFilters((key) => params.get(key)), asString(params.get("status"), 40) || null, Number.isSafeInteger(drillOwner) && drillOwner > 0 ? drillOwner : null, Number.isSafeInteger(stageId) && stageId > 0 ? stageId : null);
    return NextResponse.json({ leads });
  } catch (error) {
    return handleRouteError(error, "Analytics drill-down");
  }
}
