export const listKeys = ["lead_type", "status", "bd_action", "client_response", "lead_category", "company_size", "city"] as const;
export type ListKey = (typeof listKeys)[number];

export const listKeyLabels: Record<ListKey, string> = {
  lead_type: "Lead type",
  status: "Status",
  bd_action: "BD action",
  client_response: "Client response",
  lead_category: "Lead category",
  company_size: "Company size",
  city: "City",
};

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

/** Status codes the application relies on for navigation and conversion reporting. */
export const statusCodes = ["cold", "warm", "hot", "client"] as const;
export type StatusCode = (typeof statusCodes)[number];
