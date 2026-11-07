import MailComposer from "nodemailer/lib/mail-composer";
import { getDatabasePool } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { accessTokenFor, decryptStoredToken, gmailApiUri, googleConfig } from "./gmail";

/**
 * Sending through the Gmail API with a connected mailbox's token (MAIL-02 groundwork, system email): the message is
 * built as MIME by nodemailer's composer and posted to `users.messages.send`, so it lands in the sender's Sent folder
 * like any other email. Used by the system mailer (MAIL_PROVIDER=gmail, sending from the mailbox chosen under
 * Settings → Email delivery) and by Send email on a lead (the signed-in person's own mailbox).
 */

export type GmailAttachment = { filename: string; content: Buffer; contentType?: string };
export type GmailSendInput = {
  fromName?: string; to: string[]; cc?: string[]; subject: string; text: string; html?: string; attachments?: GmailAttachment[];
  /** Gmail thread to reply into, when known. */
  threadId?: string | null; inReplyTo?: string | null;
};

/** The connected mailbox of a user: its address and decrypted refresh token. */
export async function senderMailbox(userId: number): Promise<{ email: string; refreshToken: string } | null> {
  const config = googleConfig();
  if (!config) return null;
  const { rows } = await getDatabasePool().query("SELECT google_email AS email, refresh_token_encrypted AS token FROM gmail_connections WHERE user_id = ?", [userId]);
  const row = (rows as { email: string; token: string }[])[0];
  return row ? { email: row.email, refreshToken: decryptStoredToken(row.token) } : null;
}

/** Builds the MIME message and sends it from the mailbox; returns Gmail's message and thread ids. */
export async function sendFromMailbox(mailbox: { email: string; refreshToken: string }, input: GmailSendInput): Promise<{ id: string; threadId: string }> {
  const accessToken = await accessTokenFor(mailbox.refreshToken);
  const from = input.fromName ? `"${input.fromName.replace(/"/g, "")}" <${mailbox.email}>` : mailbox.email;
  const composer = new MailComposer({
    from, to: input.to, cc: input.cc?.length ? input.cc : undefined, subject: input.subject, text: input.text, html: input.html,
    attachments: input.attachments?.map((item) => ({ filename: item.filename, content: item.content, contentType: item.contentType })),
    inReplyTo: input.inReplyTo ?? undefined, references: input.inReplyTo ?? undefined,
  });
  const raw = (await composer.compile().build()).toString("base64url");
  const response = await fetch(`${gmailApiUri()}/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(input.threadId ? { raw, threadId: input.threadId } : { raw }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as { id?: string; threadId?: string; error?: { message?: string; status?: string } };
  if (!response.ok || !data.id) {
    const reason = data.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 403 && /insufficient|scope/i.test(reason)) throw new HttpError(409, "This mailbox did not grant permission to send email. Reconnect Gmail from a lead's Emails tab and allow sending.");
    throw new Error(`Gmail could not send the message (${reason}).`);
  }
  return { id: data.id, threadId: data.threadId ?? "" };
}
