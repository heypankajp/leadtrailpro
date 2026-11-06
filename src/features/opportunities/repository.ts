import { getDatabasePool, affectedRows, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { jobSourceLabels, type JobSourceId } from "@/features/jobs/model";
import { statusLabel } from "@/features/list-values/model";
import { assertListValue, getListValue } from "@/features/list-values/repository";
import { addActivity, getLead, setLeadState, transferLead, updateLead } from "@/features/leads/repository";
import type { LeadSummary } from "@/features/leads/model";
import type { UserAccount } from "@/features/users/model";
import { claimOpportunityForLead } from "./claim";
import { closedStatusCodes, reasonScopeFor, type Opportunity, type OpportunityListing, type OpportunityPage, type OpportunityRun, type OpportunitySearch, type OpportunitySearchInput, type OpportunityStatus, type ReasonScope } from "./model";

/** Reads and the people's actions on the opportunity pool (OPP-*); the search runs live in `runner.ts`. */

// ---- Searches ----

type SearchRow = { id: number; name: string; keyword: string; location: string; jobType: string; maxListings: number | null; active: boolean; createdById: number | null; createdByName: string | null; lastRunAt: string | null; lastFound: number; lastNew: number; createdAt: string; updatedAt: string };

const searchColumns = `
  s.id, s.name, s.keyword, s.location, s.job_type AS "jobType", s.max_listings AS "maxListings", s.is_active AS active, s.created_by AS "createdById",
  CONCAT(u.first_name, ' ', u.last_name) AS "createdByName", s.last_run_at AS "lastRunAt", s.last_found AS "lastFound", s.last_new AS "lastNew", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

const toSearch = (row: SearchRow): OpportunitySearch => ({
  id: Number(row.id), name: row.name, keyword: row.keyword, location: row.location, jobType: row.jobType, maxListings: row.maxListings === null ? null : Number(row.maxListings),
  active: Boolean(row.active), createdById: row.createdById === null ? null : Number(row.createdById), createdByName: row.createdByName?.trim() || null,
  lastRunAt: fromSqlDateTime(row.lastRunAt), lastFound: Number(row.lastFound), lastNew: Number(row.lastNew),
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt, updatedAt: fromSqlDateTime(row.updatedAt) ?? row.updatedAt,
});

export async function listSearches(db: Queryable = getDatabasePool()): Promise<OpportunitySearch[]> {
  const { rows } = await db.query(`SELECT ${searchColumns} FROM opportunity_searches s LEFT JOIN users u ON u.id = s.created_by ORDER BY s.is_active DESC, s.name`);
  return (rows as SearchRow[]).map(toSearch);
}

export async function getSearch(id: number, db: Queryable = getDatabasePool()): Promise<OpportunitySearch | null> {
  const { rows } = await db.query(`SELECT ${searchColumns} FROM opportunity_searches s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?`, [id]);
  const row = (rows as SearchRow[])[0];
  return row ? toSearch(row) : null;
}

export async function createSearch(input: OpportunitySearchInput, actor: UserAccount): Promise<OpportunitySearch> {
  return withTransaction(async (connection) => {
    const result = await connection.query(
      "INSERT INTO opportunity_searches (name, keyword, location, job_type, max_listings, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [input.name, input.keyword, input.location, input.jobType, input.maxListings, input.active, actor.id],
    );
    const search = (await getSearch(insertId(result), connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "opportunity_search.created", entityType: "opportunity_search", entityId: search.id, after: { ...input }, details: `${actor.name} added the search "${input.name}" (${input.keyword})` });
    return search;
  });
}

export async function updateSearch(id: number, input: OpportunitySearchInput, actor: UserAccount): Promise<OpportunitySearch> {
  return withTransaction(async (connection) => {
    const before = await getSearch(id, connection);
    if (!before) throw new HttpError(404, "Search not found.");
    await connection.query(
      "UPDATE opportunity_searches SET name = ?, keyword = ?, location = ?, job_type = ?, max_listings = ?, is_active = ? WHERE id = ?",
      [input.name, input.keyword, input.location, input.jobType, input.maxListings, input.active, id],
    );
    const search = (await getSearch(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "opportunity_search.updated", entityType: "opportunity_search", entityId: id,
      before: { name: before.name, keyword: before.keyword, location: before.location, jobType: before.jobType, maxListings: before.maxListings, active: before.active }, after: { ...input },
      details: `${actor.name} changed the search "${search.name}"`,
    });
    return search;
  });
}

export async function deleteSearch(id: number, actor: UserAccount): Promise<void> {
  return withTransaction(async (connection) => {
    const before = await getSearch(id, connection);
    if (!before) throw new HttpError(404, "Search not found.");
    await connection.query("DELETE FROM opportunity_searches WHERE id = ?", [id]);
    await recordAudit(connection, { actorId: actor.id, action: "opportunity_search.deleted", entityType: "opportunity_search", entityId: id, before: { name: before.name, keyword: before.keyword }, details: `${actor.name} removed the search "${before.name}"` });
  });
}

// ---- Opportunities ----

type OpportunityRow = {
  id: number; companyName: string; website: string; location: string; status: OpportunityStatus; revived: boolean; listingsCount: number; latestTitle: string;
  firstSeenAt: string; lastSeenAt: string; reason: string | null; reasonScope: ReasonScope | null; reasonNote: string; decidedByName: string | null; decidedAt: string | null;
  leadId: number | null; leadName: string | null; leadOwnerId: number | null; leadOwnerName: string | null; leadStatus: string | null; leadStatusReason: string | null; leadRecordState: string | null;
  historyId: number | null; historyName: string | null; historyOwnerName: string | null; historyStatus: string | null; historyStatusReason: string | null; historyRecordState: string | null;
  sources: string[] | string;
};

const opportunityColumns = `
  o.id, o.company_name AS "companyName", o.website, o.location, o.status, o.revived, o.listings_count AS "listingsCount", o.latest_title AS "latestTitle",
  o.first_seen_at AS "firstSeenAt", o.last_seen_at AS "lastSeenAt", r.value AS reason, o.reason_scope AS "reasonScope", o.reason_note AS "reasonNote",
  NULLIF(CONCAT(d.first_name, ' ', d.last_name), ' ') AS "decidedByName", o.decided_at AS "decidedAt",
  l.id AS "leadId", l.client_name AS "leadName", l.owner_id AS "leadOwnerId", NULLIF(CONCAT(lo.first_name, ' ', lo.last_name), ' ') AS "leadOwnerName",
  ls.value AS "leadStatus", lsr.value AS "leadStatusReason", l.record_state AS "leadRecordState",
  h.id AS "historyId", h.client_name AS "historyName", NULLIF(CONCAT(ho.first_name, ' ', ho.last_name), ' ') AS "historyOwnerName",
  hs.value AS "historyStatus", hsr.value AS "historyStatusReason", h.record_state AS "historyRecordState",
  (SELECT COALESCE(json_agg(DISTINCT ol.source), '[]'::json) FROM opportunity_listings ol WHERE ol.opportunity_id = o.id) AS sources`;

const opportunityJoins = `
  FROM opportunities o
  LEFT JOIN list_values r ON r.id = o.reason_id
  LEFT JOIN users d ON d.id = o.decided_by
  LEFT JOIN leads l ON l.id = o.lead_id
  LEFT JOIN users lo ON lo.id = l.owner_id
  LEFT JOIN list_values ls ON ls.id = l.status_id
  LEFT JOIN list_values lsr ON lsr.id = l.status_reason_id
  LEFT JOIN leads h ON h.id = o.matched_lead_id
  LEFT JOIN users ho ON ho.id = h.owner_id
  LEFT JOIN list_values hs ON hs.id = h.status_id
  LEFT JOIN list_values hsr ON hsr.id = h.status_reason_id`;

const sourceLabel = (source: string) => jobSourceLabels[source as JobSourceId] ?? source;

const toOpportunity = (row: OpportunityRow, listings: OpportunityListing[]): Opportunity => {
  const sources = (typeof row.sources === "string" ? (JSON.parse(row.sources) as string[]) : row.sources) ?? [];
  return {
    id: Number(row.id), companyName: row.companyName, website: row.website, location: row.location, status: row.status,
    listingsCount: Number(row.listingsCount), latestTitle: row.latestTitle, sources: sources.map(sourceLabel),
    firstSeenAt: fromSqlDateTime(row.firstSeenAt) ?? row.firstSeenAt, lastSeenAt: fromSqlDateTime(row.lastSeenAt) ?? row.lastSeenAt,
    lead: row.leadId === null ? null : {
      id: Number(row.leadId), clientName: row.leadName ?? "", ownerId: Number(row.leadOwnerId), ownerName: row.leadOwnerName ?? "",
      statusLabel: statusLabel(row.leadStatus ?? "", row.leadStatusReason), recordState: row.leadRecordState ?? "active",
    },
    history: row.historyId === null || row.historyId === row.leadId ? null : {
      id: Number(row.historyId), clientName: row.historyName ?? "", ownerName: row.historyOwnerName ?? "",
      statusLabel: statusLabel(row.historyStatus ?? "", row.historyStatusReason), recordState: row.historyRecordState ?? "active",
    },
    revived: Boolean(row.revived),
    reason: row.reason, reasonScope: row.reasonScope, reasonNote: row.reasonNote,
    decidedByName: row.decidedByName, decidedAt: fromSqlDateTime(row.decidedAt),
    listings,
  };
};

type ListingRow = { id: number; opportunityId: number; source: string; title: string; location: string; employmentType: string | null; postedAt: string | null; url: string; firstSeenAt: string; lastSeenAt: string };

async function listingsFor(ids: number[], db: Queryable): Promise<Map<number, OpportunityListing[]>> {
  const byOpportunity = new Map<number, OpportunityListing[]>();
  if (!ids.length) return byOpportunity;
  const { rows } = await db.query(
    `SELECT id, opportunity_id AS "opportunityId", source, title, location, employment_type AS "employmentType", posted_at AS "postedAt", url, first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
     FROM opportunity_listings WHERE opportunity_id = ANY(?) ORDER BY posted_at DESC NULLS LAST, last_seen_at DESC, id DESC`,
    [ids],
  );
  for (const row of rows as ListingRow[]) {
    const list = byOpportunity.get(Number(row.opportunityId)) ?? [];
    if (!byOpportunity.has(Number(row.opportunityId))) byOpportunity.set(Number(row.opportunityId), list);
    list.push({
      id: Number(row.id), source: row.source as JobSourceId, sourceLabel: sourceLabel(row.source), title: row.title, location: row.location, employmentType: row.employmentType,
      postedAt: row.postedAt ? String(row.postedAt).slice(0, 10) : null, url: row.url,
      firstSeenAt: fromSqlDateTime(row.firstSeenAt) ?? row.firstSeenAt, lastSeenAt: fromSqlDateTime(row.lastSeenAt) ?? row.lastSeenAt,
    });
  }
  return byOpportunity;
}

export async function listOpportunities(filter: { status: OpportunityStatus; page: number; pageSize: number; search?: string }, db: Queryable = getDatabasePool()): Promise<OpportunityPage> {
  const clauses = ["o.status = ?"];
  const params: unknown[] = [filter.status];
  if (filter.search) { clauses.push("(LOWER(o.company_name) LIKE ? OR LOWER(o.latest_title) LIKE ? OR LOWER(o.location) LIKE ?)"); const like = `%${filter.search.toLowerCase()}%`; params.push(like, like, like); }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const order = filter.status === "new" ? "o.last_seen_at DESC, o.listings_count DESC, o.id DESC" : "o.decided_at DESC NULLS LAST, o.last_seen_at DESC, o.id DESC";
  const { rows: countRows } = await db.query("SELECT status, COUNT(*)::int AS count FROM opportunities GROUP BY status");
  const counts: Record<OpportunityStatus, number> = { new: 0, attached: 0, converted: 0, not_relevant: 0 };
  for (const row of countRows as { status: OpportunityStatus; count: number }[]) counts[row.status] = Number(row.count);
  const { rows: totalRows } = await db.query(`SELECT COUNT(*)::int AS total FROM opportunities o ${where}`, params);
  const total = Number((totalRows as { total: number }[])[0]?.total ?? 0);
  const { rows } = await db.query(`SELECT ${opportunityColumns} ${opportunityJoins} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, filter.pageSize, (filter.page - 1) * filter.pageSize]);
  const listings = await listingsFor((rows as OpportunityRow[]).map((row) => Number(row.id)), db);
  return { opportunities: (rows as OpportunityRow[]).map((row) => toOpportunity(row, listings.get(Number(row.id)) ?? [])), total, counts };
}

export async function getOpportunity(id: number, db: Queryable = getDatabasePool()): Promise<Opportunity | null> {
  const { rows } = await db.query(`SELECT ${opportunityColumns} ${opportunityJoins} WHERE o.id = ?`, [id]);
  const row = (rows as OpportunityRow[])[0];
  if (!row) return null;
  const listings = await listingsFor([id], db);
  return toOpportunity(row, listings.get(id) ?? []);
}

export async function countNewOpportunities(db: Queryable = getDatabasePool()): Promise<number> {
  const { rows } = await db.query("SELECT COUNT(*)::int AS count FROM opportunities WHERE status = 'new'");
  return Number((rows as { count: number }[])[0]?.count ?? 0);
}

/** Hides a card with a reason; a role-level reason lets the company return with its next new role (OPP-13). */
export async function markNotRelevant(id: number, reasonId: number, note: string, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Opportunity not found.");
    if (before.status !== "new") throw new HttpError(409, `${before.companyName} is no longer in the pool (${before.status === "converted" ? "already assigned" : before.status === "attached" ? "attached to an existing lead" : "already marked not relevant"}).`);
    await assertListValue(connection, "opportunity_reason", reasonId, { required: true, label: "Reason" });
    const reason = (await getListValue(reasonId, connection))!;
    const scope = reasonScopeFor(reason.code);
    const now = toSqlDateTime(new Date());
    await connection.query(
      "UPDATE opportunities SET status = 'not_relevant', reason_id = ?, reason_scope = ?, reason_note = ?, decided_by = ?, decided_at = ?, revived = FALSE WHERE id = ? AND status = 'new'",
      [reasonId, scope, note.slice(0, 500), actor.id, now, id],
    );
    const after = (await getOpportunity(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "opportunity.not_relevant", entityType: "opportunity", entityId: id, before: { status: "new" }, after: { status: "not_relevant", reason: reason.value, scope, note: note.slice(0, 500) },
      details: `${actor.name} marked ${after.companyName} not relevant: ${reason.value}${note ? ` (${note.slice(0, 120)})` : ""}`,
    });
    return after;
  });
}

/** Puts a not-relevant card back in the pool. */
export async function restoreOpportunity(id: number, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Opportunity not found.");
    if (before.status !== "not_relevant") throw new HttpError(409, `${before.companyName} is not marked not relevant.`);
    const result = await connection.query(
      "UPDATE opportunities SET status = 'new', reason_id = NULL, reason_scope = NULL, reason_note = '', decided_by = NULL, decided_at = NULL, revived = TRUE WHERE id = ? AND status = 'not_relevant'", [id],
    );
    if (!affectedRows(result)) throw new HttpError(409, "The card changed meanwhile; reload the list.");
    const after = (await getOpportunity(id, connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "opportunity.restored", entityType: "opportunity", entityId: id, before: { status: "not_relevant", reason: before.reason }, after: { status: "new" }, details: `${actor.name} put ${after.companyName} back in the pool` });
    return after;
  });
}

/**
 * A card for a company whose earlier lead was closed (lost, disqualified) or archived: that lead is reopened for the
 * chosen owner instead of a second lead being created (decided November 6, 2026). Archived → active, a closed status
 * → Cold, a different owner → transfer; then the card becomes "assigned" to that lead.
 */
export async function reopenLeadFromOpportunity(id: number, ownerId: number, actor: UserAccount): Promise<LeadSummary> {
  const card = await getOpportunity(id);
  if (!card) throw new HttpError(404, "Opportunity not found.");
  if (card.status !== "new") throw new HttpError(409, `${card.companyName} is no longer in the pool.`);
  if (!card.history) throw new HttpError(400, "This company has no earlier lead to reopen; assign it as a new lead.");
  const lead = await getLead(card.history.id);
  if (!lead) throw new HttpError(404, "The earlier lead no longer exists.");
  const reason = "Reopened from the opportunity pool";
  if (lead.recordState === "archived") await setLeadState(lead.id, "active", reason, actor);
  if (closedStatusCodes.includes(lead.statusCode)) {
    const { rows } = await getDatabasePool().query("SELECT id FROM list_values WHERE list_key = 'status' AND code = 'cold' LIMIT 1");
    const coldId = Number((rows as { id: number }[])[0]?.id ?? 0);
    if (coldId) await updateLead(lead.id, { statusId: coldId, statusReasonId: null }, actor);
  }
  if (lead.ownerId !== ownerId) await transferLead(lead.id, ownerId, reason, actor);
  const now = new Date();
  await withTransaction(async (connection) => {
    const claimed = await claimOpportunityForLead(connection, id, { id: lead.id, clientName: lead.clientName }, actor, now);
    await addActivity(connection, {
      leadId: lead.id, userId: actor.id, type: "listing", occurredAt: now, touch: false, meta: { opportunityId: id },
      summary: `${reason}: ${claimed.listings.length} job listing${claimed.listings.length === 1 ? "" : "s"}`,
      body: claimed.listings.map((item) => `${item.title} (${item.source}) ${item.url}`).join("\n") || null,
    });
  });
  return (await getLead(lead.id))!;
}

// ---- Runs ----

type RunRow = { id: number; trigger: "scheduled" | "manual"; status: OpportunityRun["status"]; startedAt: string; finishedAt: string | null; listingsFound: number; newCompanies: number; newListings: number; attached: number; details: string; actorName: string | null };

export async function listRuns(limit = 20, db: Queryable = getDatabasePool()): Promise<OpportunityRun[]> {
  const { rows } = await db.query(
    `SELECT r.id, r.trigger_kind AS trigger, r.status, r.started_at AS "startedAt", r.finished_at AS "finishedAt", r.listings_found AS "listingsFound", r.new_companies AS "newCompanies",
       r.new_listings AS "newListings", r.attached, r.details, NULLIF(CONCAT(u.first_name, ' ', u.last_name), ' ') AS "actorName"
     FROM opportunity_runs r LEFT JOIN users u ON u.id = r.actor_id ORDER BY r.id DESC LIMIT ?`,
    [limit],
  );
  return (rows as RunRow[]).map((row) => ({
    id: Number(row.id), trigger: row.trigger, status: row.status, startedAt: fromSqlDateTime(row.startedAt) ?? row.startedAt, finishedAt: fromSqlDateTime(row.finishedAt),
    listingsFound: Number(row.listingsFound), newCompanies: Number(row.newCompanies), newListings: Number(row.newListings), attached: Number(row.attached), details: row.details, actorName: row.actorName,
  }));
}
