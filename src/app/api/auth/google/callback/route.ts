import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appBaseUrl, clientAddress, userAgent } from "@/lib/http";
import { exchangeCode, getConnectionEmail, googleConfig, saveConnection } from "@/features/gmail/gmail";
import { decodeGoogleState, googleRedirectUri, googleStateCookie, googleStateCookiePath, grantsMailbox, profileFromIdToken } from "@/features/users/google-signin";
import { getUserByEmail } from "@/features/users/repository";
import { createUserSession, getRequestUser, recordLoginAttempt, sessionCookieName, sessionCookieOptions } from "@/features/users/session";

/**
 * Google returns here for both purposes. Sign-in: match the verified Google email to an active account, create the
 * session, and store the mailbox token Google issued (first consent); anything else lands on `/?login=<status>`,
 * which the sign-in screen shows as a message. Connect: store a fresh mailbox token for the signed-in person and land
 * on `/?gmail=<status>`, which the shell shows as a toast.
 */
export async function GET(request: Request) {
  const origin = appBaseUrl(request);
  const jar = await cookies();
  const round = decodeGoogleState(jar.get(googleStateCookie)?.value);
  jar.delete({ name: googleStateCookie, path: googleStateCookiePath });
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const purpose = round?.purpose ?? "signin";
  const outcome = (status: string) => NextResponse.redirect(new URL(purpose === "connect" ? `/?gmail=${status}` : `/?login=${status}`, origin));
  if (!round || params.get("state") !== round.state || !code) return outcome("denied");
  try {
    const tokens = await exchangeCode(code, googleRedirectUri(origin), round.verifier);
    const profile = profileFromIdToken(tokens.id_token);
    if (!profile) return outcome("failed");
    const mailbox = grantsMailbox(tokens.scope);

    if (purpose === "connect") {
      const user = await getRequestUser();
      if (!user) return NextResponse.redirect(new URL("/", origin));
      if (!mailbox) return outcome("denied");
      if (!tokens.refresh_token) return outcome("failed");
      await saveConnection(user.id, profile.email, tokens.refresh_token);
      return outcome("connected");
    }

    const attempt = { ipAddress: clientAddress(request), userAgent: userAgent(request) };
    // AUTH-01: only an account an administrator (or the seed file) added may sign in; nothing is created here.
    const user = await getUserByEmail(profile.email);
    if (!user || !user.active) {
      await recordLoginAttempt({ userId: null, email: profile.email, succeeded: false, ...attempt });
      return outcome("unknown_account");
    }
    await recordLoginAttempt({ userId: user.id, email: user.email, succeeded: true, ...attempt });
    const { token } = await createUserSession(user.id);
    // Mailbox link: stored when Google issued a refresh token (first consent); kept when it did not (returning person);
    // renewed through the connect flow when nothing is stored; skipped with a note when the Gmail box was unticked.
    let landing = "/";
    if (!mailbox) landing = "/?gmail=declined";
    else if (googleConfig() && tokens.refresh_token) {
      await saveConnection(user.id, profile.email, tokens.refresh_token);
      landing = "/?gmail=connected";
    } else if (googleConfig() && !(await getConnectionEmail(user.id))) landing = "/api/gmail/connect";
    const response = NextResponse.redirect(new URL(landing, origin));
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Google callback failed.", error instanceof Error ? error.message : "Unknown error");
    return outcome("failed");
  }
}
