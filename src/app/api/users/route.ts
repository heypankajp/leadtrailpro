import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseCreateUser } from "@/features/users/model";
import { countUsers, createUser, listDirectory, listUsers } from "@/features/users/repository";
import { getRequestUser, hasManagementKey, hasPrivilege } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    const user = await getRequestUser();
    if (mode === "directory") {
      if (!user) return jsonError(401, "Sign in to continue.");
      return NextResponse.json({ users: await listDirectory() });
    }
    if (user && hasPrivilege(user, "manage_users")) {
      return NextResponse.json({ users: await listUsers({ includeInactive: true }) });
    }
    if (hasManagementKey(request)) {
      if ((await countUsers()) > 0) return jsonError(403, "The bootstrap key is disabled after the first platform account is created.");
      return NextResponse.json({ users: [] });
    }
    return jsonError(user ? 403 : 401, user ? "You do not have permission to manage users." : "Sign in with user-management access or enter a valid user-management key.");
  } catch (error) {
    return handleRouteError(error, "List users");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getRequestUser();
    const hasAdminSession = Boolean(actor && hasPrivilege(actor, "manage_users"));
    const bootstrap = !hasAdminSession && hasManagementKey(request);
    if (!hasAdminSession && !bootstrap) {
      return jsonError(actor ? 403 : 401, actor ? "You do not have permission to manage users." : "Sign in with user-management access or enter a valid user-management key.");
    }
    const input = parseCreateUser(await readJsonBody(request));
    if (!input) {
      return jsonError(400, "Enter valid user details, a password with at least 12 characters, a role, and valid privileges.");
    }
    if (bootstrap) {
      if ((await countUsers()) > 0) return jsonError(403, "The bootstrap key is disabled after the first platform account is created.");
      input.role = "admin";
    }
    const user = await createUser(input, actor?.id ?? null);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return jsonError(409, "A user with this email address already exists.");
    return handleRouteError(error, "Create user");
  }
}
