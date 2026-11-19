// The Activity List's periods and the Activity Calendar's weeks (request of November 18, 2026).
// Days are the person's local days; a week runs Sunday to Saturday. Pure, so the unit tests load it directly.

export const activityPeriods = ["todo", "overdue", "today", "tomorrow", "this_week", "next_week", "custom"] as const;
export type ActivityPeriod = (typeof activityPeriods)[number];
export const activityPeriodLabels: Record<ActivityPeriod, string> = {
  todo: "To-do", overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", this_week: "This week", next_week: "Next week", custom: "Select period",
};

const pad = (value: number) => String(value).padStart(2, "0");
/** The local day (YYYY-MM-DD) of a Date. */
export const ymdOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** A local day as a Date at midnight. */
export const dateOf = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (ymd: string, days: number) => { const date = dateOf(ymd); date.setDate(date.getDate() + days); return ymdOf(date); };
/** The Sunday that starts the week of `ymd`. */
export const weekStart = (ymd: string) => addDays(ymd, -dateOf(ymd).getDay());

/** The first and last day of a period, or null for To-do and Overdue, which are not a span of days. */
export function periodRange(period: ActivityPeriod, today: string, custom: { from: string; to: string } | null = null): { from: string; to: string } | null {
  switch (period) {
    case "today": return { from: today, to: today };
    case "tomorrow": return { from: addDays(today, 1), to: addDays(today, 1) };
    case "this_week": return { from: weekStart(today), to: addDays(weekStart(today), 6) };
    case "next_week": return { from: addDays(weekStart(today), 7), to: addDays(weekStart(today), 13) };
    case "custom": return custom && custom.from ? { from: custom.from, to: custom.to || custom.from } : null;
    default: return null;
  }
}

/**
 * Whether an activity belongs in a period. To-do: every open activity. Overdue: open ones due before now. The others:
 * activities (open or done) due on a day of the period.
 */
export function inPeriod(
  activity: { status: "open" | "done"; dueAt: string | null },
  period: ActivityPeriod, today: string, now: Date, custom: { from: string; to: string } | null = null,
): boolean {
  if (period === "todo") return activity.status === "open";
  if (period === "overdue") return activity.status === "open" && Boolean(activity.dueAt) && new Date(activity.dueAt!).getTime() < now.getTime();
  const range = periodRange(period, today, custom);
  if (!range) return true;
  if (!activity.dueAt) return false;
  const day = ymdOf(new Date(activity.dueAt));
  return day >= range.from && day <= range.to;
}

/** "Nov 15 – 21, 2026", "Nov 29 – Dec 5, 2026", "Dec 27, 2026 – Jan 2, 2027": the week a calendar shows. */
export function weekLabel(start: string): string {
  const first = dateOf(start);
  const last = dateOf(addDays(start, 6));
  const month = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });
  if (first.getFullYear() !== last.getFullYear()) return `${month(first)} ${first.getDate()}, ${first.getFullYear()} – ${month(last)} ${last.getDate()}, ${last.getFullYear()}`;
  if (first.getMonth() !== last.getMonth()) return `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}, ${last.getFullYear()}`;
  return `${month(first)} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`;
}

/**
 * Places a day's timed activities side by side where they overlap: each gets a lane and the number of lanes of its
 * group of overlapping activities. `start`/`end` are minutes from midnight.
 */
export function layoutDay<T extends { start: number; end: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const close = () => { const lanes = Math.max(1, ...group.map((item) => item.lane + 1)); for (const item of group) item.lanes = lanes; group = []; };
  for (const item of sorted) {
    if (group.length && item.start >= groupEnd) close();
    const taken = new Set(group.filter((other) => other.end > item.start).map((other) => other.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    const entry = { ...item, lane, lanes: 1 };
    group.push(entry);
    placed.push(entry);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) close();
  return placed;
}
