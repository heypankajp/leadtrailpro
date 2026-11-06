import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/http";
import { consentUrl, googleOAuthClient } from "@/features/gmail/gmail";
import { encodeGoogleState, googleStateCookie, newGoogleState } from "@/features/users/google-signin";
import { getRequestUser, googleStateCookieOptions } from "@/features/users/session";

/**
 * Starts Sign in with Google (AUTH-03): one consent for identity and read-only Gmail, PKCE, and a state cookie with
 * purpose `signin` that the shared callback checks. Returning people only see Google's account picker.
 */
export async function GET(request: Request) {
  const origin = appBaseUrl(request);
  if (await getRequestUser()) return NextResponse.redirect(new URL("/", origin));
  if (!googleOAuthClient()) return NextResponse.redirect(new URL("/?login=not_configured", origin));
  const round = newGoogleState("signin");
  (await cookies()).set(googleStateCookie, encodeGoogleState(round), googleStateCookieOptions);
  return NextResponse.redirect(consentUrl(origin, round, "select_account"));
}
