import { api, toQuery } from "@/lib/api";
import type { LeadAttachment } from "@/features/attachments/model";
import type { AuditEntry } from "@/features/audit/model";
import type { Task } from "@/features/tasks/model";
import type { LeadActivity, LeadInput, LeadPage, LeadRecordState, LeadSortKey, LeadSummary, LoggableActivityType } from "./model";

export type LeadQuery = Partial<{
  state: LeadRecordState; q: string; mine: boolean; statusCode: string; statusId: number; leadTypeId: number; leadCategoryId: number;
  companySizeId: number; cityId: number; ownerId: number; clientResponseId: number; bdActionId: number;
  firstContactFrom: string; firstContactTo: string; followUpFrom: string; followUpTo: string; contractSignedFrom: string; contractSignedTo: string;
  sort: LeadSortKey; direction: "asc" | "desc"; page: number; pageSize: number;
}>;

export type LeadDetail = {
  lead: LeadSummary;
  activities: LeadActivity[];
  tasks: Task[];
  attachments: LeadAttachment[];
  audit: AuditEntry[];
  permissions: { edit: boolean };
};

export const fetchLeads = (query: LeadQuery) => api<LeadPage>(`/api/leads${toQuery(query)}`);
export const fetchLead = (id: number) => api<LeadDetail>(`/api/leads/${id}`);
export const createLead = (input: LeadInput & { ownerId?: number | null }) => api<{ lead: LeadSummary }>("/api/leads", { method: "POST", json: input });
export const updateLead = (id: number, changes: Partial<LeadInput>) => api<{ lead: LeadSummary }>(`/api/leads/${id}`, { method: "PATCH", json: changes });
export const transferLead = (id: number, ownerId: number, reason: string) => api<{ lead: LeadSummary }>(`/api/leads/${id}/transfer`, { method: "POST", json: { ownerId, reason } });
export const reviewLead = (id: number, approve: boolean, comment: string) => api<{ lead: LeadSummary }>(`/api/leads/${id}/review`, { method: "POST", json: { approve, comment } });
export const setLeadState = (id: number, state: "active" | "archived", reason: string) => api<{ lead: LeadSummary }>(`/api/leads/${id}/state`, { method: "POST", json: { state, reason } });
export const bulkLeads = (ids: number[], action: "archive" | "restore" | "reassign", options: { ownerId?: number; reason?: string } = {}) =>
  api<{ ok: true; count: number }>("/api/leads/bulk", { method: "POST", json: { ids, action, ...options } });
export const logActivity = (id: number, entry: { type: LoggableActivityType; summary: string; body: string; occurredAt: string | null }) =>
  api<{ activity: LeadActivity; lead: LeadSummary }>(`/api/leads/${id}/activities`, { method: "POST", json: entry });

export async function uploadAttachment(leadId: number, file: File, category: "document" | "profile", label: string): Promise<LeadAttachment> {
  const form = new FormData();
  form.set("file", file);
  form.set("category", category);
  form.set("label", label);
  const result = await api<{ attachment: LeadAttachment }>(`/api/leads/${leadId}/attachments`, { method: "POST", body: form });
  return result.attachment;
}

export const removeAttachment = (id: number) => api<{ ok: true }>(`/api/attachments/${id}`, { method: "DELETE" });
export const attachmentUrl = (id: number, download = false) => `/api/attachments/${id}${download ? "?download=1" : ""}`;
