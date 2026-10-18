import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { assignTargetTemplate } from "@/features/targets/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_targets", "You do not have permission to manage targets.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid template ID.");
    const body = await readJsonBody(request);
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0) : [];
    if (!userIds.length) return jsonError(400, "Choose at least one user.");
    await assignTargetTemplate(id, userIds, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Assign target template");
  }
}
