import { NextResponse } from "next/server";
import { handleRouteError, requireSameOrigin } from "@/lib/http";
import { getDeployStatus, requestDeploy } from "@/features/deploy/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** What the server runs and what its deployer last did (SPEC §2.4): the running commit, the schema version, the deployer's heartbeat, the last ten deploys. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to see deploys.");
    return NextResponse.json({ status: await getDeployStatus() });
  } catch (error) {
    return handleRouteError(error, "Read deploy status");
  }
}

/** "Deploy now": the deployer rebuilds and restarts the stack on its next check, even when the branch has not moved. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to deploy.");
    const requested = await requestDeploy(user);
    return NextResponse.json({ request: requested, status: await getDeployStatus() }, { status: 202 });
  } catch (error) {
    return handleRouteError(error, "Request deploy");
  }
}
