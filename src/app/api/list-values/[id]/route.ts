import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { updateListValue } from "@/features/list-values/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Rename, activate/deactivate, or reorder a single value. Renames flow through to every lead that uses it. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid value ID.");
    const body = await readJsonBody(request);
    const changes: { value?: string; active?: boolean; sortOrder?: number } = {};
    if (typeof body?.value === "string") changes.value = body.value;
    if (typeof body?.active === "boolean") changes.active = body.active;
    if (Number.isInteger(body?.sortOrder)) changes.sortOrder = Number(body?.sortOrder);
    const value = await updateListValue(id, changes, user.id);
    return NextResponse.json({ value });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return jsonError(409, "That value already exists in this list.");
    return handleRouteError(error, "Update list value");
  }
}
