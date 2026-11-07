import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { jobsUsageOverview } from "@/features/jobs/repository";
import { hasPrivilege, requireUser } from "@/features/users/session";

/** The month's job-source usage against the in-app budgets plus HasData's live balance, for the usage card (SPEC §7.13). */
export async function GET() {
  try {
    const user = await requireUser();
    if (!hasPrivilege(user, "view_leads") && !hasPrivilege(user, "plan_trips") && !hasPrivilege(user, "manage_settings")) return jsonError(403, "You do not have permission to view job-source usage.");
    return NextResponse.json({ usage: await jobsUsageOverview() });
  } catch (error) {
    return handleRouteError(error, "Job-source usage");
  }
}
