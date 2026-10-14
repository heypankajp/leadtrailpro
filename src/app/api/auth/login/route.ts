import { NextResponse } from "next/server";
import { createUserSession, isSameOriginRequest, sessionCookieName, sessionCookieOptions, verifyPassword } from "@/features/users/session";

const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const maxAttempts = 10;
const attemptWindowMs = 15 * 60 * 1000;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Sign-in request rejected." }, { status: 403 });
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const attempts = loginAttempts.get(address);
  if (attempts && now - attempts.windowStart < attemptWindowMs && attempts.count >= maxAttempts) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }
  if (!attempts || now - attempts.windowStart >= attemptWindowMs) {
    loginAttempts.set(address, { count: 1, windowStart: now });
  } else {
    attempts.count += 1;
  }

  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || body.password.length > 200) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  try {
    const user = await verifyPassword(body.email, body.password);
    if (!user) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    loginAttempts.delete(address);
    const { token, expiresAt } = await createUserSession(user.id);
    const response = NextResponse.json({ user, expiresAt });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Sign-in failed while accessing MySQL.", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
}
