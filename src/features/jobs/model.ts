import type { JobListing } from "../trips/model.ts";
import { monthKeyOf, nextResetYmd, reachedThresholds, usagePercent } from "../maps/model.ts";

/**
 * Job-listing sources (TRIP-06, OPP-01; SPEC §7.13). Several sources are combined behind one lookup: a per-company
 * cache answers first, then the sources are tried in the configured order, free tiers before paid ones, each within
 * a daily and monthly call budget. Keys live in the environment; order, budgets, and cache life are settings.
 */
export const jobSourceIds = ["adzuna", "jsearch", "hasdata", "generic", "stub"] as const;
export type JobSourceId = (typeof jobSourceIds)[number];

export const jobSourceLabels: Record<JobSourceId, string> = {
  adzuna: "Adzuna",
  jsearch: "JSearch (Google for Jobs)",
  hasdata: "Indeed via HasData",
  generic: "Custom JSON source",
  stub: "Sample listings",
};

/** What each source needs in `.env.local` (shown in Settings when a key is missing). */
export const jobSourceEnvHints: Record<JobSourceId, string> = {
  adzuna: "ADZUNA_APP_ID and ADZUNA_APP_KEY (free developer key)",
  jsearch: "JSEARCH_API_KEY (RapidAPI key)",
  hasdata: "HASDATA_API_KEY",
  generic: "JOBS_API_URL and JOBS_API_KEY",
  stub: "TRIPS_PROVIDER=stub or JOBS_SOURCES=stub",
};

export type JobSourceBudget = { enabled: boolean; daily: number; monthly: number };
export type JobSourceSettings = { order: JobSourceId[]; budgets: Record<JobSourceId, JobSourceBudget>; cacheHours: number; prefetch: number; /** Administrators are told when a source reaches this share of its monthly budget (and again at 100%). */ warnAtPercent: number };

/** Defaults sized for the free tiers: Adzuna 250 a day, JSearch about 200 a month, HasData 100 a month free (more on a plan). */
export const defaultJobSources: JobSourceSettings = {
  order: ["adzuna", "jsearch", "hasdata", "generic", "stub"],
  budgets: {
    adzuna: { enabled: true, daily: 200, monthly: 2000 },
    jsearch: { enabled: true, daily: 10, monthly: 180 },
    hasdata: { enabled: true, daily: 50, monthly: 90 },
    generic: { enabled: true, daily: 1000, monthly: 20000 },
    stub: { enabled: true, daily: 100000, monthly: 1000000 },
  },
  cacheHours: 24,
  prefetch: 20,
  warnAtPercent: 80,
};

export const maxCacheHours = 24 * 30;
export const maxPrefetch = 50;

const isSourceId = (value: unknown): value is JobSourceId => typeof value === "string" && jobSourceIds.includes(value as JobSourceId);

export function normalizeJobSources(value: unknown): { jobSources: JobSourceSettings; error: string | null } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const order: JobSourceId[] = [];
  if (record.order !== undefined) {
    if (!Array.isArray(record.order)) return { jobSources: defaultJobSources, error: "The source order must be a list." };
    for (const entry of record.order) {
      if (!isSourceId(entry)) return { jobSources: defaultJobSources, error: `Unknown job source "${String(entry)}".` };
      if (!order.includes(entry)) order.push(entry);
    }
  }
  for (const id of defaultJobSources.order) if (!order.includes(id)) order.push(id);
  const budgetsRecord = record.budgets && typeof record.budgets === "object" ? (record.budgets as Record<string, unknown>) : {};
  const budgets = {} as Record<JobSourceId, JobSourceBudget>;
  for (const id of jobSourceIds) {
    const raw = budgetsRecord[id] && typeof budgetsRecord[id] === "object" ? (budgetsRecord[id] as Record<string, unknown>) : {};
    const daily = raw.daily === undefined ? defaultJobSources.budgets[id].daily : Number(raw.daily);
    const monthly = raw.monthly === undefined ? defaultJobSources.budgets[id].monthly : Number(raw.monthly);
    if (!Number.isInteger(daily) || daily < 0 || !Number.isInteger(monthly) || monthly < 0) return { jobSources: defaultJobSources, error: `Budgets for ${jobSourceLabels[id]} must be whole numbers of calls (0 or more).` };
    budgets[id] = { enabled: raw.enabled === undefined ? defaultJobSources.budgets[id].enabled : raw.enabled === true, daily, monthly };
  }
  const cacheHours = record.cacheHours === undefined ? defaultJobSources.cacheHours : Number(record.cacheHours);
  if (!Number.isInteger(cacheHours) || cacheHours < 1 || cacheHours > maxCacheHours) return { jobSources: defaultJobSources, error: `Cache hours must be between 1 and ${maxCacheHours}.` };
  const prefetch = record.prefetch === undefined ? defaultJobSources.prefetch : Number(record.prefetch);
  if (!Number.isInteger(prefetch) || prefetch < 0 || prefetch > maxPrefetch) return { jobSources: defaultJobSources, error: `Prefetch must be between 0 and ${maxPrefetch} companies.` };
  const warnAtPercent = record.warnAtPercent === undefined ? defaultJobSources.warnAtPercent : Number(record.warnAtPercent);
  if (!Number.isInteger(warnAtPercent) || warnAtPercent < 1 || warnAtPercent > 100) return { jobSources: defaultJobSources, error: "The warning level must be a whole percentage from 1 to 100." };
  return { jobSources: { order, budgets, cacheHours, prefetch, warnAtPercent }, error: null };
}

export type JobSourceUsage = { today: number; month: number; failuresToday: number };

export type JobSourceStatus = {
  id: JobSourceId;
  label: string;
  configured: boolean;
  enabled: boolean;
  budget: JobSourceBudget;
  usage: JobSourceUsage;
  /** Credits the vendor charges per call (HasData: 10), null for sources that count calls only. */
  creditsPerCall: number | null;
  /** The vendor's live account balance when it offers one (HasData), null otherwise or when the check failed. */
  account: JobSourceAccount;
  /** Why the source is not usable right now, or null. */
  note: string | null;
};

/** Pure routing: the sources that may be called now, in the configured order (SPEC §7.13). */
export function eligibleSources(settings: JobSourceSettings, statuses: { id: JobSourceId; configured: boolean; usage: JobSourceUsage }[]): JobSourceId[] {
  const byId = new Map(statuses.map((status) => [status.id, status]));
  return settings.order.filter((id) => {
    const status = byId.get(id);
    const budget = settings.budgets[id];
    if (!status || !status.configured || !budget.enabled) return false;
    return status.usage.today < budget.daily && status.usage.month < budget.monthly;
  });
}

/**
 * With the sample trip provider (TRIPS_PROVIDER=stub) every company is fictional, so the sample job source answers
 * first and the live sources, which would only spend their budgets on names that exist nowhere, are never reached.
 */
export function orderForSampleCompanies(order: JobSourceId[], sampleCompanies: boolean): JobSourceId[] {
  if (!sampleCompanies || !order.includes("stub")) return order;
  return ["stub", ...order.filter((id) => id !== "stub")];
}

export function sourceNote(id: JobSourceId, settings: JobSourceSettings, status: { configured: boolean; usage: JobSourceUsage }): string | null {
  const budget = settings.budgets[id];
  if (!status.configured) return `Not configured: set ${jobSourceEnvHints[id]}.`;
  if (!budget.enabled) return "Switched off.";
  if (status.usage.month >= budget.monthly) return "Monthly budget spent.";
  if (status.usage.today >= budget.daily) return "Daily budget spent.";
  return null;
}

export const isCacheFresh = (fetchedAt: string | Date | null, cacheHours: number, now = Date.now()): boolean => {
  if (!fetchedAt) return false;
  const time = new Date(fetchedAt).getTime();
  return !Number.isNaN(time) && now - time < cacheHours * 3600 * 1000;
};

const employmentTypes: [RegExp, string][] = [
  [/full[\s_-]?time/i, "Full-time"], [/part[\s_-]?time/i, "Part-time"], [/contract/i, "Contract"], [/temporary|^temp$/i, "Temporary"],
  [/permanent/i, "Permanent"], [/intern/i, "Internship"], [/casual/i, "Casual"], [/seasonal/i, "Seasonal"], [/apprentice/i, "Apprenticeship"],
];

/** The first label that names an employment type ("Full-time", "FULLTIME", "contract"), or null. */
export function employmentTypeFrom(labels: (string | null | undefined)[]): string | null {
  for (const label of labels) {
    if (!label) continue;
    for (const [pattern, name] of employmentTypes) if (pattern.test(label)) return name;
  }
  return null;
}

/** Fallback normaliser when the caller passes none: lower case, letters and digits only. */
export const plainName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Keeps listings whose company matches the one asked about (sources search by keyword, so neighbours slip in). */
export function keepCompanyListings<T extends { company: string }>(rows: T[], companyName: string, normalize: (name: string) => string): T[] {
  const wanted = normalize(companyName);
  if (!wanted) return rows;
  return rows.filter((row) => {
    const candidate = normalize(row.company);
    return candidate === wanted || candidate.startsWith(`${wanted} `) || wanted.startsWith(`${candidate} `);
  });
}

export const hiringLabelFor = (listings: JobListing[] | null): string => (listings === null ? "—" : `${listings.length} ${listings.length === 1 ? "Job" : "Jobs"}`);

// ---------------------------------------------------------------------------------------------------------------------
// Usage meter (SPEC §7.13, November 7, 2026): credits, the vendor's live balance, alerts, and the card everyone sees

/** Credits the vendor deducts per successful call; sources without a credit system count calls only. */
export const jobSourceCreditsPerCall: Partial<Record<JobSourceId, number>> = { hasdata: 10 };

/** HasData's `GET /user/me/usage` answer, reduced: the account's total and remaining credits and when the app last asked. */
export type JobSourceAccount = { totalCredits: number; availableCredits: number; checkedAt: string } | null;

export function parseHasDataUsage(raw: unknown, checkedAt = new Date()): JobSourceAccount {
  const body = raw as { status?: unknown; data?: { totalCredits?: unknown; availableCredits?: unknown } } | null;
  const total = Number(body?.data?.totalCredits);
  const available = Number(body?.data?.availableCredits);
  if (!body || (body.status !== undefined && body.status !== "ok") || !Number.isFinite(total) || !Number.isFinite(available)) return null;
  return { totalCredits: Math.max(0, Math.round(total)), availableCredits: Math.max(0, Math.round(available)), checkedAt: checkedAt.toISOString() };
}

export type JobsUsageSource = {
  id: JobSourceId;
  label: string;
  enabled: boolean;
  budget: JobSourceBudget;
  usage: JobSourceUsage;
  creditsPerCall: number | null;
  /** Credits this app spent this month (calls × creditsPerCall), null without a credit system. */
  creditsThisMonth: number | null;
  /** Share of the monthly budget used (0–100+). */
  percent: number;
  /** Calls left under the monthly budget, never below 0 (the daily budget may stop earlier). */
  remainingCalls: number;
  account: JobSourceAccount;
  /** Calls the source can still answer: the budget's remainder, capped by the account balance when known. */
  callsLeft: number;
  note: string | null;
};

export type JobsUsageOverview = { configured: boolean; warnAtPercent: number; monthKey: string; resetsOn: string; sources: JobsUsageSource[] };

/** The calls still possible: what the monthly budget leaves, and no more than the account's credits can pay for. */
export function jobsCallsLeft(remainingCalls: number, account: JobSourceAccount, creditsPerCall: number | null): number {
  const byBudget = Math.max(0, remainingCalls);
  if (!account || !creditsPerCall) return byBudget;
  return Math.min(byBudget, Math.floor(account.availableCredits / creditsPerCall));
}

/** One source's line of the usage card. Pure: the repository supplies usage, configuration, and the balance. */
export function jobsUsageSource(id: JobSourceId, settings: JobSourceSettings, status: { configured: boolean; usage: JobSourceUsage; account: JobSourceAccount }): JobsUsageSource {
  const budget = settings.budgets[id];
  const creditsPerCall = jobSourceCreditsPerCall[id] ?? null;
  const remainingCalls = Math.max(0, budget.monthly - status.usage.month);
  return {
    id, label: jobSourceLabels[id], enabled: budget.enabled, budget, usage: status.usage, creditsPerCall,
    creditsThisMonth: creditsPerCall ? status.usage.month * creditsPerCall : null,
    percent: usagePercent(status.usage.month, budget.monthly), remainingCalls, account: status.account,
    callsLeft: jobsCallsLeft(remainingCalls, status.account, creditsPerCall),
    note: sourceNote(id, settings, status),
  };
}

export const jobsMonthKey = monthKeyOf;
export const jobsResetYmd = nextResetYmd;
/** The thresholds (warn level, 100) a source's monthly usage has just reached. */
export const jobsReachedThresholds = (used: number, budget: number, warnAtPercent: number) => reachedThresholds(used, budget, warnAtPercent);

/** The administrators' notification when a source reaches its warning level or its monthly budget. */
export function jobsAlert(id: JobSourceId, percent: number, used: number, budget: number, resetsOn: string): { title: string; body: string } {
  const label = jobSourceLabels[id];
  const credits = jobSourceCreditsPerCall[id];
  const calls = `${used} of ${budget} calls${credits ? ` (${used * credits} credits)` : ""} this month`;
  if (percent >= 100) {
    return { title: `${label}: monthly call budget spent`, body: `${calls}. The searches and hiring lookups stop asking ${label} until the counter restarts on ${resetsOn}; raise the budget under Settings → Job listing sources if the plan allows it.` };
  }
  return { title: `${label}: ${percent}% of the monthly call budget used`, body: `${calls}; ${Math.max(0, budget - used)} calls left before the app stops asking ${label} this month. The counter restarts on ${resetsOn}.` };
}
