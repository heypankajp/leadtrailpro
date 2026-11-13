import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { updatePipeline } from "@/features/pipeline/pipelines";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Renames a pipeline or switches it on or off: `{ name?, active? }`. The default pipeline stays on. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage pipelines.");
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid pipeline ID.");
    const body = await readJsonBody(request);
    const changes: { name?: string; active?: boolean } = {};
    if (body && "name" in body) changes.name = asString(body.name, 80);
    if (body && typeof body.active === "boolean") changes.active = body.active;
    return NextResponse.json({ pipeline: await updatePipeline(id, changes, user) });
  } catch (error) {
    return handleRouteError(error, "Update pipeline");
  }
}
