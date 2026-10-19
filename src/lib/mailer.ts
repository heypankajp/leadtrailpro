import nodemailer from "nodemailer";

/**
 * Outbound email. The transport stays dormant until SMTP_* settings exist in .env.local:
 *   SMTP_HOST=smtp.example.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false          # true for implicit TLS on port 465
 *   SMTP_USER=mailer@example.com
 *   SMTP_PASSWORD=...
 *   SMTP_FROM="SalesTrackPro <no-reply@example.com>"
 */

type MailerConfig = { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };

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

export function isMailerConfigured(): boolean {
  return getMailerConfig() !== null;
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
    super("Email delivery is not configured. Add the SMTP_* settings to .env.local.");
  }
}

export async function sendMail(message: { to: string; subject: string; text: string; html?: string }) {
  const config = getMailerConfig();
  if (!config) throw new MailerNotConfiguredError();
  await getTransport(config).sendMail({ from: config.from, ...message });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));

export function passwordResetEmail(firstName: string, resetUrl: string) {
  const text = `Hi ${firstName},\n\nUse the link below to set a new SalesTrackPro password. It expires in 30 minutes.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<p>Hi ${escapeHtml(firstName)},</p><p>Use the link below to set a new SalesTrackPro password. It expires in 30 minutes.</p><p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p><p>If you did not request this, you can ignore this email.</p>`;
  return { subject: "Reset your SalesTrackPro password", text, html };
}

export function twoFactorEmail(firstName: string, code: string) {
  const text = `Hi ${firstName},\n\nYour SalesTrackPro sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not try to sign in, change your password.`;
  const html = `<p>Hi ${escapeHtml(firstName)},</p><p>Your SalesTrackPro sign-in code is <strong style="font-size:20px;letter-spacing:3px">${escapeHtml(code)}</strong>. It expires in 10 minutes.</p><p>If you did not try to sign in, change your password.</p>`;
  return { subject: "Your SalesTrackPro sign-in code", text, html };
}
