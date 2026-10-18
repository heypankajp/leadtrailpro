import { api, toQuery } from "@/lib/api";
import type { AuditEntry } from "@/features/audit/model";
import type { ListKey, ListValue, ListValuesByKey } from "@/features/list-values/model";
import type { AppSettings } from "@/features/settings/model";
import type { TargetTemplate, TargetTemplateInput } from "@/features/targets/model";
import type { SystemRole } from "@/features/users/model";

export const fetchListValues = (includeInactive: boolean) => api<{ listValues: ListValuesByKey }>(`/api/list-values${toQuery({ includeInactive })}`);
export const createListValue = (listKey: ListKey, value: string) => api<{ value: ListValue }>("/api/list-values", { method: "POST", json: { listKey, value } });
export const updateListValue = (id: number, changes: { value?: string; active?: boolean; sortOrder?: number }) => api<{ value: ListValue }>(`/api/list-values/${id}`, { method: "PATCH", json: changes });
export const reorderListValues = (listKey: ListKey, orderedIds: number[]) => api<{ ok: true }>("/api/list-values/reorder", { method: "POST", json: { listKey, orderedIds } });

export const fetchTargetTemplates = () => api<{ templates: TargetTemplate[] }>("/api/target-templates");
export const createTargetTemplate = (input: TargetTemplateInput) => api<{ template: TargetTemplate }>("/api/target-templates", { method: "POST", json: input });
export const updateTargetTemplate = (id: number, input: Partial<TargetTemplateInput>) => api<{ template: TargetTemplate }>(`/api/target-templates/${id}`, { method: "PATCH", json: input });
export const assignTargetTemplate = (id: number, userIds: number[]) => api<{ ok: true }>(`/api/target-templates/${id}/assign`, { method: "POST", json: { userIds } });

export const fetchSettings = () => api<{ settings: AppSettings; mailerConfigured: boolean; timeZone: string }>("/api/settings");
export const updateSettings = (changes: { roleLabels?: Partial<Record<SystemRole, string>>; reminders?: { inactivityDays: number } }) =>
  api<{ settings: AppSettings }>("/api/settings", { method: "PATCH", json: changes });

export const fetchAudit = (query: { entityType?: string; entityId?: number; actorId?: number; limit?: number } = {}) => api<{ entries: AuditEntry[] }>(`/api/audit${toQuery(query)}`);
