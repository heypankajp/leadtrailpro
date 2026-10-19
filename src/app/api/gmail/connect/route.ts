import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/http";
import { gmailScope, gmailStateCookie, googleConfig, redirectUri } from "@/features/gmail/gmail";
import { getRequestUser, secureCookies } from "@/features/users/session";

/** Starts the Google OAuth consent flow for the signed-in user (read-only Gmail scope, offline access). */
export async function GET(request: Request) {
  const user = await getRequestUser();
  if (!user) return NextResponse.redirect(new URL("/", appBaseUrl(request)));
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL("/?gmail=not_configured", appBaseUrl(request)));
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(gmailStateCookie, state, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/api/gmail", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: gmailScope,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return NextResponse.redirect(url);
}
