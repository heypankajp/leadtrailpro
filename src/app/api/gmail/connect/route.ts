import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestUser } from "@/features/users/session";
import { gmailScope, gmailStateCookie, googleConfig, redirectUri } from "@/features/gmail/gmail";

export async function GET(request: Request) {
  const user = await getRequestUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL("/?gmail=not_configured", request.url));
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(gmailStateCookie, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/gmail",
    maxAge: 600,
  });
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
