import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { getAttachmentWithStorage } from "@/features/attachments/repository";
import { readAttachmentFile } from "@/features/attachments/storage";
import { senderMailbox, sendFromMailbox, type GmailAttachment } from "@/features/gmail/send";
import { getLead, logActivity } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };
const address = /^[^\s"'()<>,;\\]+@[^\s"'()<>,;\\]+\.[^\s"'()<>,;\\]+$/;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));

const addressList = (value: unknown, max: number): string[] | null => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\s]+/) : [];
  const list = [...new Set(raw.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (list.length > max || list.some((item) => !address.test(item))) return null;
  return list;
};

/**
 * Sends an email to the lead's contacts from the signed-in person's own Gmail (MAIL-02 groundwork): the message goes
 * out through the Gmail API, lands in their Sent folder, so the Emails tab shows it with the replies, and the timeline
 * records an email. Attachments are the lead's own documents.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "log_activities", "You do not have permission to email from a deal.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid deal ID.");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Deal not found.");
    const body = (await readJsonBody(request)) ?? {};
    const to = addressList(body.to, 10);
    const cc = addressList(body.cc, 10);
    const subject = asString(body.subject, 200);
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 20000) : "";
    if (!to || !to.length) return jsonError(400, "Enter at least one valid recipient address (up to ten).");
    if (!cc) return jsonError(400, "The Cc addresses are not valid.");
    if (!subject) return jsonError(400, "Enter a subject.");
    if (!text) return jsonError(400, "Write the message.");
    const mailbox = await senderMailbox(user.id);
    if (!mailbox) return jsonError(409, "Your Gmail is not connected. Sign in with Google and allow sending, or connect Gmail from this tab.");
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0).slice(0, 10) : [];
    const attachments: GmailAttachment[] = [];
    for (const attachmentId of attachmentIds) {
      const attachment = await getAttachmentWithStorage(attachmentId);
      if (!attachment || attachment.leadId !== id || attachment.deletedAt) return jsonError(400, "One of the attachments does not belong to this deal.");
      attachments.push({ filename: attachment.fileName, content: await readAttachmentFile(attachment.storageKey), contentType: attachment.mimeType });
    }
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(text).split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
    const sent = await sendFromMailbox(mailbox, {
      fromName: user.name, to, cc, subject, text, html, attachments,
      threadId: asString(body.threadId, 100) || null, inReplyTo: asString(body.inReplyTo, 300) || null,
    });
    await logActivity(lead, user, {
      type: "email", summary: subject, occurredAt: new Date(),
      body: [`To: ${to.join(", ")}`, cc.length ? `Cc: ${cc.join(", ")}` : "", attachments.length ? `Attachments: ${attachments.map((item) => item.filename).join(", ")}` : "", "", text].filter((line, index) => line || index === 3).join("\n"),
    });
    return NextResponse.json({ id: sent.id, threadId: sent.threadId });
  } catch (error) {
    return handleRouteError(error, "Send deal email");
  }
}
