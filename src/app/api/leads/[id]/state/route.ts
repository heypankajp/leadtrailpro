import { NextResponse } from "next/server";
import { asOptionalId, asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { setLeadState } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Archive or restore a lead. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "archive_leads", "You do not have permission to archive or restore deals.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid deal ID.");
    const body = await readJsonBody(request);
    if (body?.state !== "active" && body?.state !== "archived") return jsonError(400, "State must be active or archived.");
    // Review of November 18, 2026: an archive names its Archival reason; the reason text is the optional notes.
    const archiveReasonId = asOptionalId(body.archiveReasonId);
    if (body.state === "archived" && archiveReasonId === null) return jsonError(400, "Choose the archival reason.");
    const lead = await setLeadState(id, body.state, asString(body.reason, 500), user, undefined, archiveReasonId);
    return NextResponse.json({ lead });
  } catch (error) {
    return handleRouteError(error, "Change deal state");
  }
}
