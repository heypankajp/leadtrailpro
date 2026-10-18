import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { countUsers } from "@/features/users/repository";
import { clearedCookieOptions, getRequestUser, revokeUserSession, sessionCookieName } from "@/features/users/session";

export async function GET() {
  try {
    const user = await getRequestUser();
    const needsSetup = user ? false : (await countUsers()) === 0;
    return NextResponse.json({ user, needsSetup });
  } catch (error) {
    return handleRouteError(error, "Session lookup");
  }
}

export async function DELETE(request: Request) {
  if (!request.headers.get("origin")) return jsonError(403, "Sign-out request rejected.");
  try {
    requireSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName)?.value;
    if (token) await revokeUserSession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieName, "", clearedCookieOptions);
    return response;
  } catch (error) {
    const response = handleRouteError(error, "Sign-out");
    response.cookies.set(sessionCookieName, "", clearedCookieOptions);
    return response;
  }
}
