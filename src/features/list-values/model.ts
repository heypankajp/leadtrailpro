export const listKeys = ["lead_type", "status", "bd_action", "stage", "client_response", "lead_category", "company_size", "city", "lost_reason", "disqualified_reason", "business_type", "opportunity_reason", "todo_list", "archival_reason", "recent_trips_limit", "trip_max_radius_km", "trip_max_results", "activity_outcome"] as const;
export type ListKey = (typeof listKeys)[number];

// Title Case, as the left list of the List of Values page shows them (review of November 18, 2026).
export const listKeyLabels: Record<ListKey, string> = {
  lead_type: "Deal Source",
  status: "Status",
  bd_action: "BD Action",
  stage: "Pipeline Stage",
  client_response: "Client Response",
  lead_category: "Deal Category",
  company_size: "Company Size",
  city: "City",
  lost_reason: "Lost Deal Reason",
  disqualified_reason: "Lead Disqualified Reason",
  business_type: "Business Type (Sales Trips)",
  opportunity_reason: "Not Relevant Reason (Leads)",
  todo_list: "To Do List",
  archival_reason: "Archival Reason",
  recent_trips_limit: "Recent Planned Trips (How Many)",
  trip_max_radius_km: "Max Radius (km)",
  trip_max_results: "Number of Results (max)",
  activity_outcome: "Activity Outcome",
};

/**
 * Lists whose values can be renamed but not added to or deactivated: the Recent Planned Trips number (one value). The
 * Disqualified reasons were fixed by LEAD-06 until the review of November 18, 2026, which opened them to new values.
 */
export const fixedListKeys: readonly ListKey[] = ["recent_trips_limit", "trip_max_radius_km", "trip_max_results"];

/**
 * Lists that hold one whole number, with the range it must stay in and the number used when the value is not usable.
 * Max Radius (km) stops at 200; Google biases a search to 50 km around the address at most. Number of Results stops at 60:
 * Google returns three pages of 20 companies at most.
 */
export const numericListBounds: Partial<Record<ListKey, { min: number; max: number; fallback: number }>> = {
  recent_trips_limit: { min: 1, max: 500, fallback: 30 },
  trip_max_radius_km: { min: 1, max: 200, fallback: 50 },
  trip_max_results: { min: 1, max: 60, fallback: 50 },
};

/** The number a single-number list holds, inside its range, or its fallback. */
export function listNumber(key: ListKey, values: readonly { value: string; active: boolean }[] | undefined): number {
  const bounds = numericListBounds[key];
  if (!bounds) return 0;
  const number = Number(String(values?.find((item) => item.active)?.value ?? "").trim());
  return Number.isInteger(number) && number >= bounds.min && number <= bounds.max ? number : bounds.fallback;
}

/**
 * The Sales Trip Planner's settings, shown together on one List of Values page (request of November 18, 2026) instead of
 * one entry each in the list of lists.
 */
export const tripPlannerListKeys: readonly ListKey[] = ["trip_max_radius_km", "trip_max_results", "recent_trips_limit", "business_type"];

export type ListValue = {
  id: number;
  listKey: ListKey;
  code: string;
  value: string;
  sortOrder: number;
  active: boolean;
  /** `bd_action` values only (PIPE-03): the pipeline stage the action lands a lead in; null = not mapped (counts as Contact Made). */
  stageId: number | null;
  /** `stage` values only (PD-09): the pipeline the stage belongs to. */
  pipelineId?: number | null;
};

/** The pipeline's entry stage (PIPE-01): new leads start here, and it cannot be deactivated. */
export const entryStageCode = "new_deal";

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
