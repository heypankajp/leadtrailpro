import { api } from "@/lib/api";
import type { GmailStatus, LeadEmail } from "./model";

export const gmailConnectUrl = "/api/gmail/connect";
export const fetchGmailStatus = () => api<GmailStatus>("/api/gmail");
export const disconnectGmail = () => api<{ ok: true }>("/api/gmail", { method: "DELETE" });
export const fetchLeadEmails = (leadId: number) => api<{ emails: LeadEmail[]; failures: number }>(`/api/leads/${leadId}/emails`);
