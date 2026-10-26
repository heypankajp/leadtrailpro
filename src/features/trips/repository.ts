import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { isCacheFresh } from "@/features/jobs/model";
import { getCompanyJobs } from "@/features/jobs/repository";
import { jobSourcesConfigured } from "@/features/jobs/sources";
import { getSettings } from "@/features/settings/repository";
import { recordAudit } from "@/features/audit/repository";
import { statusLabel } from "@/features/list-values/model";
import { assertListValue, getListValue } from "@/features/list-values/repository";
import { hasPrivilege } from "@/features/users/model";
import type { UserAccount } from "@/features/users/model";
import { actionFor, matchLead, type MatchableLead } from "./matching";
import { getTripProvider, type CompanyCandidate } from "./providers";
import type { ExportScope, JobListing, SalesTrip, TripInput, TripResult } from "./model";

// ---- Row mapping ----

type TripRow = Omit<SalesTrip, "lastRunAt" | "createdAt" | "updatedAt"> & { lastRunAt: string | null; createdAt: string; updatedAt: string };
type ResultRow = Omit<TripResult, "jobs" | "jobsFetchedAt" | "createdAt" | "shortlisted"> & { jobs: JobListing[] | string | null; jobsFetchedAt: string | null; createdAt: string; shortlisted: boolean | number };

const tripSelect = `
  SELECT t.id, t.owner_id AS "ownerId", CONCAT(u.first_name, ' ', u.last_name) AS "ownerName", t.title, t.address, t.latitude, t.longitude,
    t.radius_type AS "radiusType", t.radius_value AS radius, t.business_type_id AS "businessTypeId", bt.value AS "businessType", t.max_results AS "maxResults",
    t.provider, t.last_run_at AS "lastRunAt", t.result_count AS "resultCount", t.created_at AS "createdAt", t.updated_at AS "updatedAt"
  FROM sales_trips t
  JOIN users u ON u.id = t.owner_id
  LEFT JOIN list_values bt ON bt.id = t.business_type_id
`;

const resultSelect = `
  SELECT r.id, r.trip_id AS "tripId", r.sequence, r.company_name AS "companyName", r.address, r.latitude, r.longitude, r.distance_km AS "distanceKm",
    r.drive_minutes AS "driveMinutes", r.website, r.phone, r.job_count AS "jobCount", r.jobs, r.jobs_fetched_at AS "jobsFetchedAt",
    r.matched_lead_id AS "matchedLeadId", r.action_code AS "actionCode", r.action_label AS "actionLabel", r.shortlisted, r.planned_visit_date AS "plannedVisitDate", r.created_at AS "createdAt"
  FROM sales_trip_results r
`;

const toTrip = (row: TripRow): SalesTrip => ({
  ...row,
  id: Number(row.id), ownerId: Number(row.ownerId), radius: Number(row.radius), maxResults: Number(row.maxResults), resultCount: Number(row.resultCount),
  businessTypeId: row.businessTypeId === null ? null : Number(row.businessTypeId),
  latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude),
  lastRunAt: fromSqlDateTime(row.lastRunAt), createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt, updatedAt: fromSqlDateTime(row.updatedAt) ?? row.updatedAt,
});

const parseJobs = (value: JobListing[] | string | null): JobListing[] | null => {
  if (value === null) return null;
  if (typeof value === "string") { try { return JSON.parse(value) as JobListing[]; } catch { return null; } }
  return Array.isArray(value) ? value : null;
};

const toResult = (row: ResultRow): TripResult => ({
  ...row,
  id: Number(row.id), tripId: Number(row.tripId), sequence: Number(row.sequence),
  latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude),
  distanceKm: row.distanceKm === null ? null : Number(row.distanceKm), driveMinutes: row.driveMinutes === null ? null : Number(row.driveMinutes),
  jobCount: row.jobCount === null ? null : Number(row.jobCount), jobs: parseJobs(row.jobs), jobsFetchedAt: fromSqlDateTime(row.jobsFetchedAt),
  matchedLeadId: row.matchedLeadId === null ? null : Number(row.matchedLeadId), shortlisted: Boolean(row.shortlisted),
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
});

// ---- Access ----

const canSeeTrip = (viewer: UserAccount, trip: SalesTrip) => trip.ownerId === viewer.id || hasPrivilege(viewer, "view_team_reports");

export async function listTrips(viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<SalesTrip[]> {
  const teamWide = hasPrivilege(viewer, "view_team_reports");
  const { rows } = await db.query(`${tripSelect} ${teamWide ? "" : "WHERE t.owner_id = ?"} ORDER BY t.created_at DESC, t.id DESC LIMIT 200`, teamWide ? [] : [viewer.id]);
  return (rows as TripRow[]).map(toTrip);
}

export async function getTrip(id: number, viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<{ trip: SalesTrip; results: TripResult[] }> {
  const { rows } = await db.query(`${tripSelect} WHERE t.id = ?`, [id]);
  const row = (rows as TripRow[])[0];
  if (!row) throw new HttpError(404, "Sales trip not found.");
  const trip = toTrip(row);
  if (!canSeeTrip(viewer, trip)) throw new HttpError(403, "You can only open your own sales trips.");
  const { rows: resultRows } = await db.query(`${resultSelect} WHERE r.trip_id = ? ORDER BY r.sequence, r.id`, [id]);
  return { trip, results: (resultRows as ResultRow[]).map(toResult) };
}

// ---- Search ----

/** Every lead and client with the fields the matcher compares (TRIP-07). */
async function loadMatchableLeads(db: Queryable): Promise<MatchableLead[]> {
  const { rows } = await db.query(`
    SELECT l.id, l.client_name AS "clientName", l.company_url AS "companyUrl", l.contact_phone AS "contactPhone", l.contact_alt_phone AS "contactAltPhone",
      l.address, ci.value AS city, st.code AS "statusCode", st.value AS status, sr.value AS "statusReason", l.record_state AS "recordState", l.last_activity_at AS "lastActivityAt"
    FROM leads l
    JOIN list_values st ON st.id = l.status_id
    LEFT JOIN list_values sr ON sr.id = l.status_reason_id
    LEFT JOIN list_values ci ON ci.id = l.city_id
  `);
  return (rows as (Omit<MatchableLead, "statusLabel" | "lastActivityAt"> & { statusReason: string | null; lastActivityAt: string })[]).map((row) => ({
    ...row, id: Number(row.id), statusLabel: statusLabel(row.status, row.statusReason), lastActivityAt: fromSqlDateTime(row.lastActivityAt) ?? row.lastActivityAt,
  }));
}

/**
 * Listings for the nearest `prefetch` candidates through the job-sources layer (cache first, then the sources within
 * their budgets); the rest stay unknown until someone opens them (SPEC §7.13). A failing lookup leaves the count unknown.
 */
async function listingsFor(candidates: CompanyCandidate[], prefetch: number, db: Queryable): Promise<(JobListing[] | null)[]> {
  const out: (JobListing[] | null)[] = new Array(candidates.length).fill(null);
  const limit = Math.min(candidates.length, prefetch);
  if (!limit || !jobSourcesConfigured()) return out;
  let next = 0;
  const worker = async () => {
    while (next < limit) {
      const index = next;
      next += 1;
      const candidate = candidates[index];
      try { out[index] = (await getCompanyJobs({ companyName: candidate.name, website: candidate.website, address: candidate.address }, {}, db)).listings; } catch { out[index] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, limit) }, worker));
  return out;
}

/** Provider failures become a 502 with the provider's message instead of the generic database error. */
async function fromProvider<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, `The company data provider failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function runSearch(trip: { address: string; radiusType: TripInput["radiusType"]; radius: number; businessTypeId: number | null; maxResults: number }, db: Queryable) {
  const provider = getTripProvider();
  const businessType = trip.businessTypeId ? await getListValue(trip.businessTypeId, db) : null;
  const origin = await fromProvider(() => provider.geocode(trip.address));
  if (!origin) throw new HttpError(400, "The address could not be located. Try a fuller address or a nearby landmark.");
  const candidates = await fromProvider(() => provider.searchCompanies({ origin, radiusType: trip.radiusType, radius: trip.radius, businessType: businessType ? { code: businessType.code, value: businessType.value } : null, limit: trip.maxResults }));
  const listings = await listingsFor(candidates, (await getSettings(db)).jobSources.prefetch, db);
  const leads = await loadMatchableLeads(db);
  const rows = candidates.map((candidate, index) => {
    const match = matchLead({ name: candidate.name, website: candidate.website, phone: candidate.phone, address: candidate.address }, leads);
    const action = actionFor(match);
    return { candidate, jobs: listings[index], matchedLeadId: match?.lead.id ?? null, action };
  });
  return { provider, origin, rows };
}

async function insertResults(connection: Queryable, tripId: number, rows: Awaited<ReturnType<typeof runSearch>>["rows"], now: Date) {
  const nowSql = toSqlDateTime(now);
  for (const [index, row] of rows.entries()) {
    const c = row.candidate;
    await connection.query(
      `INSERT INTO sales_trip_results (trip_id, sequence, company_name, address, latitude, longitude, distance_km, drive_minutes, website, phone, provider_place_id,
         job_count, jobs, jobs_fetched_at, matched_lead_id, action_code, action_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tripId, index + 1, c.name.slice(0, 200), c.address.slice(0, 500), c.latitude, c.longitude, c.distanceKm, c.driveMinutes, c.website.slice(0, 2048), c.phone.slice(0, 40), c.placeId.slice(0, 120),
        row.jobs ? row.jobs.length : null, row.jobs ? JSON.stringify(row.jobs) : null, row.jobs ? nowSql : null, row.matchedLeadId, row.action.code.slice(0, 40), row.action.label.slice(0, 160), nowSql,
      ],
    );
  }
}

export async function createTrip(input: TripInput, actor: UserAccount): Promise<{ trip: SalesTrip; results: TripResult[] }> {
  const db = getDatabasePool();
  await assertListValue(db, "business_type", input.businessTypeId, { label: "Business type" });
  const search = await runSearch(input, db);
  const now = new Date();
  return withTransaction(async (connection) => {
    const result = await connection.query(
      `INSERT INTO sales_trips (owner_id, title, address, latitude, longitude, radius_type, radius_value, business_type_id, max_results, provider, last_run_at, result_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [actor.id, input.title, input.address, search.origin.latitude, search.origin.longitude, input.radiusType, input.radius, input.businessTypeId, input.maxResults, search.provider.name, toSqlDateTime(now), search.rows.length],
    );
    const id = insertId(result);
    await insertResults(connection, id, search.rows, now);
    await recordAudit(connection, {
      actorId: actor.id, action: "trip.created", entityType: "sales_trip", entityId: id,
      after: { title: input.title, address: input.address, radius: `${input.radius} ${input.radiusType}`, maxResults: input.maxResults, results: search.rows.length },
      details: `${actor.name} planned the sales trip "${input.title}" (${search.rows.length} companies)`,
    }, now);
    return getTrip(id, actor, connection);
  });
}

/** Re-runs the search with the trip's criteria, replacing its results (shortlist and planned visits start over). */
export async function rerunTrip(id: number, actor: UserAccount): Promise<{ trip: SalesTrip; results: TripResult[] }> {
  const db = getDatabasePool();
  const { trip } = await getTrip(id, actor, db);
  if (trip.ownerId !== actor.id && !hasPrivilege(actor, "reassign_leads")) throw new HttpError(403, "Only the trip owner or an administrator can run it again.");
  const search = await runSearch(trip, db);
  const now = new Date();
  return withTransaction(async (connection) => {
    await connection.query("DELETE FROM sales_trip_results WHERE trip_id = ?", [id]);
    await connection.query("UPDATE sales_trips SET latitude = ?, longitude = ?, provider = ?, last_run_at = ?, result_count = ? WHERE id = ?", [search.origin.latitude, search.origin.longitude, search.provider.name, toSqlDateTime(now), search.rows.length, id]);
    await insertResults(connection, id, search.rows, now);
    await recordAudit(connection, { actorId: actor.id, action: "trip.run", entityType: "sales_trip", entityId: id, after: { results: search.rows.length }, details: `${actor.name} re-ran the sales trip "${trip.title}" (${search.rows.length} companies)` }, now);
    return getTrip(id, actor, connection);
  });
}

// ---- Results ----

export async function updateResult(tripId: number, resultId: number, changes: { shortlisted?: boolean; plannedVisitDate?: string | null }, actor: UserAccount): Promise<TripResult> {
  return withTransaction(async (connection) => {
    const { trip, results } = await getTrip(tripId, actor, connection);
    const existing = results.find((row) => row.id === resultId);
    if (!existing) throw new HttpError(404, "Company not found on this trip.");
    const assignments: string[] = [];
    const params: unknown[] = [];
    if (changes.shortlisted !== undefined && changes.shortlisted !== existing.shortlisted) {
      assignments.push("shortlisted = ?"); params.push(changes.shortlisted);
      if (!changes.shortlisted && existing.plannedVisitDate) { assignments.push("planned_visit_date = ?"); params.push(null); }
    }
    if (changes.plannedVisitDate !== undefined && changes.plannedVisitDate !== existing.plannedVisitDate) {
      assignments.push("planned_visit_date = ?"); params.push(changes.plannedVisitDate);
      if (changes.plannedVisitDate && !existing.shortlisted && changes.shortlisted === undefined) { assignments.push("shortlisted = ?"); params.push(true); }
    }
    if (!assignments.length) return existing;
    params.push(resultId);
    await connection.query(`UPDATE sales_trip_results SET ${assignments.join(", ")} WHERE id = ?`, params);
    const { rows } = await connection.query(`${resultSelect} WHERE r.id = ?`, [resultId]);
    const updated = toResult((rows as ResultRow[])[0]);
    await recordAudit(connection, {
      actorId: actor.id, action: updated.plannedVisitDate !== existing.plannedVisitDate ? "trip.visit_planned" : "trip.shortlisted", entityType: "sales_trip", entityId: tripId,
      before: { company: existing.companyName, shortlisted: existing.shortlisted, plannedVisitDate: existing.plannedVisitDate }, after: { company: updated.companyName, shortlisted: updated.shortlisted, plannedVisitDate: updated.plannedVisitDate },
      details: `${actor.name} updated ${updated.companyName} on the sales trip "${trip.title}"`,
    });
    return updated;
  });
}

/** Listings for one company, refreshed through the job-sources layer when missing or older than the cache life (TRIP-06). */
export async function resultJobs(tripId: number, resultId: number, actor: UserAccount): Promise<{ result: TripResult; jobs: JobListing[] | null }> {
  const db = getDatabasePool();
  const { results } = await getTrip(tripId, actor, db);
  const existing = results.find((row) => row.id === resultId);
  if (!existing) throw new HttpError(404, "Company not found on this trip.");
  const { cacheHours } = (await getSettings(db)).jobSources;
  if (existing.jobs !== null && isCacheFresh(existing.jobsFetchedAt, cacheHours)) return { result: existing, jobs: existing.jobs };
  if (!jobSourcesConfigured()) return { result: existing, jobs: existing.jobs };
  const { listings: jobs, reason } = await getCompanyJobs({ companyName: existing.companyName, website: existing.website, address: existing.address }, {}, db);
  if (jobs === null) {
    if (existing.jobs === null && reason) throw new HttpError(503, `Job listings are unavailable: ${reason}`);
    return { result: existing, jobs: existing.jobs };
  }
  const now = new Date();
  await db.query("UPDATE sales_trip_results SET job_count = ?, jobs = ?, jobs_fetched_at = ? WHERE id = ?", [jobs.length, JSON.stringify(jobs), toSqlDateTime(now), resultId]);
  return { result: { ...existing, jobCount: jobs.length, jobs, jobsFetchedAt: now.toISOString() }, jobs };
}

/** Rows for an export or print scope, optionally narrowed to one Action label (TRIP-11). */
export function selectScope(results: TripResult[], scope: ExportScope, action: string | null): TripResult[] {
  const byAction = action ? results.filter((row) => row.actionLabel === action) : results;
  if (scope === "shortlisted") return byAction.filter((row) => row.shortlisted);
  if (scope === "planned") return byAction.filter((row) => row.plannedVisitDate !== null);
  if (scope === "filtered") return byAction;
  return results;
}
