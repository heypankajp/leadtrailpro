import { NextResponse } from "next/server";
import { handleRouteError, requireSameOrigin } from "@/lib/http";
import { listRuns } from "@/features/opportunities/repository";
import { runOpportunitySearches } from "@/features/opportunities/runner";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Recent runs (OPP-16), and an on-demand run of every active search (OPP-15) for administrators. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    return NextResponse.json({ runs: await listRuns(20) });
  } catch (error) {
    return handleRouteError(error, "List lead runs");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "Only an administrator can run the searches now.");
    const run = await runOpportunitySearches({ trigger: "manual", actorId: user.id });
    return NextResponse.json({ run, runs: await listRuns(20) });
  } catch (error) {
    return handleRouteError(error, "Run lead searches");
  }
}
