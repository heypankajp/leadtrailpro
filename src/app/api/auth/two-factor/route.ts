import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientAddress, handleRouteError, jsonError, readJsonBody, requireSameOrigin, userAgent } from "@/lib/http";
import { getUser } from "@/features/users/repository";
import {
  clearedCookieOptions, createUserSession, recordLoginAttempt, sessionCookieName, sessionCookieOptions, twoFactorCookieName, verifyTwoFactorChallenge,
} from "@/features/users/session";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request);
    const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
    const cookieStore = await cookies();
    const challenge = cookieStore.get(twoFactorCookieName)?.value ?? "";
    const result = await verifyTwoFactorChallenge(challenge, code);
    if ("error" in result) return jsonError(401, result.error);
    const user = await getUser(result.userId);
    if (!user || !user.active) return jsonError(401, "This account can no longer sign in.");
    await recordLoginAttempt({ userId: user.id, email: user.email, succeeded: true, ipAddress: clientAddress(request), userAgent: userAgent(request) });
    const { token, expiresAt } = await createUserSession(user.id);
    const response = NextResponse.json({ user, expiresAt });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);
    response.cookies.set(twoFactorCookieName, "", clearedCookieOptions);
    return response;
  } catch (error) {
    return handleRouteError(error, "Two-factor verification");
  }
}
