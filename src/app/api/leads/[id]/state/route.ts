import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { setLeadState } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Archive or restore a lead. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "archive_leads", "You do not have permission to archive or restore leads.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const body = await readJsonBody(request);
    if (body?.state !== "active" && body?.state !== "archived") return jsonError(400, "State must be active or archived.");
    const lead = await setLeadState(id, body.state, asString(body.reason, 500), user);
    return NextResponse.json({ lead });
  } catch (error) {
    return handleRouteError(error, "Change lead state");
  }
}
