import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestUser, isSameOriginRequest, revokeUserSession, sessionCookieName } from "@/features/users/session";

export async function GET() {
  try {
    const user = await getRequestUser();
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Session lookup failed while accessing MySQL.", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Session lookup is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Sign-out request rejected." }, { status: 403 });
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  if (token) {
    try {
      await revokeUserSession(token);
    } catch (error) {
      console.error("Could not revoke sign-out session.", error instanceof Error ? error.name : "Unknown error");
      const failedResponse = NextResponse.json({ error: "The session could not be revoked. The browser cookie was cleared; contact an administrator if this persists." }, { status: 503 });
      failedResponse.cookies.set(sessionCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
      return failedResponse;
    }
  }
  return response;
}
