import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { isValidPassword } from "@/features/users/model";
import { getUser, setUserPassword } from "@/features/users/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Admin sets a new password for someone (the fallback while email delivery is not configured). */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    requirePrivilege(actor, "manage_users", "You do not have permission to manage users.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid user ID.");
    const body = await readJsonBody(request);
    if (!isValidPassword(body?.password)) return jsonError(400, "The password must be between 12 and 200 characters.");
    const user = await getUser(id);
    if (!user) return jsonError(404, "User not found.");
    await setUserPassword(id, body.password, actor.id, { reason: `Password set by administrator ${actor.name}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Set password");
  }
}
