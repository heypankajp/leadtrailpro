import { api } from "@/lib/api";
import type { DeletedItem, DeletedKind } from "./model";

export const deleteDeal = (id: number) => api<{ ok: true }>(`/api/leads/${id}/delete`, { method: "POST" });
export const deleteLead = (id: number) => api<{ ok: true }>(`/api/opportunities/${id}`, { method: "PATCH", json: { action: "delete" } });
export const fetchDeleted = (kind: DeletedKind) => api<{ items: DeletedItem[]; counts: Record<DeletedKind, number> }>(`/api/restore?kind=${kind}`);
export const restoreDeleted = (kind: DeletedKind, ids: number[]) => api<{ restored: number }>("/api/restore", { method: "POST", json: { kind, ids } });
export const dealExportUrl = (id: number) => `/api/leads/${id}/export`;
export const leadExportUrl = (id: number) => `/api/opportunities/${id}/export`;
