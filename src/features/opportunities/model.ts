import type { JobSourceId } from "../jobs/model.ts";
import type { JobListing } from "../trips/model.ts";
import { timeOfDayIn, weekdayOfYmd } from "../notifications/model.ts";

/**
 * Opportunity pool (OPP-*, first version decided on November 6, 2026): scheduled keyword searches on the job-listing
 * sources produce one card per company; salespeople assign a card to themselves or a colleague, which creates the
 * lead, or mark it not relevant. A company that is already a live lead or client never enters the pool: its new
 * listings attach to that lead. Pure rules live here so the unit tests can load them without the app.
 */

export const opportunityStatuses = ["new", "attached", "converted", "not_relevant"] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];
export type ReasonScope = "company" | "role";

/** Not-relevant reasons whose meaning is about the role, not the company: the company comes back with a new role. */
export const roleLevelReasonCodes: readonly string[] = ["position_not_relevant"];
export const reasonScopeFor = (code: string | null | undefined): ReasonScope => (code && roleLevelReasonCodes.includes(code) ? "role" : "company");

/** Statuses that close a lead while it stays active (LEAD-06); such a lead no longer blocks the pool. */
export const closedStatusCodes: readonly string[] = ["lost", "disqualified"];
export const isLiveLead = (lead: { recordState: string; statusCode: string } | null | undefined): boolean =>
  Boolean(lead && lead.recordState !== "archived" && !closedStatusCodes.includes(lead.statusCode));

// ---------------------------------------------------------------------------------------------------------------------
// Schedule (Settings → Opportunity searches)

export type OpportunitySettings = { enabled: boolean; days: number[]; time: string; maxListings: number; notify: boolean; /** Pre-filled on a new search (OPP-03, November 7, 2026): the job titles, the single location, and the posted-within window in days. */ defaultTitles: string[]; defaultLocation: string; postedWithinDays: number; /** Job sources the searches go to (decided November 6, 2026: Indeed only; the sample source only exists on sample stacks). */ sources: JobSourceId[] };
export const opportunitySourceIds: readonly JobSourceId[] = ["adzuna", "jsearch", "hasdata", "generic", "stub"];
export const defaultOpportunitySettings: OpportunitySettings = {
  enabled: true, days: [1, 3, 5], time: "06:30", maxListings: 200, notify: true, sources: ["hasdata", "stub"],
  defaultTitles: ["General Labourer", "Warehouse Associate", "Forklift Operator", "Machine Operator", "Production Worker"], defaultLocation: "Ontario", postedWithinDays: 30,
};
export const minMaxListings = 20;
export const maxMaxListings = 1000;
/** A search carries a group of job titles; HasData/Indeed take one keyword per call, so the titles become one OR query (`indeedKeyword`). */
export const maxSearchTitles = 10;
export const maxTitleLength = 80;
export const minPostedWithinDays = 1;
export const maxPostedWithinDays = 90;
export const defaultPostedWithinDays = 30;

/** Job titles out of an array or a newline/comma-separated text: trimmed, non-empty, de-duplicated regardless of case. */
export function parseTitles(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]+/) : [];
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const title = item.trim().replace(/\s+/g, " ");
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    titles.push(title);
  }
  return titles;
}

/**
 * The single keyword a job source receives for a search. One title goes as typed (so an admin's own operators still
 * work); several are joined with OR, each multi-word title in quotes so Indeed matches the phrase, not the words.
 */
export function indeedKeyword(titles: readonly string[]): string {
  const clean = titles.map((title) => title.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return clean.map((title) => (/\s/.test(title) && !title.includes('"') ? `"${title}"` : title)).join(" OR ");
}

function titlesError(titles: string[], required: boolean): string | null {
  if (required && !titles.length) return "Enter at least one job title.";
  if (titles.length > maxSearchTitles) return `Up to ${maxSearchTitles} job titles per search.`;
  if (titles.some((title) => title.length > maxTitleLength)) return `Each job title is limited to ${maxTitleLength} characters.`;
  return null;
}

/** The posted-within window in days: the default when missing, otherwise an integer inside the allowed range. */
export function parsePostedWithinDays(value: unknown, fallback = defaultPostedWithinDays): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const days = Number(value);
  return Number.isInteger(days) && days >= minPostedWithinDays && days <= maxPostedWithinDays ? days : null;
}

export function normalizeOpportunitySettings(value: unknown): { settings: OpportunitySettings; error: string | null } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const time = typeof record.time === "string" ? record.time.trim() : defaultOpportunitySettings.time;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { settings: defaultOpportunitySettings, error: "The search time must be HH:MM." };
  const rawDays = record.days === undefined ? defaultOpportunitySettings.days : record.days;
  if (!Array.isArray(rawDays) || rawDays.some((day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6)) {
    return { settings: defaultOpportunitySettings, error: "Search days must be weekday numbers from 0 (Sunday) to 6 (Saturday)." };
  }
  const days = [...new Set(rawDays.map(Number))].sort((a, b) => a - b);
  const maxListings = record.maxListings === undefined ? defaultOpportunitySettings.maxListings : Number(record.maxListings);
  if (!Number.isInteger(maxListings) || maxListings < minMaxListings || maxListings > maxMaxListings) {
    return { settings: defaultOpportunitySettings, error: `Listings per search and source must be between ${minMaxListings} and ${maxMaxListings}.` };
  }
  const rawSources = record.sources === undefined ? defaultOpportunitySettings.sources : record.sources;
  if (!Array.isArray(rawSources) || rawSources.some((id) => !opportunitySourceIds.includes(id as JobSourceId))) return { settings: defaultOpportunitySettings, error: "Choose the job sources from the list." };
  const sources = [...new Set(rawSources as JobSourceId[])];
  if (!sources.length) return { settings: defaultOpportunitySettings, error: "Choose at least one job source for the searches." };
  const defaultTitles = record.defaultTitles === undefined ? defaultOpportunitySettings.defaultTitles : parseTitles(record.defaultTitles);
  const titleProblem = titlesError(defaultTitles, false);
  if (titleProblem) return { settings: defaultOpportunitySettings, error: titleProblem };
  const defaultLocation = record.defaultLocation === undefined ? defaultOpportunitySettings.defaultLocation : typeof record.defaultLocation === "string" ? record.defaultLocation.trim() : "";
  if (defaultLocation.length > 160) return { settings: defaultOpportunitySettings, error: "The default location is limited to 160 characters." };
  const postedWithinDays = parsePostedWithinDays(record.postedWithinDays, defaultOpportunitySettings.postedWithinDays);
  if (postedWithinDays === null) return { settings: defaultOpportunitySettings, error: `Posted within must be between ${minPostedWithinDays} and ${maxPostedWithinDays} days.` };
  return {
    settings: {
      enabled: record.enabled === undefined ? defaultOpportunitySettings.enabled : record.enabled === true,
      days, time, maxListings,
      notify: record.notify === undefined ? defaultOpportunitySettings.notify : record.notify === true,
      sources, defaultTitles, defaultLocation, postedWithinDays,
    },
    error: null,
  };
}

/** Whether the scheduled run is due now: enabled, today is one of the days, and the time has passed in the business zone. */
export function isOpportunityRunDue(settings: OpportunitySettings, now: Date, timeZone: string, todayYmd: string): boolean {
  if (!settings.enabled || !settings.days.includes(weekdayOfYmd(todayYmd))) return false;
  const [hour, minute] = settings.time.split(":").map(Number);
  const current = timeOfDayIn(now, timeZone);
  return current.hour * 60 + current.minute >= hour * 60 + minute;
}

// ---------------------------------------------------------------------------------------------------------------------
// Searches

/** A search: a group of job titles sent as one query, one location, and how far back the postings may go. */
export type OpportunitySearchInput = { name: string; titles: string[]; location: string; postedWithinDays: number; jobType: string; maxListings: number | null; active: boolean };
export type OpportunitySearch = OpportunitySearchInput & {
  /** The query the job sources receive, built from the titles (`indeedKeyword`). */
  keyword: string;
  id: number; createdById: number | null; createdByName: string | null; lastRunAt: string | null; lastFound: number; lastNew: number; createdAt: string; updatedAt: string;
};

export const jobTypeOptions = [
  { code: "", label: "Any" }, { code: "full_time", label: "Full time" }, { code: "part_time", label: "Part time" }, { code: "contract", label: "Contract" }, { code: "permanent", label: "Permanent" },
] as const;

export function parseSearchInput(value: unknown): { input: OpportunitySearchInput; errors: string[] } {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const errors: string[] = [];
  const text = (key: string, max: number) => (typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max + 1) : "");
  const name = text("name", 120);
  // `titles` is the current shape; a bare `keyword` (older clients) becomes a single title.
  const titles = parseTitles(body.titles !== undefined ? body.titles : body.keyword);
  const location = text("location", 160);
  const jobType = text("jobType", 60);
  if (!name) errors.push("Give the search a name.");
  if (name.length > 120) errors.push("The name is limited to 120 characters.");
  const titleProblem = titlesError(titles, true);
  if (titleProblem) errors.push(titleProblem);
  const postedWithinDays = parsePostedWithinDays(body.postedWithinDays);
  if (postedWithinDays === null) errors.push(`Posted within must be between ${minPostedWithinDays} and ${maxPostedWithinDays} days.`);
  if (location.length > 160) errors.push("The location is limited to 160 characters.");
  if (jobType && !jobTypeOptions.some((option) => option.code === jobType)) errors.push("Choose a job type from the list.");
  let maxListings: number | null = null;
  if (body.maxListings !== undefined && body.maxListings !== null && body.maxListings !== "") {
    maxListings = Number(body.maxListings);
    if (!Number.isInteger(maxListings) || maxListings < minMaxListings || maxListings > maxMaxListings) errors.push(`Listings per run must be between ${minMaxListings} and ${maxMaxListings}, or empty for the default.`);
  }
  const active = body.active === undefined ? true : body.active === true;
  return { input: { name: name.slice(0, 120), titles, location, postedWithinDays: postedWithinDays ?? defaultPostedWithinDays, jobType, maxListings, active }, errors };
}

// ---------------------------------------------------------------------------------------------------------------------
// Listings found by a run

export type FoundListing = { source: JobSourceId; company: string; listing: JobListing; sourceKey: string };

/** Dedupe key of one listing inside a source: the source's job id, else the URL without tracking parameters. */
export function listingKey(source: string, listing: { url: string }, sourceJobId?: string | null): string {
  let key = (sourceJobId ?? "").trim();
  if (!key) {
    try {
      const url = new URL(listing.url);
      for (const name of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(name)) url.searchParams.delete(name);
      key = url.toString();
    } catch {
      key = listing.url.trim();
    }
  }
  return `${source}:${key.toLowerCase()}`.slice(0, 300);
}

export type CompanyGroup = { key: string; company: string; location: string; listings: FoundListing[] };

/** One group per company (normalised name), listings deduped on their key; biggest groups first. */
export function groupByCompany(found: readonly FoundListing[], normalize: (name: string) => string): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();
  for (const item of found) {
    const key = normalize(item.company);
    if (!key || !item.listing.title || !item.listing.url) continue;
    const group = groups.get(key) ?? { key, company: item.company.trim(), location: item.listing.location, listings: [] };
    if (!groups.has(key)) groups.set(key, group);
    if (group.listings.some((existing) => existing.sourceKey === item.sourceKey)) continue;
    if (!group.location && item.listing.location) group.location = item.listing.location;
    group.listings.push(item);
  }
  return [...groups.values()].sort((a, b) => b.listings.length - a.listings.length || a.company.localeCompare(b.company));
}

// ---------------------------------------------------------------------------------------------------------------------
// What a run does with a company it found

export type LeadState = { id: number; recordState: string; statusCode: string };
export type ExistingOpportunity = { status: OpportunityStatus; reasonScope: ReasonScope | null; leadId: number | null; matchedLeadId: number | null };
export type CompanyDecision =
  | { action: "attach"; leadId: number }
  | { action: "pool"; revived: boolean; matchedLeadId: number | null }
  | { action: "silent" };

/**
 * - A live lead or client (from the CRM match, or the lead this card was converted to or attached to earlier) takes
 *   the listings; nothing enters the pool.
 * - A card marked not relevant stays hidden for a company-level reason and comes back for a role-level one.
 * - Otherwise the company is (back) in the pool; a closed or archived lead it matched is kept as history.
 */
export function decideCompany(existing: ExistingOpportunity | null, matched: LeadState | null, linked: LeadState | null): CompanyDecision {
  const live = [matched, linked].find((lead) => isLiveLead(lead));
  if (live) return { action: "attach", leadId: live.id };
  if (existing?.status === "not_relevant") return existing.reasonScope === "role" ? { action: "pool", revived: true, matchedLeadId: matched?.id ?? linked?.id ?? existing.matchedLeadId } : { action: "silent" };
  const revived = existing?.status === "converted" || existing?.status === "attached";
  return { action: "pool", revived, matchedLeadId: matched?.id ?? linked?.id ?? existing?.matchedLeadId ?? null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Rows for the screen

export type OpportunityListing = { id: number; source: JobSourceId; sourceLabel: string; title: string; location: string; employmentType: string | null; postedAt: string | null; url: string; firstSeenAt: string; lastSeenAt: string };

export type Opportunity = {
  id: number; companyName: string; website: string; location: string; status: OpportunityStatus;
  listingsCount: number; latestTitle: string; sources: string[]; firstSeenAt: string; lastSeenAt: string;
  /** The lead this card became (converted) or feeds (attached), with its owner, when any. */
  lead: { id: number; clientName: string; ownerId: number; ownerName: string; statusLabel: string; recordState: string } | null;
  /** A closed or archived lead for the same company found at discovery time (history shown on the card). */
  history: { id: number; clientName: string; ownerName: string; statusLabel: string; recordState: string } | null;
  revived: boolean;
  reason: string | null; reasonScope: ReasonScope | null; reasonNote: string;
  decidedByName: string | null; decidedAt: string | null;
  listings: OpportunityListing[];
};

export type OpportunityRun = {
  id: number; trigger: "scheduled" | "manual"; status: "running" | "success" | "partial" | "failed"; startedAt: string; finishedAt: string | null;
  listingsFound: number; newCompanies: number; newListings: number; attached: number; details: string; actorName: string | null;
};

export type OpportunityPage = { opportunities: Opportunity[]; total: number; counts: Record<OpportunityStatus, number> };
