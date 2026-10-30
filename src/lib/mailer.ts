import nodemailer from "nodemailer";
import { getDatabasePool, fromSqlDateTime, toSqlDateTime } from "@/lib/db";

/**
 * Outbound email with a provider switch:
 *   MAIL_PROVIDER=stub   nothing is sent; every message is recorded in `mail_outbox` with its text so reset links
 *                        and sign-in codes can be read from Settings → Email delivery (development, or until the
 *                        Google Workspace mailbox exists)
 *   MAIL_PROVIDER=smtp   send through SMTP_* (the default whenever those settings are present); deliveries and
 *                        failures are recorded without the body
 *   MAIL_PROVIDER=off    email features report "not configured" even if SMTP_* is set
 *
 *   SMTP_HOST=smtp.example.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false          # true for implicit TLS on port 465
 *   SMTP_USER=mailer@example.com
 *   SMTP_PASSWORD=...
 *   SMTP_FROM="LeadTrailPro <no-reply@example.com>"
 */

type MailerConfig = { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };

export type MailProvider = "stub" | "smtp" | "off";

export function getMailerConfig(): MailerConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from,
  };
}

export function getMailProvider(): MailProvider {
  const mode = (process.env.MAIL_PROVIDER || "").trim().toLowerCase();
  if (mode === "stub") return "stub";
  if (mode === "off") return "off";
  return getMailerConfig() ? "smtp" : "off";
}

export function isMailerConfigured(): boolean {
  return getMailProvider() !== "off";
}

let transport: nodemailer.Transporter | undefined;

function getTransport(config: MailerConfig) {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
  });
  return transport;
}

export class MailerNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured. Add the SMTP_* settings to .env.local, or set MAIL_PROVIDER=stub to record messages without sending.");
  }
}

export type OutboxStatus = "stubbed" | "sent" | "failed";
export type OutboxEntry = { id: number; to: string; subject: string; status: OutboxStatus; error: string | null; text: string | null; createdAt: string };

const outboxRetention = 500;

/** Records a delivery attempt; a missing table (schema not upgraded yet) must never break the caller. */
async function recordOutbox(entry: { to: string; subject: string; status: OutboxStatus; error?: string | null; text?: string | null }) {
  try {
    const db = getDatabasePool();
    await db.query(
      "INSERT INTO mail_outbox (to_address, subject, status, error, text_body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [entry.to.slice(0, 254), entry.subject.slice(0, 255), entry.status, entry.error ? entry.error.slice(0, 500) : null, entry.text ?? null, toSqlDateTime(new Date())],
    );
    await db.query("DELETE FROM mail_outbox WHERE id < (SELECT COALESCE(MIN(id), 0) FROM (SELECT id FROM mail_outbox ORDER BY id DESC LIMIT ?) AS recent)", [outboxRetention]);
  } catch (error) {
    console.error("Mail outbox could not be written.", error instanceof Error ? error.message : error);
  }
}

export async function sendMail(message: { to: string; subject: string; text: string; html?: string }) {
  const provider = getMailProvider();
  if (provider === "off") throw new MailerNotConfiguredError();
  if (provider === "stub") {
    console.log(`[mail stub] to ${message.to}: ${message.subject}`);
    await recordOutbox({ to: message.to, subject: message.subject, status: "stubbed", text: message.text });
    return;
  }
  const config = getMailerConfig()!;
  try {
    await getTransport(config).sendMail({ from: config.from, ...message });
    await recordOutbox({ to: message.to, subject: message.subject, status: "sent" });
  } catch (error) {
    await recordOutbox({ to: message.to, subject: message.subject, status: "failed", error: error instanceof Error ? error.message : "Unknown error" });
    throw error;
  }
}

/** Latest deliveries, newest first; bodies are present only for stubbed messages. */
export async function listOutbox(limit = 20): Promise<OutboxEntry[]> {
  try {
    const { rows } = await getDatabasePool().query(
      `SELECT id, to_address AS "to", subject, status, error, text_body AS text, created_at AS "createdAt" FROM mail_outbox ORDER BY id DESC LIMIT ${Math.min(Math.max(limit, 1), 100)}`,
    );
    return (rows as { id: number; to: string; subject: string; status: OutboxStatus; error: string | null; text: string | null; createdAt: string }[]).map((row) => ({
      ...row, id: Number(row.id), createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
    }));
  } catch {
    return [];
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));

export function passwordResetEmail(firstName: string, resetUrl: string) {
  const text = `Hi ${firstName},\n\nUse the link below to set a new LeadTrailPro password. It expires in 30 minutes.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<p>Hi ${escapeHtml(firstName)},</p><p>Use the link below to set a new LeadTrailPro password. It expires in 30 minutes.</p><p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p><p>If you did not request this, you can ignore this email.</p>`;
  return { subject: "Reset your LeadTrailPro password", text, html };
}

export function twoFactorEmail(firstName: string, code: string) {
  const text = `Hi ${firstName},\n\nYour LeadTrailPro sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not try to sign in, change your password.`;
  const html = `<p>Hi ${escapeHtml(firstName)},</p><p>Your LeadTrailPro sign-in code is <strong style="font-size:20px;letter-spacing:3px">${escapeHtml(code)}</strong>. It expires in 10 minutes.</p><p>If you did not try to sign in, change your password.</p>`;
  return { subject: "Your LeadTrailPro sign-in code", text, html };
}
