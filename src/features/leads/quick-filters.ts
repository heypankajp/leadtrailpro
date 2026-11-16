// Ready-made filters and data cleanup (PD-30, SPEC §10.20), after Pipedrive's Filter menu. Pure: the labels and keys are
// shared by the board, the list and the unit tests; the SQL lives in quick-filter-sql.ts on the server.

export const quickFilterKeys = [
  "open", "lost", "won", "old_3m", "quiet",
  "first_stage_stale", "no_stage", "inactive_owner", "close_date_passed", "no_next_step", "no_stage_change_3m", "no_update_12m",
] as const;
export type QuickFilterKey = (typeof quickFilterKeys)[number];

export type QuickFilter = { key: QuickFilterKey; label: string; group: "ready" | "cleanup"; hint: string };

export const quickFilters: QuickFilter[] = [
  { key: "open", group: "ready", label: "Open deals", hint: "Every deal still being worked: not a client, not lost, not disqualified." },
  { key: "lost", group: "ready", label: "Lost deals", hint: "Deals marked Lost, with their reason." },
  { key: "won", group: "ready", label: "Won deals (clients)", hint: "Deals that became clients." },
  { key: "old_3m", group: "ready", label: "Deals older than 3 months", hint: "First contact more than three months ago." },
  { key: "quiet", group: "ready", label: "Quiet deals", hint: "No activity for longer than their needs-attention limit." },
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

export const quickFilterLabel = (key: QuickFilterKey | null): string | null => (key ? quickFilters.find((filter) => filter.key === key)?.label ?? null : null);

/** A date `months` calendar months before `today` (YYYY-MM-DD), clamped to the month's last day. */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
