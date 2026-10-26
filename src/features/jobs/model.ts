import type { JobListing } from "../trips/model.ts";

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
export type JobSourceSettings = { order: JobSourceId[]; budgets: Record<JobSourceId, JobSourceBudget>; cacheHours: number; prefetch: number };

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
  return { jobSources: { order, budgets, cacheHours, prefetch }, error: null };
}

export type JobSourceUsage = { today: number; month: number; failuresToday: number };

export type JobSourceStatus = {
  id: JobSourceId;
  label: string;
  configured: boolean;
  enabled: boolean;
  budget: JobSourceBudget;
  usage: JobSourceUsage;
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
