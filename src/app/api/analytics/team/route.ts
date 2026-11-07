import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { buildTeamBoard } from "@/features/analytics/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The team board: one row per salesperson as things stand now (active, overdue, stalled, replies waiting, this week's activity). */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view analytics.");
    return NextResponse.json(await buildTeamBoard(user));
  } catch (error) {
    return handleRouteError(error, "Team board");
  }
}
