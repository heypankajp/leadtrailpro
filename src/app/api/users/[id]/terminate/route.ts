import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/db";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { getUser, terminateUser } from "@/features/users/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Terminates an account and hands its leads and open tasks to another Sales Manager or Admin. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    requirePrivilege(actor, "manage_users", "You do not have permission to manage users.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid user ID.");
    const body = await readJsonBody(request);
    const reassignToUserId = Number(body?.reassignToUserId);
    if (!Number.isSafeInteger(reassignToUserId) || reassignToUserId < 1) return jsonError(400, "Choose who receives the leads.");
    const target = await getUser(id);
    if (!target) return jsonError(404, "User not found.");
    if (target.role === "admin") {
      const [rows] = await getDatabasePool().query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = TRUE AND id <> ?", [id]);
      if (Number((rows as { count: number }[])[0].count) === 0) return jsonError(400, "At least one active administrator must remain.");
    }
    const result = await terminateUser(id, reassignToUserId, actor.id, asString(body?.reason, 500));
    return NextResponse.json({ ok: true, ...result, user: await getUser(id) });
  } catch (error) {
    return handleRouteError(error, "Terminate user");
  }
}
