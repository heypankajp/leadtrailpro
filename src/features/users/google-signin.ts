/**
 * Google OAuth round trips (AUTH-03, MAIL-01). One OAuth client, one callback (`/api/auth/google/callback`), two
 * purposes told apart by the state cookie: `signin` (Sign in with Google: identity plus read-only Gmail asked once,
 * the mailbox token stored for the lead Emails tab) and `connect` (a signed-in person renewing or adding the mailbox
 * link from the Emails tab). No account is created on the way in (AUTH-01): the people who may sign in come from
 * `seed/accounts.csv` or Admin → Users.
 *
 * This module has no app imports so the unit tests can load it directly.
 */
import { createHash, randomBytes } from "node:crypto";

export const mailboxScope = "https://www.googleapis.com/auth/gmail.readonly";
export const sendScope = "https://www.googleapis.com/auth/gmail.send";
/** Asked at sign-in and when reconnecting: who the person is, read-only Gmail for the lead Emails tab, and sending from the mailbox. */
export const googleScope = `openid email profile ${mailboxScope} ${sendScope}`;
export const googleStateCookie = "leadtrailpro_google_state";
export const googleStateCookiePath = "/api/auth/google";

export type GooglePurpose = "signin" | "connect";
export type GoogleState = { purpose: GooglePurpose; state: string; verifier: string };
export type GoogleProfile = { email: string; firstName: string; lastName: string };

/** Where Google sends the browser back for both purposes; must be registered on the OAuth client. */
export function googleRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/auth/google/callback`;
}

/** Fresh state and PKCE pair for one round trip: the cookie keeps purpose, state, and verifier; Google sees state and challenge. */
export function newGoogleState(purpose: GooglePurpose): GoogleState & { challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { purpose, state: randomBytes(24).toString("base64url"), verifier, challenge };
}

export const encodeGoogleState = ({ purpose, state, verifier }: GoogleState) => `${purpose}.${state}.${verifier}`;

export function decodeGoogleState(value: string | undefined): GoogleState | null {
  const [purpose, state, verifier, ...rest] = (value ?? "").split(".");
  if (rest.length || (purpose !== "signin" && purpose !== "connect") || !state || !verifier) return null;
  return { purpose, state, verifier };
}

/** Whether the scopes Google granted (the token response's `scope`) include the mailbox; people can untick it. */
export function grantsMailbox(grantedScope: string | undefined) {
  return (grantedScope ?? "").split(/\s+/).includes(mailboxScope);
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Identity claims of the ID token that Google's token endpoint returned with the access token. The token came over TLS
 * straight from Google in exchange for the code, so its signature is not checked here (Google documents that as
 * sufficient); the email must still carry `email_verified` before it identifies anyone.
 */
export function profileFromIdToken(idToken: string | undefined): GoogleProfile | null {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object") return null;
  const email = text(claims.email).toLowerCase();
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!email || !email.includes("@") || !verified) return null;
  const given = text(claims.given_name);
  const family = text(claims.family_name);
  const [first = "", ...rest] = text(claims.name).split(/\s+/).filter(Boolean);
  return {
    email,
    firstName: (given || first || email.split("@")[0]).slice(0, 80),
    lastName: (family || (given ? "" : rest.join(" "))).slice(0, 80),
  };
}
