import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { teamBoardMetrics, type TeamBoardMetric } from "@/features/analytics/model";
import { teamBoardLeads } from "@/features/analytics/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Drill-down from the team board: the leads behind one person's number. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view analytics.");
    const params = new URL(request.url).searchParams;
    const userId = Number(params.get("userId"));
    const metric = params.get("metric") as TeamBoardMetric | null;
    if (!Number.isSafeInteger(userId) || userId < 1) return jsonError(400, "Choose a person.");
    if (!metric || !teamBoardMetrics.includes(metric)) return jsonError(400, "Choose a board column.");
    return NextResponse.json({ leads: await teamBoardLeads(user, userId, metric) });
  } catch (error) {
    return handleRouteError(error, "Team board leads");
  }
}
