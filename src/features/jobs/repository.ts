import { getDatabasePool, fromSqlDateTime, toSqlDateTime, type Queryable } from "@/lib/db";
import { getSettings } from "@/features/settings/repository";
import { normalizeCompanyName } from "@/features/trips/matching";
import type { JobListing } from "@/features/trips/model";
import { listUsersWithPrivilege } from "@/features/users/repository";
import { notifyUsers } from "@/features/notifications/repository";
import {
  eligibleSources, isCacheFresh, jobSourceCreditsPerCall, jobSourceLabels, jobsAlert, jobsMonthKey, jobsReachedThresholds, jobsResetYmd, jobsUsageSource, orderForSampleCompanies, parseHasDataUsage, sourceNote,
  type JobSourceAccount, type JobSourceId, type JobSourceStatus, type JobSourceUsage, type JobsUsageOverview,
} from "./model";
import { jobsCountry, listSourceAdapters, type CompanyJobsInput, type JobSourceAdapter } from "./sources";
import { fetchHasDataUsage } from "./sources/hasdata";
import { cityOf } from "./sources/types";

/**
 * The job-sources layer (SPEC §7.13): per-company cache first, then the configured sources in order within their
 * budgets, one call at a time per source with its minimum gap. Usage is counted per source and day.
 */

const chains = new Map<JobSourceId, Promise<unknown>>();
const lastCall = new Map<JobSourceId, number>();

/** Serialises calls to one source and keeps its minimum gap (in-process, which is enough for one app instance). */
export function scheduled<T>(adapter: JobSourceAdapter, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(adapter.id) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const wait = (lastCall.get(adapter.id) ?? 0) + adapter.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall.set(adapter.id, Date.now());
    return work();
  });
  chains.set(adapter.id, run);
  return run;
}

const todayYmd = () => new Date().toISOString().slice(0, 10);
const emptyUsage = (): JobSourceUsage => ({ today: 0, month: 0, failuresToday: 0 });

export async function sourceUsage(db: Queryable = getDatabasePool()): Promise<Record<JobSourceId, JobSourceUsage>> {
  const today = todayYmd();
  const { rows } = await db.query(
    `SELECT source, SUM(CASE WHEN day = ? THEN calls ELSE 0 END)::int AS today, SUM(calls)::int AS month, SUM(CASE WHEN day = ? THEN failures ELSE 0 END)::int AS "failuresToday"
     FROM job_source_usage WHERE day >= ? GROUP BY source`,
    [today, today, `${today.slice(0, 8)}01`],
  );
  const usage = Object.fromEntries(listSourceAdapters().map((adapter) => [adapter.id, emptyUsage()])) as Record<JobSourceId, JobSourceUsage>;
  for (const row of rows as { source: JobSourceId; today: number; month: number; failuresToday: number }[]) {
    if (row.source in usage) usage[row.source] = { today: Number(row.today), month: Number(row.month), failuresToday: Number(row.failuresToday) };
  }
  return usage;
}

export async function recordUsage(db: Queryable, source: JobSourceId, failed: boolean) {
  await db.query(
    "INSERT INTO job_source_usage (source, day, calls, failures) VALUES (?, ?, 1, ?) ON CONFLICT (source, day) DO UPDATE SET calls = job_source_usage.calls + 1, failures = job_source_usage.failures + EXCLUDED.failures",
    [source, todayYmd(), failed ? 1 : 0],
  );
  await alertAdministrators(db, source).catch((error: unknown) => console.error("Job-source budget alert failed.", error instanceof Error ? error.message : error));
}

/**
 * Tells administrators once per month when a source reaches the warning level and once when it reaches 100% of its
 * monthly budget (claimed through job_runs, so several app instances never repeat it).
 */
async function alertAdministrators(db: Queryable, source: JobSourceId): Promise<void> {
  const settings = (await getSettings(db)).jobSources;
  const budget = settings.budgets[source];
  if (!budget.enabled || budget.monthly <= 0) return;
  const used = (await sourceUsage(db))[source]?.month ?? 0;
  const month = jobsMonthKey();
  for (const percent of jobsReachedThresholds(used, budget.monthly, settings.warnAtPercent)) {
    const now = toSqlDateTime(new Date());
    const claim = await db.query(
      "INSERT INTO job_runs (job, period_key, status, details, started_at, finished_at) VALUES (?, ?, 'success', ?, ?, ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id",
      [`jobs:${source}:${percent}`, month, `${used} of ${budget.monthly} calls`, now, now],
    );
    if (!claim.rows.length) continue;
    const administrators = (await listUsersWithPrivilege("manage_settings", db)).filter((user) => user.active);
    const alert = jobsAlert(source, percent, used, budget.monthly, jobsResetYmd());
    await notifyUsers(db, { userIds: administrators.map((user) => user.id), type: "jobs_usage", title: alert.title, body: alert.body });
  }
}

const accountCacheMs = 60_000;
let hasDataAccountCache: { at: number; value: JobSourceAccount } | null = null;

/** HasData's live balance, asked at most once a minute per app instance; null when the key is missing or the call fails. */
export async function hasDataAccount(force = false): Promise<JobSourceAccount> {
  const apiKey = process.env.HASDATA_API_KEY?.trim();
  if (!apiKey) return null;
  const now = Date.now();
  if (!force && hasDataAccountCache && now - hasDataAccountCache.at < accountCacheMs) return hasDataAccountCache.value;
  try {
    const value = parseHasDataUsage(await fetchHasDataUsage(apiKey));
    hasDataAccountCache = { at: now, value };
    return value;
  } catch (error) {
    console.error("HasData balance check failed.", error instanceof Error ? error.message : error);
    hasDataAccountCache = { at: now, value: null };
    return null;
  }
}

const accountFor = (id: JobSourceId, configured: boolean): Promise<JobSourceAccount> => (id === "hasdata" && configured ? hasDataAccount() : Promise.resolve(null));

/** The usage card (SPEC §7.13): the configured sources' calls, credits, and balance this month, for everyone who sees the pool or the planner. */
export async function jobsUsageOverview(db: Queryable = getDatabasePool()): Promise<JobsUsageOverview> {
  const settings = (await getSettings(db)).jobSources;
  const usage = await sourceUsage(db);
  const configured = listSourceAdapters().filter((adapter) => adapter.configured && adapter.id !== "stub");
  const sources = await Promise.all(configured.map(async (adapter) => jobsUsageSource(adapter.id, settings, { configured: true, usage: usage[adapter.id] ?? emptyUsage(), account: await accountFor(adapter.id, true) })));
  return { configured: sources.length > 0, warnAtPercent: settings.warnAtPercent, monthKey: jobsMonthKey(), resetsOn: jobsResetYmd(), sources: settings.order.flatMap((id) => sources.filter((source) => source.id === id)) };
}

type CacheRow = { source: JobSourceId; listings: JobListing[] | string; fetchedAt: string };

async function readCache(db: Queryable, key: string): Promise<{ source: JobSourceId; listings: JobListing[]; fetchedAt: string } | null> {
  const { rows } = await db.query('SELECT source, listings, fetched_at AS "fetchedAt" FROM job_listing_cache WHERE company_key = ? ORDER BY fetched_at DESC LIMIT 1', [key]);
  const row = (rows as CacheRow[])[0];
  if (!row) return null;
  let listings: JobListing[] = [];
  if (typeof row.listings === "string") { try { listings = JSON.parse(row.listings) as JobListing[]; } catch { listings = []; } } else if (Array.isArray(row.listings)) listings = row.listings;
  return { source: row.source, listings, fetchedAt: fromSqlDateTime(row.fetchedAt) ?? row.fetchedAt };
}

async function writeCache(db: Queryable, key: string, companyName: string, source: JobSourceId, listings: JobListing[], now: Date) {
  await db.query(
    `INSERT INTO job_listing_cache (company_key, company_name, source, listings, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (company_key, source) DO UPDATE SET company_name = EXCLUDED.company_name, listings = EXCLUDED.listings, fetched_at = EXCLUDED.fetched_at`,
    [key, companyName.slice(0, 200), source, JSON.stringify(listings), toSqlDateTime(now)],
  );
}

export type CompanyJobsResult = { listings: JobListing[] | null; source: JobSourceId | null; fromCache: boolean; fetchedAt: string | null; reason: string | null };

/** Active listings for one company: the cache when fresh, otherwise the first source that answers (SPEC §7.13). */
export async function getCompanyJobs(company: { companyName: string; website?: string; address?: string }, options: { force?: boolean } = {}, db: Queryable = getDatabasePool()): Promise<CompanyJobsResult> {
  const key = normalizeCompanyName(company.companyName);
  if (!key) return { listings: null, source: null, fromCache: false, fetchedAt: null, reason: "No company name." };
  const settings = (await getSettings(db)).jobSources;
  if (!options.force) {
    const cached = await readCache(db, key);
    if (cached && isCacheFresh(cached.fetchedAt, settings.cacheHours)) return { listings: cached.listings, source: cached.source, fromCache: true, fetchedAt: cached.fetchedAt, reason: null };
  }
  const adapters = listSourceAdapters();
  const usage = await sourceUsage(db);
  const order = orderForSampleCompanies(
    eligibleSources(settings, adapters.map((adapter) => ({ id: adapter.id, configured: adapter.configured, usage: usage[adapter.id] ?? emptyUsage() }))),
    (process.env.TRIPS_PROVIDER ?? "").trim().toLowerCase() === "stub",
  );
  if (!order.length) {
    const configured = adapters.filter((adapter) => adapter.configured);
    return { listings: null, source: null, fromCache: false, fetchedAt: null, reason: configured.length ? "Every job source is switched off or over budget." : "No job source is configured." };
  }
  const input: CompanyJobsInput = { companyName: company.companyName, website: company.website ?? "", address: company.address ?? "", city: cityOf(company.address ?? ""), country: jobsCountry(), normalize: normalizeCompanyName };
  let lastError = "";
  for (const id of order) {
    const adapter = adapters.find((candidate) => candidate.id === id)!;
    try {
      const listings = await scheduled(adapter, () => adapter.companyJobs(input));
      await recordUsage(db, id, false);
      const now = new Date();
      await writeCache(db, key, company.companyName, id, listings, now);
      return { listings, source: id, fromCache: false, fetchedAt: now.toISOString(), reason: null };
    } catch (error) {
      lastError = `${jobSourceLabels[id]}: ${error instanceof Error ? error.message : "failed"}`;
      await recordUsage(db, id, true).catch(() => undefined);
    }
  }
  return { listings: null, source: null, fromCache: false, fetchedAt: null, reason: lastError || "No job source answered." };
}

/** Every source with its configuration, budget, and usage, for the Settings page (administrators). */
export async function sourceStatuses(db: Queryable = getDatabasePool()): Promise<JobSourceStatus[]> {
  const settings = (await getSettings(db)).jobSources;
  const usage = await sourceUsage(db);
  const adapters = new Map(listSourceAdapters().map((adapter) => [adapter.id, adapter]));
  return Promise.all(settings.order.map(async (id) => {
    const status = { configured: adapters.get(id)?.configured ?? false, usage: usage[id] ?? emptyUsage() };
    return { id, label: jobSourceLabels[id], configured: status.configured, enabled: settings.budgets[id].enabled, budget: settings.budgets[id], usage: status.usage, note: sourceNote(id, settings, status), creditsPerCall: jobSourceCreditsPerCall[id] ?? null, account: await accountFor(id, status.configured) };
  }));
}
