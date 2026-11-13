import { getDatabasePool, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { businessTimeZone, todayYmd } from "@/lib/dates";
import { recordAudit } from "@/features/audit/repository";
import { eligibleSources, jobSourceLabels, orderForSampleCompanies } from "@/features/jobs/model";
import { recordUsage, scheduled, sourceUsage } from "@/features/jobs/repository";
import { jobsCountry, listSourceAdapters } from "@/features/jobs/sources";
import type { FoundRow } from "@/features/jobs/sources/types";
import { addActivity, listMatchableLeads } from "@/features/leads/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { getSettings } from "@/features/settings/repository";
import { matchLead, normalizeCompanyName } from "@/features/trips/matching";
import { listUsersWithPrivilege } from "@/features/users/repository";
import { decideCompany, groupByCompany, isOpportunityRunDue, type CompanyGroup, type ExistingOpportunity, type FoundListing, type LeadState } from "./model";
import { listSearches } from "./repository";

/**
 * The search run (OPP-06, first version): every active search is sent to every enabled job source within its budget,
 * page by page up to the cap; the listings are grouped by company and each company is attached to its live lead,
 * added to the pool, or kept hidden (`decideCompany`). Scheduled runs come from POST /api/jobs/run; an administrator
 * can also start one from the Opportunities screen.
 */

export type RunSummary = { runId: number; periodKey: string | null; status: "success" | "partial" | "failed"; listingsFound: number; newCompanies: number; newListings: number; attached: number; details: string[] };

type ExistingRow = ExistingOpportunity & { id: number; companyKey: string };

const maxTimelineEntriesPerLead = 5;

async function collect(search: { keyword: string; location: string; jobType: string; postedWithinDays: number }, cap: number, db: Queryable, notes: string[]): Promise<{ found: FoundListing[]; failures: number; attempted: number }> {
  const all = await getSettings(db);
  const settings = all.jobSources;
  const adapters = listSourceAdapters();
  const found: FoundListing[] = [];
  let failures = 0;
  let attempted = 0;
  const usage = await sourceUsage(db);
  const order = orderForSampleCompanies(
    eligibleSources(settings, adapters.map((adapter) => ({ id: adapter.id, configured: adapter.configured, usage: usage[adapter.id] }))),
    (process.env.TRIPS_PROVIDER ?? "").trim().toLowerCase() === "stub",
  ).filter((id) => all.opportunities.sources.includes(id));
  for (const id of order) {
    const adapter = adapters.find((candidate) => candidate.id === id)!;
    let page = 1;
    let pageToken: string | null = null;
    let collected = 0;
    attempted += 1;
    while (collected < cap) {
      // The budget is checked before every page, so a long search stops where the daily or monthly allowance ends.
      const current = await sourceUsage(db);
      if (!eligibleSources(settings, [{ id, configured: adapter.configured, usage: current[id] }]).length) { notes.push(`${jobSourceLabels[id]}: budget reached after ${collected} listings`); break; }
      let rows: FoundRow[];
      let hasMore: boolean;
      try {
        const result = await scheduled(adapter, () => adapter.searchListings({ keyword: search.keyword, location: search.location, jobType: search.jobType, postedWithinDays: search.postedWithinDays, country: jobsCountry(), page, pageToken }));
        await recordUsage(db, id, false);
        rows = result.rows;
        hasMore = result.hasMore;
        pageToken = result.nextPageToken;
      } catch (error) {
        await recordUsage(db, id, true).catch(() => undefined);
        notes.push(`${jobSourceLabels[id]}: ${error instanceof Error ? error.message : "failed"}${collected ? ` after ${collected} listings` : ""}`);
        if (!collected) failures += 1;
        break;
      }
      for (const row of rows) {
        if (collected >= cap) break;
        found.push({ source: id, company: row.company, listing: row.listing, sourceKey: row.sourceKey });
        collected += 1;
      }
      if (!hasMore || !rows.length) break;
      page += 1;
    }
    if (collected) notes.push(`${jobSourceLabels[id]}: ${collected} listings for "${search.keyword}"`);
  }
  return { found, failures, attempted };
}

async function existingByKey(keys: string[], db: Queryable): Promise<Map<string, ExistingRow>> {
  const map = new Map<string, ExistingRow>();
  if (!keys.length) return map;
  const { rows } = await db.query('SELECT id, company_key AS "companyKey", status, reason_scope AS "reasonScope", lead_id AS "leadId", matched_lead_id AS "matchedLeadId" FROM opportunities WHERE company_key = ANY(?)', [keys]);
  for (const row of rows as ExistingRow[]) map.set(row.companyKey, { ...row, id: Number(row.id), leadId: row.leadId === null ? null : Number(row.leadId), matchedLeadId: row.matchedLeadId === null ? null : Number(row.matchedLeadId) });
  return map;
}

type AttachedTitle = { title: string; source: string; url: string; location: string };
type Outcome = { newCompany: boolean; newListings: number; attachedTo: { leadId: number; titles: AttachedTitle[] } | null };

async function applyGroup(group: CompanyGroup, searchIds: Map<string, number>, existing: ExistingRow | undefined, matched: LeadState | null, linked: LeadState | null, now: Date, db: Queryable): Promise<Outcome> {
  let decision = decideCompany(existing ?? null, matched, linked);
  const nowSql = toSqlDateTime(now);
  const leadId = decision.action === "attach" ? decision.leadId : null;
  let opportunityId = existing?.id ?? null;
  if (opportunityId === null) {
    const { rows } = await db.query(
      `INSERT INTO opportunities (company_key, company_name, website, location, status, lead_id, matched_lead_id, revived, listings_count, latest_title, first_seen_at, last_seen_at)
       VALUES (?, ?, '', ?, ?, ?, ?, FALSE, 0, '', ?, ?) RETURNING id`,
      [group.key, group.company.slice(0, 200), group.location.slice(0, 160), decision.action === "attach" ? "attached" : "new", leadId, decision.action === "pool" ? decision.matchedLeadId : null, nowSql, nowSql],
    );
    opportunityId = Number((rows as { id: number }[])[0].id);
  }
  let newListings = 0;
  const titles: AttachedTitle[] = [];
  for (const item of group.listings) {
    const result = await db.query(
      `INSERT INTO opportunity_listings (opportunity_id, source, source_key, title, location, employment_type, posted_at, url, search_id, lead_id, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (opportunity_id, source_key) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, title = EXCLUDED.title, lead_id = COALESCE(EXCLUDED.lead_id, opportunity_listings.lead_id)
       RETURNING (xmax = 0) AS inserted`,
      [opportunityId, item.source, item.sourceKey, item.listing.title.slice(0, 200), item.listing.location.slice(0, 160), item.listing.employmentType, item.listing.postedAt, item.listing.url.slice(0, 2048), searchIds.get(item.sourceKey) ?? null, leadId, nowSql, nowSql],
    );
    if ((result.rows as { inserted: boolean }[])[0]?.inserted) {
      newListings += 1;
      if (leadId) titles.push({ title: item.listing.title, source: jobSourceLabels[item.source], url: item.listing.url, location: item.listing.location });
    }
  }
  // A role-level "not relevant" only comes back when a listing nobody has seen before appears.
  if (existing?.status === "not_relevant" && decision.action === "pool" && newListings === 0) decision = { action: "silent" };
  // A card that became a lead stays "converted" while its listings keep feeding that lead.
  const attachedStatus = existing?.status === "converted" && existing.leadId === leadId ? "converted" : "attached";
  if (existing) {
    if (decision.action === "silent") {
      await db.query("UPDATE opportunities SET company_name = ?, last_seen_at = ? WHERE id = ?", [group.company.slice(0, 200), nowSql, opportunityId]);
    } else {
      await db.query(
        `UPDATE opportunities SET company_name = ?, location = CASE WHEN location = '' THEN ? ELSE location END, status = ?, lead_id = ?, matched_lead_id = ?, revived = ?, last_seen_at = ?,
           reason_id = NULL, reason_scope = NULL, reason_note = '', decided_by = NULL, decided_at = NULL
         WHERE id = ?`,
        [group.company.slice(0, 200), group.location.slice(0, 160), decision.action === "attach" ? attachedStatus : "new", leadId, decision.action === "pool" ? decision.matchedLeadId : null, decision.action === "pool" && decision.revived, nowSql, opportunityId],
      );
    }
  }
  await db.query(
    `UPDATE opportunities SET listings_count = (SELECT COUNT(*) FROM opportunity_listings WHERE opportunity_id = ?),
       latest_title = COALESCE((SELECT title FROM opportunity_listings WHERE opportunity_id = ? ORDER BY posted_at DESC NULLS LAST, last_seen_at DESC, id DESC LIMIT 1), '')
     WHERE id = ?`,
    [opportunityId, opportunityId, opportunityId],
  );
  const newCompany = decision.action === "pool" && (!existing || existing.status !== "new");
  return { newCompany, newListings, attachedTo: leadId && titles.length ? { leadId, titles } : null };
}

/** Writes the timeline entries and tells the owner about listings that attached to a live lead. */
async function announceAttached(leadId: number, titles: AttachedTitle[], actorId: number | null, now: Date, db: Queryable) {
  const { rows } = await db.query('SELECT client_name AS "clientName", owner_id AS "ownerId" FROM leads WHERE id = ?', [leadId]);
  const lead = (rows as { clientName: string; ownerId: number }[])[0];
  if (!lead) return;
  const shown = titles.slice(0, maxTimelineEntriesPerLead);
  for (const item of shown) {
    await addActivity(db, { leadId, userId: actorId, type: "listing", occurredAt: now, touch: false, summary: `New job listing found: ${item.title} (${item.source})`, body: [item.url, item.location].filter(Boolean).join("\n") });
  }
  if (titles.length > shown.length) {
    await addActivity(db, { leadId, userId: actorId, type: "listing", occurredAt: now, touch: false, summary: `${titles.length - shown.length} more job listings found`, body: titles.slice(shown.length).map((item) => `${item.title} (${item.source}) ${item.url}`).join("\n") });
  }
  await notifyUsers(db, {
    userIds: [Number(lead.ownerId)], actorId, type: "listing_found", leadId,
    title: `${lead.clientName} is hiring: ${titles.length === 1 ? titles[0].title : `${titles.length} new job listings`}`,
    body: titles.slice(0, 6).map((item) => `${item.title} (${item.source})`).join("\n"),
  });
}

export async function runOpportunitySearches(options: { trigger: "scheduled" | "manual"; actorId: number | null; periodKey?: string | null; now?: Date }): Promise<RunSummary> {
  const db = getDatabasePool();
  const now = options.now ?? new Date();
  const settings = await getSettings(db);
  const searches = (await listSearches(db)).filter((search) => search.active);
  const runResult = await db.query("INSERT INTO opportunity_runs (trigger_kind, status, actor_id, started_at) VALUES (?, 'running', ?, ?) RETURNING id", [options.trigger, options.actorId, toSqlDateTime(now)]);
  const runId = insertId(runResult);
  const notes: string[] = [];
  const found: FoundListing[] = [];
  const searchIds = new Map<string, number>();
  const perSearch = new Map<number, { found: number }>();
  let failures = 0;
  let attempted = 0;
  if (!searches.length) notes.push("No active search; add one under Searches.");
  for (const search of searches) {
    const cap = search.maxListings ?? settings.opportunities.maxListings;
    const result = await collect(search, cap, db, notes);
    failures += result.failures;
    attempted += result.attempted;
    for (const item of result.found) { if (!searchIds.has(item.sourceKey)) searchIds.set(item.sourceKey, search.id); found.push(item); }
    perSearch.set(search.id, { found: result.found.length });
  }
  if (searches.length && !attempted) notes.push("No job source is configured or within budget.");

  const groups = groupByCompany(found, normalizeCompanyName);
  const leads = await listMatchableLeads(db);
  const leadState = (id: number | null): LeadState | null => { const lead = id === null ? undefined : leads.find((candidate) => candidate.id === id); return lead ? { id: lead.id, recordState: lead.recordState, statusCode: lead.statusCode } : null; };
  const existing = await existingByKey(groups.map((group) => group.key), db);
  let newCompanies = 0;
  let newListings = 0;
  let attached = 0;
  const newBySearch = new Map<number, number>();
  for (const group of groups) {
    const current = existing.get(group.key);
    const match = matchLead({ name: group.company, website: "", phone: "", address: group.location }, leads);
    const matched: LeadState | null = match ? { id: match.lead.id, recordState: match.lead.recordState, statusCode: match.lead.statusCode } : null;
    const linked = leadState(current?.leadId ?? null);
    try {
      const outcome = await withTransaction(async (connection) => {
        const result = await applyGroup(group, searchIds, current, matched, linked, now, connection);
        if (result.attachedTo) await announceAttached(result.attachedTo.leadId, result.attachedTo.titles, options.actorId, now, connection);
        return result;
      });
      if (outcome.newCompany) newCompanies += 1;
      newListings += outcome.newListings;
      if (outcome.attachedTo) attached += 1;
      if (outcome.newListings) { const searchId = searchIds.get(group.listings[0].sourceKey); if (searchId) newBySearch.set(searchId, (newBySearch.get(searchId) ?? 0) + outcome.newListings); }
    } catch (error) {
      notes.push(`${group.company}: could not be saved (${error instanceof Error ? error.message : "error"})`);
    }
  }
  for (const search of searches) {
    await db.query("UPDATE opportunity_searches SET last_run_at = ?, last_found = ?, last_new = ? WHERE id = ?", [toSqlDateTime(now), perSearch.get(search.id)?.found ?? 0, newBySearch.get(search.id) ?? 0, search.id]);
  }
  const status: RunSummary["status"] = searches.length && attempted && failures >= attempted && !found.length ? "failed" : failures ? "partial" : "success";
  const details = notes.join(" · ").slice(0, 4000);
  await db.query(
    "UPDATE opportunity_runs SET status = ?, finished_at = ?, listings_found = ?, new_companies = ?, new_listings = ?, attached = ?, details = ? WHERE id = ?",
    [status, toSqlDateTime(new Date()), found.length, newCompanies, newListings, attached, details, runId],
  );
  await recordAudit(db, { actorId: options.actorId, action: "opportunities.run", entityType: "job", entityId: runId, after: { trigger: options.trigger, status, listingsFound: found.length, newCompanies, newListings, attached }, details: `Lead search ${status}: ${found.length} listings, ${newCompanies} new companies, ${attached} attached to deals` });
  if (newCompanies > 0 && settings.opportunities.notify) {
    const people = await listUsersWithPrivilege("create_leads", db);
    await notifyUsers(db, {
      userIds: people.filter((person) => person.role !== "recruiter").map((person) => person.id), actorId: options.actorId, type: "opportunities_found",
      title: `${newCompanies} new ${newCompanies === 1 ? "company" : "companies"} in the leads inbox`,
      body: `${newListings} new job listing${newListings === 1 ? "" : "s"} from ${searches.map((search) => search.name).join(", ") || "the searches"}. Open Leads to assign them.`,
    });
  }
  return { runId, periodKey: options.periodKey ?? null, status, listingsFound: found.length, newCompanies, newListings, attached, details: notes };
}

/** The scheduled run: once per configured day, after the configured time, claimed through `job_runs` like the digests. */
export async function runScheduledOpportunities(now = new Date()): Promise<RunSummary | null> {
  const db = getDatabasePool();
  const settings = await getSettings(db);
  const timeZone = businessTimeZone();
  const today = todayYmd(now, timeZone);
  if (!isOpportunityRunDue(settings.opportunities, now, timeZone, today)) return null;
  const claim = await db.query("INSERT INTO job_runs (job, period_key, status, started_at) VALUES ('opportunities', ?, 'running', ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id", [today, toSqlDateTime(now)]);
  if (!claim.rowCount) return null;
  const jobRunId = insertId(claim);
  try {
    const summary = await runOpportunitySearches({ trigger: "scheduled", actorId: null, periodKey: today, now });
    await db.query("UPDATE job_runs SET status = ?, finished_at = ?, details = ? WHERE id = ?", [summary.status, toSqlDateTime(new Date()), `${summary.listingsFound} listings, ${summary.newCompanies} new companies, ${summary.attached} attached`, jobRunId]);
    return summary;
  } catch (error) {
    await db.query("UPDATE job_runs SET status = 'failed', finished_at = ?, details = ? WHERE id = ?", [toSqlDateTime(new Date()), (error instanceof Error ? error.message : "failed").slice(0, 500), jobRunId]).catch(() => undefined);
    throw error;
  }
}
