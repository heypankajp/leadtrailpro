import { NextResponse } from "next/server";
import { clientAddress, handleRouteError, jsonError, readJsonBody, requireSameOrigin, userAgent } from "@/lib/http";
import { isMailerConfigured, sendMail, twoFactorEmail } from "@/lib/mailer";
import {
  createTwoFactorChallenge, createUserSession, isLoginRateLimited, recordLoginAttempt, sessionCookieName, sessionCookieOptions,
  twoFactorCookieName, twoFactorCookieOptions, verifyPassword,
} from "@/features/users/session";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password || email.length > 254 || password.length > 200) {
      return jsonError(400, "Enter a valid email and password.");
    }
    const ipAddress = clientAddress(request);
    const agent = userAgent(request);
    if (await isLoginRateLimited(email, ipAddress)) {
      return jsonError(429, "Too many sign-in attempts. Try again in 15 minutes.");
    }
    const user = await verifyPassword(email, password);
    if (!user) {
      await recordLoginAttempt({ userId: null, email, succeeded: false, ipAddress, userAgent: agent });
      return jsonError(401, "Email or password is incorrect.");
    }
    if (user.twoFactorEnabled) {
      if (!isMailerConfigured()) {
        return jsonError(503, "Two-factor sign-in needs email delivery, which is not configured yet. Ask an administrator to add the SMTP settings or turn off two-factor for your account.");
      }
      const { challenge, code } = await createTwoFactorChallenge(user.id);
      await sendMail({ to: user.email, ...twoFactorEmail(user.firstName, code) });
      const response = NextResponse.json({ requiresTwoFactor: true, email: user.email });
      response.cookies.set(twoFactorCookieName, challenge, twoFactorCookieOptions);
      return response;
    }
    await recordLoginAttempt({ userId: user.id, email, succeeded: true, ipAddress, userAgent: agent });
    const { token, expiresAt } = await createUserSession(user.id);
    const response = NextResponse.json({ user, expiresAt });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);
    return response;
  } catch (error) {
    return handleRouteError(error, "Sign-in");
  }
}
