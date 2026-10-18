/**
 * Date helpers for the business timezone (default America/Toronto, per the BRD's Eastern-time rules).
 * All instants are UTC; calendar dates are expressed as `YYYY-MM-DD` in the business timezone.
 */

export function businessTimeZone(): string {
  return process.env.BUSINESS_TIMEZONE || "America/Toronto";
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone = businessTimeZone()): Parts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) values[part.type] = part.value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: weekdayIndex[values.weekday] ?? 0,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Today's calendar date in the business timezone. */
export function todayYmd(now = new Date(), timeZone = businessTimeZone()): string {
  const parts = zonedParts(now, timeZone);
  return formatYmd(parts.year, parts.month, parts.day);
}

export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Adds whole days to a `YYYY-MM-DD` string. */
export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The UTC instant at which a given local date and time begins in the business timezone. */
export function zonedDateTimeToUtc(ymd: string, hour = 0, minute = 0, second = 0, timeZone = businessTimeZone()): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two refinement passes handle DST transitions.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += Date.UTC(year, month - 1, day, hour, minute, second) - asUtc;
  }
  return new Date(guess);
}

export function startOfDayUtc(ymd: string, timeZone = businessTimeZone()): Date {
  return zonedDateTimeToUtc(ymd, 0, 0, 0, timeZone);
}

export function endOfDayUtc(ymd: string, timeZone = businessTimeZone()): Date {
  return zonedDateTimeToUtc(addDaysYmd(ymd, 1), 0, 0, 0, timeZone);
}

/** Monday of the ISO week containing the given date. */
export function startOfWeekYmd(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysYmd(ymd, offset);
}

export function startOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [year, month] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export function isWeekend(ymd: string): boolean {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Most recent business day strictly before the given date (skips Saturday and Sunday). */
export function previousBusinessDay(ymd: string): string {
  let candidate = addDaysYmd(ymd, -1);
  while (isWeekend(candidate)) candidate = addDaysYmd(candidate, -1);
  return candidate;
}

export function businessDaysBetween(startYmd: string, endExclusiveYmd: string): number {
  let count = 0;
  for (let cursor = startYmd; compareYmd(cursor, endExclusiveYmd) < 0; cursor = addDaysYmd(cursor, 1)) {
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

export function daysBetween(startYmd: string, endExclusiveYmd: string): number {
  const [y1, m1, d1] = startYmd.split("-").map(Number);
  const [y2, m2, d2] = endExclusiveYmd.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export const reportPeriods = ["today", "yesterday", "this_week", "last_week", "month_to_date", "last_month", "year_to_date"] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

export const reportPeriodLabels: Record<ReportPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  month_to_date: "Month to date",
  last_month: "Last month",
  year_to_date: "Year to date",
};

export type DateRange = { startYmd: string; endExclusiveYmd: string; start: Date; end: Date };

export function rangeFromYmd(startYmd: string, endExclusiveYmd: string, timeZone = businessTimeZone()): DateRange {
  return { startYmd, endExclusiveYmd, start: startOfDayUtc(startYmd, timeZone), end: startOfDayUtc(endExclusiveYmd, timeZone) };
}

/** Calendar range for a report period. "Yesterday" uses the previous business day, per the BRD. */
export function periodRange(period: ReportPeriod, now = new Date(), timeZone = businessTimeZone()): DateRange {
  const today = todayYmd(now, timeZone);
  const tomorrow = addDaysYmd(today, 1);
  switch (period) {
    case "today":
      return rangeFromYmd(today, tomorrow, timeZone);
    case "yesterday": {
      const day = previousBusinessDay(today);
      return rangeFromYmd(day, addDaysYmd(day, 1), timeZone);
    }
    case "this_week":
      return rangeFromYmd(startOfWeekYmd(today), tomorrow, timeZone);
    case "last_week": {
      const thisMonday = startOfWeekYmd(today);
      return rangeFromYmd(addDaysYmd(thisMonday, -7), thisMonday, timeZone);
    }
    case "month_to_date":
      return rangeFromYmd(startOfMonthYmd(today), tomorrow, timeZone);
    case "last_month": {
      const thisMonth = startOfMonthYmd(today);
      return rangeFromYmd(addMonthsYmd(thisMonth, -1), thisMonth, timeZone);
    }
    case "year_to_date":
      return rangeFromYmd(`${today.slice(0, 4)}-01-01`, tomorrow, timeZone);
  }
}

/** The most recent occurrence of the configured auto-logout time (default 23:00) in the business timezone. */
export function lastAutoLogoutCutoff(now = new Date(), timeZone = businessTimeZone()): Date {
  const today = todayYmd(now, timeZone);
  const todayCutoff = zonedDateTimeToUtc(today, 23, 0, 0, timeZone);
  return todayCutoff.getTime() <= now.getTime() ? todayCutoff : zonedDateTimeToUtc(addDaysYmd(today, -1), 23, 0, 0, timeZone);
}
