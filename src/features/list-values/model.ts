export const listKeys = ["lead_type", "status", "bd_action", "client_response", "lead_category", "company_size", "city", "lost_reason", "disqualified_reason", "business_type"] as const;
export type ListKey = (typeof listKeys)[number];

export const listKeyLabels: Record<ListKey, string> = {
  lead_type: "Lead type",
  status: "Status",
  bd_action: "BD action",
  client_response: "Client response",
  lead_category: "Lead category",
  company_size: "Company size",
  city: "City",
  lost_reason: "Lost lead reason",
  disqualified_reason: "Disqualified reason",
  business_type: "Business type (sales trips)",
};

/** Lists whose values are fixed by the requirement (LEAD-06): they can be renamed but not added to or deactivated. */
export const fixedListKeys: readonly ListKey[] = ["disqualified_reason"];

export type ListValue = {
  id: number;
  listKey: ListKey;
  code: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

export type ListValuesByKey = Record<ListKey, ListValue[]>;

export function isListKey(value: unknown): value is ListKey {
  return typeof value === "string" && listKeys.includes(value as ListKey);
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "value";
}

/** Status codes the application relies on: navigation and conversion reporting (cold…client) and the closed statuses (LEAD-06). */
export const statusCodes = ["cold", "warm", "hot", "client", "lost", "disqualified"] as const;
export type StatusCode = (typeof statusCodes)[number];

/** Closed statuses carry a Status Reason: Lost Lead (Admin-maintained reasons) and Disqualified (fixed reasons). */
export const closedStatusCodes = ["lost", "disqualified"] as const;

/** The reason list a status draws from, or null for statuses without a reason. */
export function reasonListFor(statusCode: string | null | undefined): ListKey | null {
  if (statusCode === "lost") return "lost_reason";
  if (statusCode === "disqualified") return "disqualified_reason";
  return null;
}

export function isClosedStatus(statusCode: string | null | undefined): boolean {
  return reasonListFor(statusCode) !== null;
}

/** The combined "Status – Reason" display used throughout the CRM and the Sales Trip Planner (LEAD-06). */
export function statusLabel(status: string, reason: string | null | undefined): string {
  return reason ? `${status} – ${reason}` : status;
}
