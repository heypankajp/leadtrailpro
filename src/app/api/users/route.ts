import { NextResponse } from "next/server";
import { parseCreateUser } from "@/features/users/model";
import { createUser, listUsers } from "@/features/users/repository";
import { getRequestUser, hasManagementKey, hasPrivilege, isSameOriginRequest } from "@/features/users/session";

function databaseErrorResponse() {
  return NextResponse.json({ error: "Could not access users in MySQL." }, { status: 503 });
}

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode");
  const user = await getRequestUser();
  const canView = mode === "transfer"
    ? user && hasPrivilege(user, "transfer_leads")
    : user && hasPrivilege(user, "manage_users");
  const bootstrap = !canView && hasManagementKey(request);
  if (!canView && !bootstrap) {
    return NextResponse.json({ error: "Sign in with the required privilege or enter a valid user-management key." }, { status: 401 });
  }
  try {
    const users = await listUsers();
    if (bootstrap && users.length > 0) {
      return NextResponse.json({ error: "The bootstrap key is disabled after the first platform account is created." }, { status: 403 });
    }
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to load users from MySQL.", error instanceof Error ? error.name : "Unknown error");
    return databaseErrorResponse();
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const userAccount = await getRequestUser();
  const hasAdminSession = userAccount && hasPrivilege(userAccount, "manage_users");
  const bootstrap = !hasAdminSession && hasManagementKey(request);
  if (!hasAdminSession && !bootstrap) {
    return NextResponse.json({ error: "Sign in with user-management access or enter a valid user-management key." }, { status: 401 });
  }
  const user = parseCreateUser(await request.json().catch(() => null));
  if (!user) {
    return NextResponse.json(
      { error: "Enter valid user details, a password with at least 12 characters, a role, and valid privileges." },
      { status: 400 },
    );
  }
  try {
    if (bootstrap && (await listUsers()).length > 0) {
      return NextResponse.json({ error: "The bootstrap key is disabled after the first platform account is created." }, { status: 403 });
    }
    return NextResponse.json({ user: await createUser(user) }, { status: 201 });
  } catch (error) {
    const mysqlError = error as { code?: string };
    if (mysqlError.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "A user with this email address already exists." }, { status: 409 });
    }
    console.error("Failed to create user in MySQL.", error instanceof Error ? error.name : "Unknown error");
    return databaseErrorResponse();
  }
}
