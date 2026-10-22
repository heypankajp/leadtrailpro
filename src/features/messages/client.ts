import { api } from "@/lib/api";
import type { LeadMessage, MessageInput, MessageThread } from "./model";

export const fetchThreads = (leadId: number) => api<{ threads: MessageThread[] }>(`/api/leads/${leadId}/messages`);
export const postMessage = (leadId: number, input: MessageInput) => api<{ message: LeadMessage }>(`/api/leads/${leadId}/messages`, { method: "POST", json: input });
export const editMessage = (id: number, body: string) => api<{ message: LeadMessage }>(`/api/messages/${id}`, { method: "PATCH", json: { body } });
export const removeMessage = (id: number) => api<{ message: LeadMessage }>(`/api/messages/${id}`, { method: "DELETE" });
