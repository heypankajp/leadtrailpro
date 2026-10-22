import { NextResponse } from "next/server";
import { reportPeriods, type ReportPeriod } from "@/lib/dates";
import { handleRouteError, jsonError } from "@/lib/http";
import { performanceReport } from "@/features/reports/repository";
import { isUserStage } from "@/features/users/model";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view reports.");
    const params = new URL(request.url).searchParams;
    const period = params.get("period") ?? "this_week";
    if (!reportPeriods.includes(period as ReportPeriod)) return jsonError(400, "Unknown report period.");
    const userId = Number(params.get("userId"));
    const selectedUser = Number.isSafeInteger(userId) && userId > 0 ? userId : null;
    if (selectedUser && selectedUser !== user.id && !hasPrivilege(user, "view_team_reports")) return jsonError(403, "You can only view your own report.");
    const stage = params.get("stage");
    const templateId = Number(params.get("templateId"));
    return NextResponse.json(await performanceReport(period as ReportPeriod, user, selectedUser, { stage: isUserStage(stage) ? stage : null, templateId: Number.isSafeInteger(templateId) && templateId > 0 ? templateId : null }));
  } catch (error) {
    return handleRouteError(error, "Performance report");
  }
}
