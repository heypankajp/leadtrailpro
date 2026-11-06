/**
 * Google Maps Platform usage meter for the Sales Trip Planner (SPEC §10.8). Every Google call the planner makes is
 * counted per SKU and calendar month, refused once the month's budget is spent, and reported to administrators at a
 * warning level and at 100%. Google's free allowance is per SKU and per month (since March 1, 2025: Essentials 10,000,
 * Pro 5,000, Enterprise 1,000 billable events; it is not pooled and starts over each month), so the budgets default
 * to a margin under those caps. This module is pure (no imports) so the provider and its tests can load it directly.
 */

export const mapsSkuIds = ["geocoding", "places_text_search", "route_matrix"] as const;
export type MapsSkuId = (typeof mapsSkuIds)[number];

export const mapsSkuLabels: Record<MapsSkuId, string> = {
  geocoding: "Geocoding",
  places_text_search: "Places text search",
  route_matrix: "Route matrix",
};

/** What one billable unit is and what spends it (shown in Settings). */
export const mapsSkuHints: Record<MapsSkuId, string> = {
  geocoding: "One call per new trip address (Essentials, 10,000 free a month); re-runs reuse the stored coordinates.",
  places_text_search: "One call per page of up to 20 companies (Enterprise, 1,000 free a month): the planner's scarcest allowance.",
  route_matrix: "One element per company when the radius is in driving minutes (Essentials, 10,000 free a month); a km radius spends none.",
};

export const mapsSkuUnits: Record<MapsSkuId, string> = { geocoding: "calls", places_text_search: "calls", route_matrix: "elements" };

/** Google's free monthly allowance per SKU, as published in November 2026. */
export const mapsFreeCaps: Record<MapsSkuId, number> = { geocoding: 10_000, places_text_search: 1_000, route_matrix: 10_000 };

export type MapsSettings = { budgets: Record<MapsSkuId, number>; warnAtPercent: number };

/**
 * Defaults sit at 90% of the free allowance: Google counts its month in Pacific time and bills some calls the app
 * records as failures, so the app's count can trail Google's by a little.
 */
export const defaultMapsSettings: MapsSettings = { budgets: { geocoding: 9_000, places_text_search: 900, route_matrix: 9_000 }, warnAtPercent: 80 };
export const maxMapsBudget = 1_000_000;

export function normalizeMapsSettings(value: unknown): { maps: MapsSettings; error: string | null } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const budgetsRecord = record.budgets && typeof record.budgets === "object" ? (record.budgets as Record<string, unknown>) : {};
  const budgets = {} as Record<MapsSkuId, number>;
  for (const id of mapsSkuIds) {
    const raw = budgetsRecord[id];
    const budget = raw === undefined ? defaultMapsSettings.budgets[id] : Number(raw);
    if (!Number.isInteger(budget) || budget < 0 || budget > maxMapsBudget) return { maps: defaultMapsSettings, error: `The monthly budget for ${mapsSkuLabels[id]} must be a whole number between 0 and ${maxMapsBudget}.` };
    budgets[id] = budget;
  }
  const warnAtPercent = record.warnAtPercent === undefined ? defaultMapsSettings.warnAtPercent : Number(record.warnAtPercent);
  if (!Number.isInteger(warnAtPercent) || warnAtPercent < 1 || warnAtPercent > 100) return { maps: defaultMapsSettings, error: "The Google Maps warning level must be a whole percentage between 1 and 100." };
  return { maps: { budgets, warnAtPercent }, error: null };
}

export type MapsSkuUsage = { month: number; today: number; failuresToday: number };
export const emptyMapsUsage = (): MapsSkuUsage => ({ month: 0, today: 0, failuresToday: 0 });

export type MapsSkuStatus = {
  id: MapsSkuId; label: string; hint: string; unit: string; freeCap: number; budget: number; usage: MapsSkuUsage;
  /** Whole percent of the budget used this month (0 when the budget is 0). */
  percent: number;
  remaining: number;
  /** Why the SKU is unusable or close to it, or null. */
  note: string | null;
};

export type MapsOverview = {
  configured: boolean;
  /** Which environment variable holds the key, or null. */
  keyVariable: string | null;
  /** Whether live Google calls are made at all (false under TRIPS_PROVIDER=stub). */
  live: boolean;
  monthKey: string;
  resetsOn: string;
  warnAtPercent: number;
  skus: MapsSkuStatus[];
};

/** The meter the Google adapter asks before and after each call; the repository wires it to the database. */
export type MapsMeter = {
  /** The month's remaining units and budget for a SKU. */
  remaining(sku: MapsSkuId): Promise<{ remaining: number; budget: number }>;
  /** Counts one call of `units` billable units after it ran; failures count too, conservatively. */
  record(sku: MapsSkuId, units: number, failed: boolean): Promise<void>;
};

/** `YYYY-MM` of an instant (UTC), the period the counters and alerts are keyed by. */
export const monthKeyOf = (now = new Date()): string => now.toISOString().slice(0, 7);

/** The first day of the next month (UTC), when the counters and Google's free allowance start over. */
export function nextResetYmd(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export const usagePercent = (used: number, budget: number): number => (budget > 0 ? Math.round((used / budget) * 100) : 0);

/** The number of units at which a percentage of the budget is reached (never below 1 so a 0 budget stays "spent"). */
export const thresholdUnits = (budget: number, percent: number): number => Math.max(1, Math.ceil((budget * percent) / 100));

/** The alert levels (percentages, ascending) the month's usage has reached; 100 is always one of the levels. */
export function reachedThresholds(used: number, budget: number, warnAtPercent: number): number[] {
  if (budget <= 0) return [];
  const levels = [...new Set([warnAtPercent, 100].filter((percent) => Number.isInteger(percent) && percent > 0 && percent <= 100))].sort((a, b) => a - b);
  return levels.filter((percent) => used >= thresholdUnits(budget, percent));
}

export function mapsSkuNote(budget: number, usage: MapsSkuUsage, warnAtPercent: number): string | null {
  if (budget <= 0) return "Switched off (monthly budget 0).";
  if (usage.month >= budget) return `Monthly budget spent (${usage.month} of ${budget}).`;
  if (usage.month >= thresholdUnits(budget, warnAtPercent)) return `${usagePercent(usage.month, budget)}% of the monthly budget used.`;
  return null;
}

export function mapsBudgetMessage(sku: MapsSkuId, needed: number, remaining: number, budget: number): string {
  const label = mapsSkuLabels[sku];
  const unit = mapsSkuUnits[sku];
  const state = budget <= 0
    ? `Google Maps ${label} is switched off (monthly budget 0).`
    : `The Google Maps monthly budget for ${label} is ${remaining <= 0 ? "spent" : "nearly spent"}: this search needs ${needed} ${unit} and ${remaining} of ${budget} remain.`;
  const tip = sku === "route_matrix"
    ? " Search with a radius in km instead (no Routes call), wait for the reset on the 1st, or ask an administrator to raise the budget under Settings → Google Maps usage."
    : " Searches resume on the 1st of next month, or sooner if an administrator raises the budget under Settings → Google Maps usage.";
  return state + tip;
}

/** Thrown by the Google adapter instead of making a call the month's budget cannot cover. */
export class MapsBudgetError extends Error {
  sku: MapsSkuId;
  needed: number;
  remaining: number;
  budget: number;
  constructor(sku: MapsSkuId, needed: number, remaining: number, budget: number) {
    super(mapsBudgetMessage(sku, needed, remaining, budget));
    this.name = "MapsBudgetError";
    this.sku = sku;
    this.needed = needed;
    this.remaining = remaining;
    this.budget = budget;
  }
}

/** The administrator alert for a level reached this month. */
export function mapsAlert(sku: MapsSkuId, percent: number, used: number, budget: number, resetYmd: string): { title: string; body: string } {
  const label = mapsSkuLabels[sku];
  const unit = mapsSkuUnits[sku];
  if (percent >= 100) {
    return {
      title: `Google Maps: the monthly budget for ${label} is spent (${used} of ${budget} ${unit})`,
      body: `The Sales Trip Planner will not make ${label} calls until the counters reset on ${resetYmd}${sku === "route_matrix" ? " (searches with a km radius still work)" : ""}. Raise the budget under Settings → Google Maps usage to continue this month; Google's free allowance for this SKU is ${mapsFreeCaps[sku].toLocaleString("en-US")} ${unit} a month and usage beyond it is billed.`,
    };
  }
  return {
    title: `Google Maps: ${percent}% of the monthly budget for ${label} used (${used} of ${budget} ${unit})`,
    body: `${budget - used} ${unit} remain until the counters reset on ${resetYmd}. Google's free allowance for this SKU is ${mapsFreeCaps[sku].toLocaleString("en-US")} ${unit} a month; the budget under Settings → Google Maps usage keeps the planner inside it.`,
  };
}
