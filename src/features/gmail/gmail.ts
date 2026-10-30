/**
 * Gmail linking (MAIL-01, MAIL-03): each user authorizes read-only access to their own mailbox; the refresh token is
 * stored AES-256-GCM encrypted under GMAIL_TOKEN_KEY in `gmail_connections`. The lead Emails tab lists recent
 * messages whose participants include one of the lead's client email addresses.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDatabasePool } from "@/lib/db";
import { appBaseUrl } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import type { LeadEmail } from "./model";

export type { LeadEmail } from "./model";

export const gmailScope = "https://www.googleapis.com/auth/gmail.readonly openid email";
export const gmailStateCookie = "leadtrailpro_gmail_state";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const tokenKey = process.env.GMAIL_TOKEN_KEY;
  if (!clientId || !clientSecret || !tokenKey) return null;
  return { clientId, clientSecret, tokenKey };
}

export function redirectUri(request: Request) {
  return process.env.GOOGLE_REDIRECT_URI || `${appBaseUrl(request)}/api/gmail/callback`;
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

export async function exchangeCode(code: string, request: Request) {
  const config = googleConfig();
  if (!config) throw new Error("Gmail is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string };
  if (!response.ok || !data.access_token) throw new Error("Google rejected the authorization code.");
  return data;
}

export function emailFromIdToken(idToken: string | undefined) {
  try {
    const payload = JSON.parse(Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return payload.email || null;
  } catch {
    return null;
  }
}

async function accessTokenFor(refreshToken: string) {
  const config = googleConfig();
  if (!config) throw new Error("Gmail is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
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
type GmailMessage = { id: string; snippet?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } };

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
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
    { headers, cache: "no-store" },
  );
  if (!list.ok) throw new Error("Gmail could not list messages.");
  const { messages = [] } = await list.json() as { messages?: { id: string }[] };
  const details = await Promise.all(messages.map(async ({ id }) => {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
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
    } satisfies LeadEmail];
  });
}

export async function recentLeadEmails(addresses: string[], scope: { userId: number } | "all") {
  const config = googleConfig();
  if (!config || addresses.length === 0) return { emails: [] as LeadEmail[], failures: 0 };
  const { rows } = await getDatabasePool().query(
    `SELECT google_email, refresh_token_encrypted FROM gmail_connections ${scope === "all" ? "" : "WHERE user_id = ?"}`,
    scope === "all" ? [] : [scope.userId],
  );
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
