/**
 * Gmail linking (MAIL-01, MAIL-03): read-only access to each user's own mailbox, granted together with the first
 * Sign in with Google sign-in (or renewed from a lead's Emails tab through `/api/gmail/connect`); the refresh token is
 * stored AES-256-GCM encrypted under GMAIL_TOKEN_KEY in `gmail_connections`. The lead Emails tab lists recent messages
 * whose participants include one of the lead's client email addresses. Both consent flows return to
 * `/api/auth/google/callback` (see `features/users/google-signin.ts`).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDatabasePool } from "@/lib/db";
import { googleRedirectUri, googleScope } from "@/features/users/google-signin";
import { recordAudit } from "@/features/audit/repository";
import type { LeadEmail } from "./model";

export type { LeadEmail } from "./model";

/**
 * Google endpoints, overridable from the environment (the OAuth client JSON lists them as auth_uri and token_uri).
 * GOOGLE_PROJECT_ID is informational only; the certificate URL in that file is not used because the app never
 * verifies an ID token itself.
 */
export function googleEndpoints() {
  return {
    authUri: process.env.GOOGLE_AUTH_URI?.trim() || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUri: process.env.GOOGLE_TOKEN_URI?.trim() || "https://oauth2.googleapis.com/token",
    projectId: process.env.GOOGLE_PROJECT_ID?.trim() || null,
  };
}

/** Gmail REST base URL; GMAIL_API_URI points it at a stand-in during tests. */
export const gmailApiUri = () => (process.env.GMAIL_API_URI?.trim() || "https://gmail.googleapis.com").replace(/\/+$/, "");

/** The OAuth client (type "Web application") shared by Gmail linking and Sign in with Google (AUTH-03). */
export function googleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleConfig() {
  const client = googleOAuthClient();
  const tokenKey = process.env.GMAIL_TOKEN_KEY;
  if (!client || !tokenKey) return null;
  return { ...client, tokenKey };
}

/**
 * Google's consent page for one round trip (sign-in or reconnect): identity plus read-only Gmail, offline access so a
 * refresh token comes back, PKCE. `prompt=consent` forces a fresh refresh token (reconnect); `select_account` lets a
 * returning person pick the account without consenting again.
 */
export function consentUrl(origin: string, round: { state: string; challenge: string }, prompt: "select_account" | "consent") {
  const client = googleOAuthClient();
  if (!client) throw new Error("The Google OAuth client is not configured.");
  const url = new URL(googleEndpoints().authUri);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: googleScope,
    access_type: "offline",
    include_granted_scopes: "true",
    code_challenge: round.challenge,
    code_challenge_method: "S256",
    prompt,
    state: round.state,
  }).toString();
  return url;
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encryptToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decryptToken(value: string, secret: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * Exchanges an authorization code at Google's token endpoint. `callbackUrl` must equal the redirect URI the consent
 * request used; `codeVerifier` completes a PKCE flow.
 */
export async function exchangeCode(code: string, callbackUrl: string, codeVerifier?: string) {
  const client = googleOAuthClient();
  if (!client) throw new Error("The Google OAuth client is not configured.");
  const body = new URLSearchParams({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: callbackUrl,
    grant_type: "authorization_code",
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);
  const response = await fetch(googleEndpoints().tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    const reason = data.error ? ` (${data.error}${data.error_description ? `: ${data.error_description}` : ""})` : "";
    throw new Error(`Google rejected the authorization code${reason}.`);
  }
  return data;
}

export async function accessTokenFor(refreshToken: string) {
  const config = googleConfig();
  if (!config) throw new Error("Gmail is not configured.");
  const response = await fetch(googleEndpoints().tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json() as { access_token?: string };
  if (!response.ok || !data.access_token) throw new Error("Gmail access expired. Reconnect Gmail.");
  return data.access_token;
}

/** Decrypts a stored refresh token with GMAIL_TOKEN_KEY. */
export function decryptStoredToken(value: string): string {
  const config = googleConfig();
  if (!config) throw new Error("Gmail is not configured.");
  return decryptToken(value, config.tokenKey);
}

export async function saveConnection(userId: number, googleEmail: string, refreshToken: string) {
  const config = googleConfig();
  if (!config) throw new Error("Gmail is not configured.");
  await getDatabasePool().query(
    `INSERT INTO gmail_connections (user_id, google_email, refresh_token_encrypted) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET google_email = EXCLUDED.google_email, refresh_token_encrypted = EXCLUDED.refresh_token_encrypted`,
    [userId, googleEmail, encryptToken(refreshToken, config.tokenKey)],
  );
  await recordAudit(getDatabasePool(), { actorId: userId, action: "gmail.connected", entityType: "user", entityId: userId, after: { googleEmail }, details: `Connected Gmail account ${googleEmail}` });
}

export async function getConnectionEmail(userId: number) {
  const { rows } = await getDatabasePool().query("SELECT google_email FROM gmail_connections WHERE user_id = ?", [userId]);
  return rows[0]?.google_email as string | undefined;
}

export async function removeConnection(userId: number) {
  const googleEmail = await getConnectionEmail(userId);
  if (!googleEmail) return;
  await getDatabasePool().query("DELETE FROM gmail_connections WHERE user_id = ?", [userId]);
  await recordAudit(getDatabasePool(), { actorId: userId, action: "gmail.disconnected", entityType: "user", entityId: userId, before: { googleEmail }, details: `Disconnected Gmail account ${googleEmail}` });
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; threadId?: string; snippet?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } };

function findBody(part: GmailPart | undefined, mimeType: string): string {
  if (!part) return "";
  if (part.mimeType === mimeType && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts ?? []) {
    const found = findBody(child, mimeType);
    if (found) return found;
  }
  return "";
}

function messageText(message: GmailMessage) {
  const plain = findBody(message.payload, "text/plain");
  const html = plain ? "" : findBody(message.payload, "text/html");
  const text = plain || html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return (text.trim() || message.snippet || "").slice(0, 20000);
}

async function mailboxEmails(googleEmail: string, refreshToken: string, addresses: string[]): Promise<LeadEmail[]> {
  const accessToken = await accessTokenFor(refreshToken);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const clause = addresses.join(" OR ");
  const query = `from:(${clause}) OR to:(${clause}) OR cc:(${clause})`;
  const list = await fetch(
    `${gmailApiUri()}/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query)}`,
    { headers, cache: "no-store" },
  );
  if (!list.ok) throw new Error("Gmail could not list messages.");
  const { messages = [] } = await list.json() as { messages?: { id: string }[] };
  const details = await Promise.all(messages.map(async ({ id }) => {
    const response = await fetch(
      `${gmailApiUri()}/gmail/v1/users/me/messages/${id}?format=full`,
      { headers, cache: "no-store" },
    );
    return response.ok ? await response.json() as GmailMessage : null;
  }));
  return details.flatMap((message) => {
    if (!message) return [];
    const header = (name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? "";
    const from = header("from");
    const headerAddresses = new Set(
      `${from},${header("to")},${header("cc")}`.match(/[^\s<>,;"']+@[^\s<>,;"']+/g)?.map((address) => address.toLowerCase()) ?? [],
    );
    if (!addresses.some((address) => headerAddresses.has(address.toLowerCase()))) return [];
    const parsed = new Date(header("date"));
    return [{
      id: `${googleEmail}:${message.id}`,
      direction: from.toLowerCase().includes(googleEmail.toLowerCase()) ? "sent" : "received",
      from,
      to: header("to"),
      cc: header("cc"),
      subject: header("subject") || "(no subject)",
      snippet: messageText(message),
      date: Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString(),
      mailbox: googleEmail,
      threadId: message.threadId ?? "",
      messageId: header("message-id"),
    } satisfies LeadEmail];
  });
}

/**
 * Mailboxes searched: every connected one for team-report viewers; otherwise the viewer's own plus any colleague's mailbox in
 * which the mailbox watch (watch.ts) has stored mail for this lead, so a person helping on a lead sees the client thread.
 */
export async function recentLeadEmails(addresses: string[], scope: { userId: number; leadId?: number } | "all") {
  const config = googleConfig();
  if (!config || addresses.length === 0) return { emails: [] as LeadEmail[], failures: 0 };
  const where = scope === "all" ? "" : scope.leadId ? "WHERE user_id = ? OR LOWER(google_email) IN (SELECT mailbox FROM lead_emails WHERE lead_id = ?)" : "WHERE user_id = ?";
  const params = scope === "all" ? [] : scope.leadId ? [scope.userId, scope.leadId] : [scope.userId];
  const { rows } = await getDatabasePool().query(`SELECT google_email, refresh_token_encrypted FROM gmail_connections ${where}`, params);
  let failures = 0;
  const results = await Promise.all(rows.map(async (row) => {
    try {
      return await mailboxEmails(row.google_email, decryptToken(row.refresh_token_encrypted, config.tokenKey), addresses);
    } catch {
      failures += 1;
      return [];
    }
  }));
  const emails = results.flat().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
  return { emails, failures };
}
