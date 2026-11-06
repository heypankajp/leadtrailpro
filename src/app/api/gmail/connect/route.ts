import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/http";
import { consentUrl, googleConfig } from "@/features/gmail/gmail";
import { encodeGoogleState, googleStateCookie, newGoogleState } from "@/features/users/google-signin";
import { getRequestUser, googleStateCookieOptions } from "@/features/users/session";

/**
 * Adds or renews the signed-in person's Gmail link (MAIL-01): the same consent as sign-in, with `prompt=consent` so
 * Google issues a fresh refresh token, and purpose `connect` in the state cookie. Returns through
 * `/api/auth/google/callback`. Used from the Emails tab, and by the callback itself for a returning person who has no
 * stored token.
 */
export async function GET(request: Request) {
  const origin = appBaseUrl(request);
  if (!(await getRequestUser())) return NextResponse.redirect(new URL("/", origin));
  if (!googleConfig()) return NextResponse.redirect(new URL("/?gmail=not_configured", origin));
  const round = newGoogleState("connect");
  (await cookies()).set(googleStateCookie, encodeGoogleState(round), googleStateCookieOptions);
  return NextResponse.redirect(consentUrl(origin, round, "consent"));
}
