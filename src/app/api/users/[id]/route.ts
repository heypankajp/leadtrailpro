import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/db";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseUpdateUser } from "@/features/users/model";
import { getUser, updateUser } from "@/features/users/repository";
import { listLoginHistory, requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    requirePrivilege(actor, "manage_users", "You do not have permission to view user accounts.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid user ID.");
    const user = await getUser(id);
    if (!user) return jsonError(404, "User not found.");
    return NextResponse.json({ user, loginHistory: await listLoginHistory({ userId: id, limit: 25 }) });
  } catch (error) {
    return handleRouteError(error, "Load user");
  }
}

async function otherActiveAdmins(excludeId: number): Promise<number> {
  const [rows] = await getDatabasePool().query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = TRUE AND id <> ?", [excludeId]);
  return Number((rows as { count: number }[])[0].count);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    requirePrivilege(actor, "manage_users", "You do not have permission to manage users.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid user ID.");
    const input = parseUpdateUser(await readJsonBody(request));
    if (!input) return jsonError(400, "Enter valid user details.");
    const existing = await getUser(id);
    if (!existing) return jsonError(404, "User not found.");
    const losesAdmin = existing.role === "admin" && ((input.role !== undefined && input.role !== "admin") || input.active === false);
    if (losesAdmin && (await otherActiveAdmins(id)) === 0) {
      return jsonError(400, "At least one active administrator must remain.");
    }
    if (id === actor.id && input.active === false) return jsonError(400, "You cannot deactivate your own account.");
    const user = await updateUser(id, input, actor.id);
    return NextResponse.json({ user });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") return jsonError(409, "A user with this email address already exists.");
    return handleRouteError(error, "Update user");
  }
}
