// Ready-made filters and data cleanup (PD-30, SPEC §10.20), after Pipedrive's Filter menu. Pure: the labels and keys are
// shared by the board, the list and the unit tests; the SQL lives in quick-filter-sql.ts on the server.

export const quickFilterKeys = [
  "open", "lost", "won", "quarter_0", "quarter_1", "quarter_2", "quarter_3", "older",
  "first_stage_stale", "no_stage", "inactive_owner", "close_date_passed", "no_next_step", "no_stage_change_3m", "no_update_12m",
] as const;
export type QuickFilterKey = (typeof quickFilterKeys)[number];

export type QuickFilter = { key: QuickFilterKey; label: string; group: "ready" | "period" | "cleanup"; hint: string };

// Review of November 18, 2026: "Deals older than 3 months" gave way to the deals by quarter. The quarter entries are
// relative (quarter_0 is the current quarter, quarter_1 the one before, …), so their labels are worked out from today.
export const quickFilters: QuickFilter[] = [
  { key: "open", group: "ready", label: "Open deals", hint: "Every deal still being worked: not a client, not lost, not disqualified." },
  { key: "lost", group: "ready", label: "Lost deals", hint: "Deals marked Lost, with their reason." },
  { key: "won", group: "ready", label: "Won deals (clients)", hint: "Deals that became clients." },
  { key: "quarter_0", group: "period", label: "Current quarter", hint: "First contact in the current quarter." },
  { key: "quarter_1", group: "period", label: "Previous quarter", hint: "First contact in the quarter before the current one." },
  { key: "quarter_2", group: "period", label: "Two quarters ago", hint: "First contact two quarters ago." },
  { key: "quarter_3", group: "period", label: "Three quarters ago", hint: "First contact three quarters ago." },
  { key: "older", group: "period", label: "Quiet Deals", hint: "First contact before the oldest quarter listed." },
  { key: "first_stage_stale", group: "cleanup", label: "In the first stage with no update for 12 months", hint: "Still in New Deal and untouched for a year." },
  { key: "no_stage", group: "cleanup", label: "Deals with no stage", hint: "Never placed in a pipeline stage (the board shows them in New Deal)." },
  { key: "inactive_owner", group: "cleanup", label: "Open deals owned by deactivated users", hint: "Their owner can no longer sign in; reassign them." },
  { key: "close_date_passed", group: "cleanup", label: "Open deals with the expected close date passed", hint: "The expected close date is before today." },
  { key: "no_next_step", group: "cleanup", label: "Open deals with no next step", hint: "No open task and no follow-up date from today on." },
  { key: "no_stage_change_3m", group: "cleanup", label: "Open deals with no stage change in 3 months", hint: "Older than three months and not moved in that time." },
  { key: "no_update_12m", group: "cleanup", label: "Open deals with no update in 12 months", hint: "Nothing on the timeline for a year." },
];

export const isQuickFilterKey = (value: unknown): value is QuickFilterKey => typeof value === "string" && quickFilterKeys.includes(value as QuickFilterKey);

/** The statuses a filter is about: lost and won look at closed deals, every other filter at open ones. */
export function quickFilterStatusCodes(key: QuickFilterKey): { only: string[] | null; exclude: string[] } {
  if (key === "lost") return { only: ["lost"], exclude: [] };
  if (key === "won") return { only: ["client"], exclude: [] };
  return { only: null, exclude: ["client", "lost", "disqualified"] };
}

// ---- Quarters: Q1 is January to March, Q2 April to June, Q3 July to September, Q4 October to December ----

export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4 };
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The quarter a date (YYYY-MM-DD) falls in. */
export function quarterOf(ymd: string): Quarter {
  const [year, month] = ymd.split("-").map(Number);
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as Quarter["quarter"] };
}

/** The quarter `back` quarters before the one `today` falls in (0 = the current quarter). */
export function quarterBefore(today: string, back: number): Quarter {
  const current = quarterOf(today);
  const index = current.year * 4 + (current.quarter - 1) - back;
  return { year: Math.floor(index / 4), quarter: ((index % 4) + 1) as Quarter["quarter"] };
}

/** First day of the quarter and first day of the next one (YYYY-MM-DD): `from <= date < until`. */
export function quarterRange({ year, quarter }: Quarter): { from: string; until: string } {
  const pad = (month: number) => String(month).padStart(2, "0");
  const startMonth = (quarter - 1) * 3 + 1;
  const until = quarter === 4 ? `${year + 1}-01-01` : `${year}-${pad(startMonth + 3)}-01`;
  return { from: `${year}-${pad(startMonth)}-01`, until };
}

/** "Q4 : OCT-DEC 2026" in the review's words, written "Q4: Oct–Dec 2026". */
export function quarterName({ year, quarter }: Quarter): string {
  const start = (quarter - 1) * 3;
  return `Q${quarter}: ${monthNames[start]}–${monthNames[start + 2]} ${year}`;
}

/** How many quarters back a quarter filter looks, or null for the other filters. */
export function quarterOffset(key: QuickFilterKey): number | null {
  const match = /^quarter_(\d)$/.exec(key);
  return match ? Number(match[1]) : null;
}
/** The quarter entries listed in the menu: the current one and the three before it. */
export const listedQuarters = 4;

/** The label of a filter on `today`: the quarter entries name their quarter. */
export function quickFilterText(key: QuickFilterKey, today: string): string {
  const offset = quarterOffset(key);
  if (offset !== null) {
    const name = quarterName(quarterBefore(today, offset));
    return offset === 0 ? `Current (${name})` : name;
  }
  // The deals from before the quarters listed: "Quiet Deals (2025 & Older)" while the list starts at a Q1.
  if (key === "older") {
    const oldest = quarterBefore(today, listedQuarters - 1);
    return oldest.quarter === 1 ? `Quiet Deals (${oldest.year - 1} & Older)` : `Quiet Deals (before Q${oldest.quarter} ${oldest.year})`;
  }
  return quickFilters.find((filter) => filter.key === key)?.label ?? key;
}

export const quickFilterLabel = (key: QuickFilterKey | null, today: string): string | null => (key ? quickFilterText(key, today) : null);

/** A date `months` calendar months before `today` (YYYY-MM-DD), clamped to the month's last day. */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
