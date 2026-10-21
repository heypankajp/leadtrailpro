import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseTargetTemplate } from "@/features/targets/model";
import { updateTargetTemplate } from "@/features/targets/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_targets", "You do not have permission to manage targets.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid template ID.");
    const input = parseTargetTemplate(await readJsonBody(request), true);
    if (!input) return jsonError(400, "Enter valid template values.");
    const template = await updateTargetTemplate(id, input, user.id);
    return NextResponse.json({ template });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return jsonError(409, "A template with that name already exists.");
    return handleRouteError(error, "Update target template");
  }
}
