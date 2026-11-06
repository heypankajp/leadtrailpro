import { api } from "@/lib/api";
import type { GmailStatus, LeadEmail } from "./model";

export const gmailConnectUrl = "/api/gmail/connect";
export const fetchGmailStatus = () => api<GmailStatus>("/api/gmail");
export const disconnectGmail = () => api<{ ok: true }>("/api/gmail", { method: "DELETE" });
export const fetchLeadEmails = (leadId: number) => api<{ emails: LeadEmail[]; failures: number }>(`/api/leads/${leadId}/emails`);
export const sendLeadEmail = (leadId: number, input: { to: string; cc: string; subject: string; body: string; attachmentIds: number[]; threadId: string | null; inReplyTo: string | null }) =>
  api<{ id: string; threadId: string }>(`/api/leads/${leadId}/emails/send`, { method: "POST", json: input });
