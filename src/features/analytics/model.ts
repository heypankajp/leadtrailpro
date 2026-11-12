/**
 * Analytics (RPT-*, decided November 6, 2026): pure rules for the Analytics screen. Buckets for the over-time charts,
 * the status timeline of each lead, movement between statuses, time in status, and the stalled-lead assessment. No
 * app imports so the unit tests load it directly.
 */

export type BucketKind = "day" | "week" | "month";

const dayMs = 86_400_000;
const toUtc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd: string, days: number) => fromUtc(toUtc(ymd) + days * dayMs);
export const daysBetween = (startYmd: string, endYmd: string) => Math.round((toUtc(endYmd) - toUtc(startYmd)) / dayMs);
/** Monday of the week of `ymd`. */
export const weekStart = (ymd: string) => { const day = new Date(toUtc(ymd)).getUTCDay(); return addDays(ymd, day === 0 ? -6 : 1 - day); };
export const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const nextMonth = (ymd: string) => { const [y, m] = ymd.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`; };

/** Days for a month or less, weeks up to half a year, months beyond. */
export function bucketKindFor(startYmd: string, endExclusiveYmd: string): BucketKind {
  const days = daysBetween(startYmd, endExclusiveYmd);
  return days <= 31 ? "day" : days <= 183 ? "week" : "month";
}

export const bucketStartOf = (ymd: string, kind: BucketKind) => (kind === "day" ? ymd : kind === "week" ? weekStart(ymd) : monthStart(ymd));
const bucketNext = (start: string, kind: BucketKind) => (kind === "day" ? addDays(start, 1) : kind === "week" ? addDays(start, 7) : nextMonth(start));

/** Bucket boundaries covering the range: each has its start (the label) and its exclusive end, clipped to the range. */
export function buckets(startYmd: string, endExclusiveYmd: string, kind: BucketKind): { start: string; endExclusive: string }[] {
  const result: { start: string; endExclusive: string }[] = [];
  let cursor = bucketStartOf(startYmd, kind);
  let guard = 0;
  while (cursor < endExclusiveYmd && guard < 1000) {
    const next = bucketNext(cursor, kind);
    result.push({ start: cursor < startYmd ? startYmd : cursor, endExclusive: next > endExclusiveYmd ? endExclusiveYmd : next });
    cursor = next;
    guard += 1;
  }
  return result;
}

export const statusRank: Record<string, number> = { cold: 1, warm: 2, hot: 3, client: 4 };
export const closedCodes: readonly string[] = ["lost", "disqualified"];

export type StatusEvent = { leadId: number; at: string; code: string };

/**
 * How many leads sat in each status at the end of every bucket: a lead counts once it exists (created before the
 * bucket end) with the status of its last change before that instant.
 */
export function statusSeries(
  leads: readonly { id: number; createdAt: string; initialCode: string }[],
  changes: readonly StatusEvent[],
  bucketEnds: readonly { label: string; endIso: string }[],
  codes: readonly string[],
): { label: string; counts: Record<string, number> }[] {
  const byLead = new Map<number, StatusEvent[]>();
  for (const change of [...changes].sort((a, b) => a.at.localeCompare(b.at))) {
    const list = byLead.get(change.leadId) ?? [];
    if (!byLead.has(change.leadId)) byLead.set(change.leadId, list);
    list.push(change);
  }
  return bucketEnds.map(({ label, endIso }) => {
    const counts: Record<string, number> = Object.fromEntries(codes.map((code) => [code, 0]));
    for (const lead of leads) {
      if (lead.createdAt >= endIso) continue;
      let code = lead.initialCode;
      for (const change of byLead.get(lead.id) ?? []) { if (change.at < endIso) code = change.code; else break; }
      if (code in counts) counts[code] += 1;
    }
    return { label, counts };
  });
}

export type Transition = { fromCode: string; toCode: string; reason: string | null };
export type MovementSummary = {
  entered: Record<string, number>;
  funnel: { coldToWarm: number; warmToHot: number; hotToClient: number; anyToClient: number };
  backwards: number;
  lostReasons: Record<string, number>;
  disqualifiedReasons: Record<string, number>;
};

/** Counts the status changes of a period: what each status received, the forward funnel, moves backwards, and why deals closed. */
export function summarizeTransitions(transitions: readonly Transition[]): MovementSummary {
  const summary: MovementSummary = { entered: {}, funnel: { coldToWarm: 0, warmToHot: 0, hotToClient: 0, anyToClient: 0 }, backwards: 0, lostReasons: {}, disqualifiedReasons: {} };
  for (const { fromCode, toCode, reason } of transitions) {
    summary.entered[toCode] = (summary.entered[toCode] ?? 0) + 1;
    if (fromCode === "cold" && toCode === "warm") summary.funnel.coldToWarm += 1;
    if (fromCode === "warm" && toCode === "hot") summary.funnel.warmToHot += 1;
    if (fromCode === "hot" && toCode === "client") summary.funnel.hotToClient += 1;
    if (toCode === "client") summary.funnel.anyToClient += 1;
    if (statusRank[fromCode] && statusRank[toCode] && statusRank[toCode] < statusRank[fromCode]) summary.backwards += 1;
    const label = reason?.trim() || "No reason given";
    if (toCode === "lost") summary.lostReasons[label] = (summary.lostReasons[label] ?? 0) + 1;
    if (toCode === "disqualified") summary.disqualifiedReasons[label] = (summary.disqualifiedReasons[label] ?? 0) + 1;
  }
  return summary;
}

/** PIPE-12: the stage moves of a period: what each stage received, and how many moves went forward or back in board order. */
export function summarizeStageMoves(moves: readonly { fromCode: string; toCode: string }[], order: readonly string[]): { entered: Record<string, number>; forward: number; backwards: number; total: number } {
  const rank = new Map(order.map((code, index) => [code, index]));
  const summary = { entered: {} as Record<string, number>, forward: 0, backwards: 0, total: 0 };
  for (const { fromCode, toCode } of moves) {
    summary.total += 1;
    summary.entered[toCode] = (summary.entered[toCode] ?? 0) + 1;
    const from = rank.get(fromCode);
    const to = rank.get(toCode);
    if (from === undefined || to === undefined || from === to) continue;
    if (to > from) summary.forward += 1; else summary.backwards += 1;
  }
  return summary;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return Math.round((sorted[low] + (sorted[high] - sorted[low]) * (index - low)) * 10) / 10;
}
export const median = (values: readonly number[]) => percentile(values, 0.5);

export type Spell = { code: string; days: number; endedAt: string };

/** The completed stays in each status of one lead, from its ordered status events (creation first). */
export function spellsOf(events: readonly { at: string; code: string }[]): Spell[] {
  const spells: Spell[] = [];
  for (let index = 0; index + 1 < events.length; index += 1) {
    const days = (new Date(events[index + 1].at).getTime() - new Date(events[index].at).getTime()) / dayMs;
    if (days >= 0) spells.push({ code: events[index].code, days: Math.round(days * 10) / 10, endedAt: events[index + 1].at });
  }
  return spells;
}

export type StalledInput = { statusCode: string; daysInStatus: number; daysSinceActivity: number; overdueDays: number | null };

/**
 * Why a lead needs attention, in words, and how far behind it is: longer in its status than allowed, quiet longer
 * than allowed, a follow-up overdue, or a hot lead with no touch for a week. Null when nothing is wrong.
 */
export function stalledAssessment(lead: StalledInput, allowedDays: number): { score: number; reasons: string[] } | null {
  const reasons: string[] = [];
  let score = 0;
  if (lead.daysInStatus > allowedDays) { reasons.push(`${Math.round(lead.daysInStatus)} days in ${lead.statusCode} (limit ${allowedDays})`); score = Math.max(score, lead.daysInStatus - allowedDays); }
  if (lead.daysSinceActivity > allowedDays) { reasons.push(`no activity for ${Math.round(lead.daysSinceActivity)} days`); score = Math.max(score, lead.daysSinceActivity - allowedDays); }
  if (lead.overdueDays !== null && lead.overdueDays > 0) { reasons.push(`follow-up overdue by ${lead.overdueDays} day${lead.overdueDays === 1 ? "" : "s"}`); score = Math.max(score, lead.overdueDays); }
  if (lead.statusCode === "hot" && lead.daysSinceActivity > 7 && lead.daysSinceActivity <= allowedDays) { reasons.push(`hot lead quiet for ${Math.round(lead.daysSinceActivity)} days`); score = Math.max(score, lead.daysSinceActivity); }
  return reasons.length ? { score: Math.round(score), reasons } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Request and response shapes

export type AnalyticsFilters = { ownerId: number | null; statusId: number | null; leadTypeId: number | null; cityId: number | null; industry: string; client: string; source: "" | "pool" | "other"; jobType: string };
export const emptyAnalyticsFilters: AnalyticsFilters = { ownerId: null, statusId: null, leadTypeId: null, cityId: null, industry: "", client: "", source: "", jobType: "" };

export function parseAnalyticsFilters(get: (key: string) => string | null): AnalyticsFilters {
  const id = (key: string) => { const value = Number(get(key)); return Number.isSafeInteger(value) && value > 0 ? value : null; };
  const text = (key: string) => (get(key) ?? "").trim().slice(0, 120);
  const source = get("source");
  return { ownerId: id("ownerId"), statusId: id("statusId"), leadTypeId: id("leadTypeId"), cityId: id("cityId"), industry: text("industry"), client: text("client"), source: source === "pool" || source === "other" ? source : "", jobType: text("jobType") };
}

export type AnalyticsReport = {
  range: { startYmd: string; endExclusiveYmd: string };
  bucketKind: BucketKind;
  teamWide: boolean;
  statuses: { code: string; label: string }[];
  pipeline: { total: number; byStatus: { code: string; label: string; count: number }[]; byOwner: { ownerId: number; name: string; counts: Record<string, number>; total: number }[] };
  statusOverTime: { label: string; counts: Record<string, number> }[];
  movement: MovementSummary & { byOwner: { ownerId: number; name: string; toWarm: number; toHot: number; toClient: number; lost: number; disqualified: number }[] };
  timeInStatus: { code: string; label: string; medianDays: number | null; p75Days: number | null; samples: number }[];
  stalled: { total: number; leads: StalledLead[] };
  /** PIPE-12: the pipeline by stage (leads on the board: active, not Client or closed), stage over time from the stage_change entries, completed stays per stage, and the moves of the period. */
  stages: { id: number; code: string; label: string }[];
  pipelineByStage: { total: number; byStage: { id: number; code: string; label: string; count: number }[]; byOwner: { ownerId: number; name: string; counts: Record<string, number>; total: number }[] };
  stageOverTime: { label: string; counts: Record<string, number> }[];
  timeInStage: { code: string; label: string; medianDays: number | null; p75Days: number | null; samples: number }[];
  stageMovement: { entered: Record<string, number>; forward: number; backwards: number; total: number };
  pool: { totals: { found: number; newCompanies: number; assigned: number; notRelevant: number; attached: number; medianHoursToAssign: number | null }; runs: { date: string; listingsFound: number; newCompanies: number; attached: number }[]; byJobType: { type: string; companies: number; assigned: number }[] };
  breakdown: { industries: BreakdownRow[]; cities: BreakdownRow[]; leadTypes: BreakdownRow[]; topClients: { leadId: number; clientName: string; ownerName: string; statusLabel: string; activities: number }[] };
  leaderboard: { ownerId: number; name: string; leadsCreated: number; conversions: number; activities: number; overdueFollowUps: number; opportunitiesTaken: number }[];
};
export type BreakdownRow = { label: string; leads: number; clients: number };

/** Team board (RPT, November 7, 2026): one row per salesperson as things stand now, plus this week's activity. */
export const teamBoardMetrics = ["active", "overdue", "stalled", "replies"] as const;
export type TeamBoardMetric = (typeof teamBoardMetrics)[number];
export const teamBoardMetricLabels: Record<TeamBoardMetric, string> = { active: "Active leads", overdue: "Overdue follow-ups", stalled: "Stalled leads", replies: "Client replies waiting" };
export type TeamBoardRow = {
  userId: number; name: string; role: string;
  activeLeads: number; overdueFollowUps: number; stalled: number; repliesWaiting: number;
  /** This week, from Monday in the business time zone. */
  calls: number; emails: number; visits: number; leadsCreated: number;
  /** The person's most recent timeline entry on any lead. */
  lastActivityAt: string | null;
};
export type TeamBoard = { weekStartYmd: string; rows: TeamBoardRow[] };
/** How much a row needs a manager's eye: what is waiting on the person, weighted, so the board sorts the stuck people first. */
export const teamBoardAttention = (row: Pick<TeamBoardRow, "overdueFollowUps" | "stalled" | "repliesWaiting">) => row.repliesWaiting * 3 + row.overdueFollowUps * 2 + row.stalled;
export const sortTeamBoard = <T extends Pick<TeamBoardRow, "overdueFollowUps" | "stalled" | "repliesWaiting" | "name">>(rows: T[]): T[] =>
  [...rows].sort((a, b) => teamBoardAttention(b) - teamBoardAttention(a) || a.name.localeCompare(b.name));
export type StalledLead = { id: number; clientName: string; ownerId: number; ownerName: string; statusCode: string; statusLabel: string; daysInStatus: number; allowedDays: number; daysSinceActivity: number; followUpDate: string | null; overdueDays: number | null; score: number; reasons: string[] };
