/**
 * Natural-language dates for tasks and notes (TASK-03, NOTE-05).
 *
 * Pure and dependency-free so the same code gives the live preview in the browser and runs under node:test.
 * Calendar dates are `YYYY-MM-DD`. Relative phrases count from `anchor`: the business-day "today" for a task
 * form, or the date of the interaction for a note ("six months" means six months after that conversation).
 *
 * Understood: today, tomorrow, day after tomorrow, next week/month/quarter/year, end of week/month/year,
 * weekday names ("Monday", "next Fri"), periods ("in two weeks", "six months", "3 business days"), month names
 * alone ("January" → first working day), and explicit dates ("Feb 1", "1st of February 2026", "Feb/01/2026",
 * "02/01/2026", "2026-02-01"). A time of day ("at 10am", "3:30 pm", "noon", "morning") is read separately.
 */

export type NaturalDateKind = "explicit" | "relative" | "weekday" | "month" | "period";

export type NaturalDateResult = {
  /** Resolved calendar date. */
  date: string;
  /** Time of day (`HH:MM`) when the text names one, otherwise null. */
  time: string | null;
  /** The phrase that was understood. */
  matched: string;
  /** True when the date moved forward to the next working day. */
  adjusted: boolean;
  kind: NaturalDateKind;
};

export type NaturalDateOptions = {
  /** Calendar date relative phrases count from (`YYYY-MM-DD`). */
  anchor: string;
  /** Public holidays (`YYYY-MM-DD`) that are not working days. */
  holidays?: readonly string[];
};

// ---- Calendar arithmetic (UTC-based on calendar dates, so no timezone shifts) ----

const pad = (value: number) => String(value).padStart(2, "0");
const toYmd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const fromUtcDate = (date: Date) => toYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
const partsOf = (ymd: string): [number, number, number] => ymd.split("-").map(Number) as [number, number, number];
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function isCalendarDate(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [year, month, day] = partsOf(ymd);
  return year >= 1970 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function addDays(ymd: string, days: number): string {
  const [year, month, day] = partsOf(ymd);
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Adds months, clamping the day to the target month ("Jan 31 + 1 month" is Feb 28/29). */
export function addMonths(ymd: string, months: number): string {
  const [year, month, day] = partsOf(ymd);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  return toYmd(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(day, daysInMonth(first.getUTCFullYear(), first.getUTCMonth() + 1)));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  const [year, month, day] = partsOf(ymd);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Working day: Monday to Friday and not a listed holiday. */
export function isWorkingDay(ymd: string, holidays: readonly string[] = []): boolean {
  const weekday = weekdayOf(ymd);
  return weekday !== 0 && weekday !== 6 && !holidays.includes(ymd);
}

/** The date itself when it is a working day, otherwise the next working day. */
export function nextWorkingDay(ymd: string, holidays: readonly string[] = []): string {
  let cursor = ymd;
  while (!isWorkingDay(cursor, holidays)) cursor = addDays(cursor, 1);
  return cursor;
}

/** The date itself when it is a working day, otherwise the previous working day. */
export function previousWorkingDay(ymd: string, holidays: readonly string[] = []): string {
  let cursor = ymd;
  while (!isWorkingDay(cursor, holidays)) cursor = addDays(cursor, -1);
  return cursor;
}

export function addWorkingDays(ymd: string, days: number, holidays: readonly string[] = []): string {
  let cursor = ymd;
  for (let remaining = days; remaining > 0; remaining -= 1) cursor = nextWorkingDay(addDays(cursor, 1), holidays);
  return cursor;
}

export function firstWorkingDayOfMonth(year: number, month: number, holidays: readonly string[] = []): string {
  return nextWorkingDay(toYmd(year, month, 1), holidays);
}

export function lastWorkingDayOfMonth(year: number, month: number, holidays: readonly string[] = []): string {
  return previousWorkingDay(toYmd(year, month, daysInMonth(year, month)), holidays);
}

// ---- Vocabulary ----

const monthNumbers: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const monthAlternation = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";

const weekdayNumbers: Record<string, number> = {
  sunday: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6,
};
// "sat" and "sun" are left out on purpose: as bare words they are far more often verbs or weather.
const weekdayAlternation = "sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tues|tue|wed|thurs|thur|thu|fri";

const numberWords: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, "couple of": 2, "a couple of": 2, few: 3, "a few": 3,
};
const numberAlternation = "\\d{1,3}|a couple of|couple of|a few|few|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|an|a";

const isoDatePattern = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
const numericDatePattern = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g;
const monthDayPattern = new RegExp(`\\b(${monthAlternation})\\b[\\s./-]*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:[\\s,./-]*(\\d{4})\\b)?`, "gi");
const dayMonthPattern = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthAlternation})\\b(?:,?\\s*(\\d{4})\\b)?`, "gi");
const monthYearPattern = new RegExp(`\\b(${monthAlternation})\\b,?\\s+(\\d{4})\\b`, "gi");
const bareMonthPattern = new RegExp(`\\b(${monthAlternation})\\b`, "gi");
const relativePattern = /\b(day after tomorrow|tomorrow|today|tonight|next week|next month|next quarter|next year|end of (?:the |this )?(?:week|month|year))\b/gi;
const weekdayPattern = new RegExp(`\\b(?:(?:next|this|coming|on)\\s+)?(${weekdayAlternation})\\b`, "gi");
const periodPattern = new RegExp(`\\b(?:(in|after|within)\\s+)?(${numberAlternation})\\s+((?:business|working)\\s+)?(day|week|month|year)s?\\b(?!\\s+ago)`, "gi");

type Candidate = { index: number; length: number; matched: string; date: string; adjusted: boolean; kind: NaturalDateKind };

const explicitDate = (year: number, month: number, day: number): string | null => {
  const ymd = toYmd(year, month, day);
  return isCalendarDate(ymd) ? ymd : null;
};

/** A month/day without a year means the next time that date comes around (today counts). */
const upcoming = (anchor: string, month: number, day: number): string | null => {
  const [anchorYear] = partsOf(anchor);
  const thisYear = explicitDate(anchorYear, month, day);
  if (thisYear && thisYear >= anchor) return thisYear;
  return explicitDate(anchorYear + 1, month, day);
};

function collectCandidates(text: string, anchor: string, holidays: readonly string[]): Candidate[] {
  const candidates: Candidate[] = [];
  const [anchorYear, anchorMonth] = partsOf(anchor);
  const push = (match: RegExpMatchArray, date: string | null, kind: NaturalDateKind, adjusted = false) => {
    if (date && match.index !== undefined) candidates.push({ index: match.index, length: match[0].length, matched: match[0], date, adjusted, kind });
  };
  const firstWorkingDay = (year: number, month: number) => {
    const date = firstWorkingDayOfMonth(year, month, holidays);
    return { date, adjusted: date !== toYmd(year, month, 1) };
  };
  const rolled = (date: string) => {
    const next = nextWorkingDay(date, holidays);
    return { date: next, adjusted: next !== date };
  };

  for (const match of text.matchAll(isoDatePattern)) push(match, explicitDate(Number(match[1]), Number(match[2]), Number(match[3])), "explicit");
  for (const match of text.matchAll(numericDatePattern)) {
    // North American order (MM/DD/YYYY); a first number above 12 can only be a day.
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const dayFirst = first > 12 && second <= 12;
    push(match, explicitDate(year, dayFirst ? second : first, dayFirst ? first : second), "explicit");
  }
  for (const match of text.matchAll(monthDayPattern)) {
    const month = monthNumbers[match[1].toLowerCase()];
    push(match, match[3] ? explicitDate(Number(match[3]), month, Number(match[2])) : upcoming(anchor, month, Number(match[2])), "explicit");
  }
  for (const match of text.matchAll(dayMonthPattern)) {
    const month = monthNumbers[match[2].toLowerCase()];
    push(match, match[3] ? explicitDate(Number(match[3]), month, Number(match[1])) : upcoming(anchor, month, Number(match[1])), "explicit");
  }
  for (const match of text.matchAll(monthYearPattern)) {
    const { date, adjusted } = firstWorkingDay(Number(match[2]), monthNumbers[match[1].toLowerCase()]);
    push(match, date, "month", adjusted);
  }
  for (const match of text.matchAll(bareMonthPattern)) {
    const word = match[1];
    // "may" is usually the verb; only the capitalised month counts on its own.
    if (word.toLowerCase() === "may" && word !== "May") continue;
    const month = monthNumbers[word.toLowerCase()];
    let { date, adjusted } = firstWorkingDay(anchorYear, month);
    if (date < anchor) ({ date, adjusted } = firstWorkingDay(anchorYear + 1, month));
    push(match, date, "month", adjusted);
  }
  for (const match of text.matchAll(relativePattern)) {
    const phrase = match[1].toLowerCase().replace(/\s+/g, " ");
    const weekday = weekdayOf(anchor);
    if (phrase === "today" || phrase === "tonight") push(match, anchor, "relative");
    else if (phrase === "tomorrow") { const { date, adjusted } = rolled(addDays(anchor, 1)); push(match, date, "relative", adjusted); }
    else if (phrase === "day after tomorrow") { const { date, adjusted } = rolled(addDays(anchor, 2)); push(match, date, "relative", adjusted); }
    else if (phrase === "next week") { const { date, adjusted } = rolled(addDays(anchor, ((1 - weekday + 7) % 7) || 7)); push(match, date, "relative", adjusted); }
    else if (phrase === "next month") { const [year, month] = partsOf(addMonths(toYmd(anchorYear, anchorMonth, 1), 1)); const { date, adjusted } = firstWorkingDay(year, month); push(match, date, "relative", adjusted); }
    else if (phrase === "next quarter") { const [year, month] = partsOf(addMonths(toYmd(anchorYear, Math.floor((anchorMonth - 1) / 3) * 3 + 1, 1), 3)); const { date, adjusted } = firstWorkingDay(year, month); push(match, date, "relative", adjusted); }
    else if (phrase === "next year") { const { date, adjusted } = firstWorkingDay(anchorYear + 1, 1); push(match, date, "relative", adjusted); }
    else if (phrase.endsWith("week")) {
      const friday = addDays(anchor, (5 - weekday + 7) % 7);
      const date = previousWorkingDay(friday, holidays);
      const final = date < anchor ? nextWorkingDay(anchor, holidays) : date;
      push(match, final, "relative", final !== friday);
    } else if (phrase.endsWith("month")) {
      let date = lastWorkingDayOfMonth(anchorYear, anchorMonth, holidays);
      if (date < anchor) { const [year, month] = partsOf(addMonths(toYmd(anchorYear, anchorMonth, 1), 1)); date = lastWorkingDayOfMonth(year, month, holidays); }
      const [year, month] = partsOf(date);
      push(match, date, "relative", date !== toYmd(year, month, daysInMonth(year, month)));
    } else if (phrase.endsWith("year")) {
      let date = lastWorkingDayOfMonth(anchorYear, 12, holidays);
      if (date < anchor) date = lastWorkingDayOfMonth(anchorYear + 1, 12, holidays);
      push(match, date, "relative", !date.endsWith("-12-31"));
    }
  }
  for (const match of text.matchAll(weekdayPattern)) {
    const target = weekdayNumbers[match[1].toLowerCase()];
    const date = addDays(anchor, ((target - weekdayOf(anchor) + 7) % 7) || 7);
    // A weekday the user names is kept even on a weekend; a holiday moves it to the next working day.
    const { date: final, adjusted } = target === 0 || target === 6 ? { date, adjusted: false } : rolled(date);
    push(match, final, "weekday", adjusted);
  }
  for (const match of text.matchAll(periodPattern)) {
    const quantity = match[2].toLowerCase();
    const count = /^\d+$/.test(quantity) ? Number(quantity) : numberWords[quantity];
    // "a week" alone is too loose ("what a week"); it needs "in", "after", or "within".
    if ((quantity === "a" || quantity === "an") && !match[1]) continue;
    if (!count || count > 999) continue;
    const unit = match[4].toLowerCase();
    if (match[3]) { push(match, addWorkingDays(anchor, count, holidays), "period"); continue; }
    const raw = unit === "day" ? addDays(anchor, count) : unit === "week" ? addDays(anchor, count * 7) : unit === "month" ? addMonths(anchor, count) : addMonths(anchor, count * 12);
    const { date, adjusted } = rolled(raw);
    push(match, date, "period", adjusted);
  }
  return candidates;
}

/** Earliest phrase in the text wins; a phrase inside a longer one ("Feb" inside "Feb 1") is ignored. */
function chooseCandidate(candidates: Candidate[]): Candidate | null {
  const contained = (inner: Candidate, outer: Candidate) =>
    inner !== outer && inner.index >= outer.index && inner.index + inner.length <= outer.index + outer.length && inner.length < outer.length;
  const independent = candidates.filter((candidate) => !candidates.some((other) => contained(candidate, other)));
  independent.sort((a, b) => a.index - b.index || b.length - a.length);
  return independent[0] ?? null;
}

const clockPatterns: { pattern: RegExp; resolve: (match: RegExpMatchArray) => string | null }[] = [
  { pattern: /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b\.?/i, resolve: (match) => clock(Number(match[1]) % 12 + (match[3].toLowerCase() === "p" ? 12 : 0), Number(match[2] ?? 0)) },
  { pattern: /(?:\bat\s*|@\s*)(\d{1,2})(?::(\d{2}))?\b/i, resolve: (match) => { const hour = Number(match[1]); return clock(hour >= 1 && hour <= 6 ? hour + 12 : hour, Number(match[2] ?? 0)); } },
  { pattern: /\b([01]?\d|2[0-3]):([0-5]\d)\b/, resolve: (match) => clock(Number(match[1]), Number(match[2])) },
  { pattern: /\b(noon|midday)\b/i, resolve: () => "12:00" },
  { pattern: /\bmorning\b/i, resolve: () => "09:00" },
  { pattern: /\bafternoon\b/i, resolve: () => "14:00" },
  { pattern: /\bevening\b/i, resolve: () => "17:00" },
  { pattern: /\b(end of (?:the )?day|eod|close of business|cob)\b/i, resolve: () => "17:00" },
];

function clock(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** A time of day mentioned in the text, or null. */
export function parseTimeOfDay(text: string): string | null {
  for (const { pattern, resolve } of clockPatterns) {
    const match = text.match(pattern);
    if (match) {
      const time = resolve(match);
      if (time) return time;
    }
  }
  return null;
}

/** Finds the first date phrase in the text and resolves it against the anchor date. */
export function parseNaturalDate(text: string, options: NaturalDateOptions): NaturalDateResult | null {
  if (!text.trim() || !isCalendarDate(options.anchor)) return null;
  const holidays = options.holidays ?? [];
  const candidate = chooseCandidate(collectCandidates(text, options.anchor, holidays));
  if (!candidate) return null;
  const withoutDate = `${text.slice(0, candidate.index)} ${text.slice(candidate.index + candidate.length)}`;
  return { date: candidate.date, time: parseTimeOfDay(withoutDate), matched: candidate.matched.trim(), adjusted: candidate.adjusted, kind: candidate.kind };
}

// ---- Follow-up suggestions from notes (NOTE-05) ----

export type FollowUpSuggestion = NaturalDateResult & {
  /** The sentence the date was found in; becomes the task description. */
  sentence: string;
  /** Suggested task title. */
  title: string;
};

export type FollowUpOptions = NaturalDateOptions & {
  /** Suggestions in the past are dropped; defaults to the anchor. */
  today?: string;
  /** Contact name used in the title. */
  person?: string;
  /** Company name used in the title. */
  company?: string;
};

const strongIntent = /\b(follow[\s-]*ups?|follow[\s-]*through|call(?:\s+\w+){0,2}\s+(?:back|again)|check(?:\s+back)?\s+in|check\s+back|reach\s+out|touch\s+base|circle\s+back|get\s+back\s+to|remind(?:er|ers)?|re-?visit|next\s+steps?|set\s+up\s+(?:a\s+)?(?:call|meeting|visit|demo)|schedule|reschedule|deadline)\b/i;
const weakIntent = /\b(will|need(?:s)?\s+to|should|must|plan(?:s|ning)?\s+to|going\s+to|have\s+to|has\s+to|let'?s|by|before|until|till|due|meet(?:ing)?|visit|send|share|submit|deliver|present|demo)\b/i;
const pastCue = /\b(had|was|were|did|went|met|spoke|talked|called|sent|shared|visited|discussed|delivered|presented|ago|last|yesterday)\b/i;

function sentenceAround(text: string, index: number): string {
  const boundary = /[.!?\n]/;
  let start = index;
  while (start > 0 && !boundary.test(text[start - 1])) start -= 1;
  let end = index;
  while (end < text.length && !boundary.test(text[end])) end += 1;
  return text.slice(start, end).trim();
}

function suggestedTitle(sentence: string, person: string, company: string): string {
  const lower = sentence.toLowerCase();
  if (/\bcall(?:\s+\w+){0,2}\s+(?:back|again)\b/.test(lower)) return `Call ${person} back`;
  if (/\b(meet|meeting|demo|presentation)\b/.test(lower)) return `Meeting with ${person}`;
  if (/\bvisit\b/.test(lower)) return `Visit ${company}`;
  return `Follow up with ${person}`;
}

/**
 * Reads a note for a follow-up instruction with a date ("follow up next week", "send the proposal by Friday").
 * Returns null when there is no date, no sign of a next step, or the date is already past.
 */
export function suggestFollowUp(text: string, options: FollowUpOptions): FollowUpSuggestion | null {
  if (!text.trim() || !isCalendarDate(options.anchor)) return null;
  const candidate = chooseCandidate(collectCandidates(text, options.anchor, options.holidays ?? []));
  if (!candidate) return null;
  const today = options.today && isCalendarDate(options.today) ? options.today : options.anchor;
  if (candidate.date < today) return null;
  const sentence = sentenceAround(text, candidate.index);
  const intended = strongIntent.test(sentence) || (weakIntent.test(sentence) && !pastCue.test(sentence));
  if (!intended) return null;
  const withoutDate = `${text.slice(0, candidate.index)} ${text.slice(candidate.index + candidate.length)}`;
  const person = options.person?.trim() || options.company?.trim() || "the client";
  const company = options.company?.trim() || person;
  return {
    date: candidate.date, time: parseTimeOfDay(sentenceAround(withoutDate, candidate.index)), matched: candidate.matched.trim(), adjusted: candidate.adjusted, kind: candidate.kind,
    sentence: sentence.slice(0, 500), title: suggestedTitle(sentence, person, company).slice(0, 200),
  };
}
