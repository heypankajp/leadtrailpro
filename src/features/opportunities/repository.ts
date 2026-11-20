import { getDatabasePool, affectedRows, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { jobSourceLabels, type JobSourceId } from "@/features/jobs/model";
import { listNumber, statusLabel } from "@/features/list-values/model";
import { assertListValue, getListValue } from "@/features/list-values/repository";
import { addActivity, findDuplicateLead, getLead, setLeadState, transferLead, updateLead } from "@/features/leads/repository";
import { normalizeCompanyName } from "@/features/trips/matching";
import type { LeadSummary } from "@/features/leads/model";
import type { UserAccount } from "@/features/users/model";
import { claimOpportunityForLead } from "./claim";
import { closedStatusCodes, defaultPostedWithinDays, indeedKeyword, parseTitles, reasonScopeFor, trackerCard, trackerDraft, type Opportunity, type OpportunityListing, type OpportunityPage, type OpportunityRun, type OpportunitySearch, type OpportunitySearchInput, type OpportunityStatus, type ReasonScope, type LeadEntryInput, type OpportunityOrigin } from "./model";
import { sameWebsite, websiteKey } from "@/lib/website-key";

/** Reads and the people's actions on the opportunity pool (OPP-*); the search runs live in `runner.ts`. */

// ---- Searches ----

type SearchRow = { id: number; name: string; keyword: string; titles: unknown; postedWithinDays: number; location: string; jobType: string; maxListings: number | null; active: boolean; createdById: number | null; createdByName: string | null; lastRunAt: string | null; lastFound: number; lastNew: number; createdAt: string; updatedAt: string };

const searchColumns = `
  s.id, s.name, s.keyword, s.titles, s.posted_within_days AS "postedWithinDays", s.location, s.job_type AS "jobType", s.max_listings AS "maxListings", s.is_active AS active, s.created_by AS "createdById",
  CONCAT(u.first_name, ' ', u.last_name) AS "createdByName", s.last_run_at AS "lastRunAt", s.last_found AS "lastFound", s.last_new AS "lastNew", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

/** Titles stored as JSON (migration 15); a row saved before that has only its keyword. */
const searchTitles = (row: SearchRow): string[] => { const titles = parseTitles(typeof row.titles === "string" ? (JSON.parse(row.titles) as unknown) : row.titles); return titles.length ? titles : [row.keyword]; };

const toSearch = (row: SearchRow): OpportunitySearch => ({
  id: Number(row.id), name: row.name, keyword: row.keyword, titles: searchTitles(row), postedWithinDays: Number(row.postedWithinDays) || defaultPostedWithinDays, location: row.location, jobType: row.jobType, maxListings: row.maxListings === null ? null : Number(row.maxListings),
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
      "INSERT INTO opportunity_searches (name, keyword, titles, posted_within_days, location, job_type, max_listings, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [input.name, indeedKeyword(input.titles), JSON.stringify(input.titles), input.postedWithinDays, input.location, input.jobType, input.maxListings, input.active, actor.id],
    );
    const search = (await getSearch(insertId(result), connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "opportunity_search.created", entityType: "opportunity_search", entityId: search.id, after: { ...input }, details: `${actor.name} added the search "${input.name}" (${indeedKeyword(input.titles)})` });
    return search;
  });
}

export async function updateSearch(id: number, input: OpportunitySearchInput, actor: UserAccount): Promise<OpportunitySearch> {
  return withTransaction(async (connection) => {
    const before = await getSearch(id, connection);
    if (!before) throw new HttpError(404, "Search not found.");
    await connection.query(
      "UPDATE opportunity_searches SET name = ?, keyword = ?, titles = ?, posted_within_days = ?, location = ?, job_type = ?, max_listings = ?, is_active = ? WHERE id = ?",
      [input.name, indeedKeyword(input.titles), JSON.stringify(input.titles), input.postedWithinDays, input.location, input.jobType, input.maxListings, input.active, id],
    );
    const search = (await getSearch(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "opportunity_search.updated", entityType: "opportunity_search", entityId: id,
      before: { name: before.name, titles: before.titles, keyword: before.keyword, postedWithinDays: before.postedWithinDays, location: before.location, jobType: before.jobType, maxListings: before.maxListings, active: before.active }, after: { ...input, keyword: indeedKeyword(input.titles) },
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
  draft: unknown;
  leadSourceId: number | null; leadSource: string | null; bdActionId: number | null; bdAction: string | null; clientResponseId: number | null; clientResponse: string | null;
  note: string | null; addedByName: string | null;
  archivedAt: string | null; archiveKind: "manual" | "auto" | null; archivedByName: string | null;
  todoListId: number | null; todoList: string | null; todoSince: string | null;
  organizationId: number | null; contacts: string | { id: number; name: string }[] | null;
};

const opportunityColumns = `
  o.id, o.company_name AS "companyName", o.website, o.location, o.status, o.revived, o.listings_count AS "listingsCount", o.latest_title AS "latestTitle", o.draft,
  o.first_seen_at AS "firstSeenAt", o.last_seen_at AS "lastSeenAt", r.value AS reason, o.reason_scope AS "reasonScope", o.reason_note AS "reasonNote",
  NULLIF(CONCAT(d.first_name, ' ', d.last_name), ' ') AS "decidedByName", o.decided_at AS "decidedAt",
  l.id AS "leadId", l.client_name AS "leadName", l.owner_id AS "leadOwnerId", NULLIF(CONCAT(lo.first_name, ' ', lo.last_name), ' ') AS "leadOwnerName",
  ls.value AS "leadStatus", lsr.value AS "leadStatusReason", l.record_state AS "leadRecordState",
  h.id AS "historyId", h.client_name AS "historyName", NULLIF(CONCAT(ho.first_name, ' ', ho.last_name), ' ') AS "historyOwnerName",
  hs.value AS "historyStatus", hsr.value AS "historyStatusReason", h.record_state AS "historyRecordState",
  (SELECT COALESCE(json_agg(DISTINCT ol.source), '[]'::json) FROM opportunity_listings ol WHERE ol.opportunity_id = o.id) AS sources,
  o.lead_type_id AS "leadSourceId", lsrc.value AS "leadSource", o.bd_action_id AS "bdActionId", oba.value AS "bdAction",
  o.client_response_id AS "clientResponseId", ocr.value AS "clientResponse", o.note, NULLIF(CONCAT(ab.first_name, ' ', ab.last_name), ' ') AS "addedByName", o.organization_id AS "organizationId",
  o.archived_at AS "archivedAt", o.archive_kind AS "archiveKind", NULLIF(CONCAT(arc.first_name, ' ', arc.last_name), ' ') AS "archivedByName",
  o.todo_list_id AS "todoListId", tdl.value AS "todoList", o.todo_since AS "todoSince",
  (SELECT COALESCE(json_agg(json_build_object('id', pp.id, 'name', pp.name) ORDER BY ops.position, pp.name), '[]'::json)
     FROM opportunity_persons ops JOIN persons pp ON pp.id = ops.person_id WHERE ops.opportunity_id = o.id) AS contacts`;

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
  LEFT JOIN list_values hsr ON hsr.id = h.status_reason_id
  LEFT JOIN list_values lsrc ON lsrc.id = o.lead_type_id
  LEFT JOIN list_values oba ON oba.id = o.bd_action_id
  LEFT JOIN list_values ocr ON ocr.id = o.client_response_id
  LEFT JOIN users ab ON ab.id = o.added_by
  LEFT JOIN users arc ON arc.id = o.archived_by
  LEFT JOIN list_values tdl ON tdl.id = o.todo_list_id`;

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
    archivedAt: fromSqlDateTime(row.archivedAt), archiveKind: row.archiveKind, archivedByName: row.archivedByName?.trim() || null,
    todoListId: row.todoListId === null ? null : Number(row.todoListId), todoList: row.todoList, todoSince: fromSqlDateTime(row.todoSince),
    listings,
    tracker: trackerCard(trackerDraft(row.draft)),
    leadSourceId: row.leadSourceId === null ? null : Number(row.leadSourceId), leadSource: row.leadSource,
    bdActionId: row.bdActionId === null ? null : Number(row.bdActionId), bdAction: row.bdAction,
    clientResponseId: row.clientResponseId === null ? null : Number(row.clientResponseId), clientResponse: row.clientResponse,
    note: row.note ?? "", addedByName: row.addedByName?.trim() || null,
    organizationId: row.organizationId === null ? null : Number(row.organizationId),
    contacts: ((typeof row.contacts === "string" ? JSON.parse(row.contacts) : row.contacts) ?? []).map((item: { id: number; name: string }) => ({ id: Number(item.id), name: item.name })),
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

/**
 * SQL for a lead's origin: one added by hand has `added_by`, one the tracker import drafted has `draft` (cleared when it is
 * converted, so a card with no job listings counts too); the rest the job searches found.
 */
const manualOrigin = "(o.added_by IS NOT NULL OR o.draft IS NOT NULL OR o.listings_count = 0)";
const originClause = (origin?: OpportunityOrigin) => (origin === "manual" ? manualOrigin : origin === "found" ? `NOT ${manualOrigin}` : "TRUE");

/**
 * My Leads / By Me (request of November 19, 2026): on Leads, the leads the person added; on Lead Generation, the companies
 * found by the job searches the person created.
 */
const mineClause = (origin?: OpportunityOrigin) => (origin === "found"
  ? "EXISTS (SELECT 1 FROM opportunity_listings ml JOIN opportunity_searches ms ON ms.id = ml.search_id WHERE ml.opportunity_id = o.id AND ms.created_by = ?)"
  : "o.added_by = ?");

export async function listOpportunities(filter: { status: OpportunityStatus; page: number; pageSize: number; search?: string; origin?: OpportunityOrigin; mineOf?: number | null; archived?: boolean; todoListId?: number | null; todo?: boolean }, db: Queryable = getDatabasePool()): Promise<OpportunityPage> {
  // The Archive lists archived leads whatever their status; every other list leaves them out (request of November 20, 2026).
  const scope = [originClause(filter.origin), filter.archived ? "o.archived_at IS NOT NULL" : "o.archived_at IS NULL"];
  const scopeParams: unknown[] = [];
  if (filter.mineOf) { scope.push(mineClause(filter.origin)); scopeParams.push(filter.mineOf); }
  // The To Do page's leads (request of November 20, 2026): on one list, or on any, in the inbox or not relevant.
  const onTodo = Boolean(filter.todoListId || filter.todo);
  if (filter.todoListId) { scope.push("o.todo_list_id = ?"); scopeParams.push(filter.todoListId); }
  else if (filter.todo) scope.push("o.todo_list_id IS NOT NULL");
  const clauses = filter.archived ? [...scope] : onTodo ? ["o.status IN ('new', 'not_relevant')", ...scope] : ["o.status = ?", ...scope];
  const params: unknown[] = filter.archived || onTodo ? [...scopeParams] : [filter.status, ...scopeParams];
  if (filter.search) {
    clauses.push("(LOWER(o.company_name) LIKE ? OR LOWER(o.latest_title) LIKE ? OR LOWER(o.location) LIKE ? OR LOWER(COALESCE(o.draft->'lead'->>'executive', '')) LIKE ? OR LOWER(o.note) LIKE ?)");
    const like = `%${filter.search.toLowerCase()}%`;
    params.push(like, like, like, like, like);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const order = filter.archived ? "o.archived_at DESC, o.id DESC" : onTodo ? "o.todo_since ASC NULLS LAST, o.id" : filter.status === "new" ? "o.last_seen_at DESC, o.listings_count DESC, o.id DESC" : "o.decided_at DESC NULLS LAST, o.last_seen_at DESC, o.id DESC";
  const { rows: countRows } = await db.query(`SELECT o.status, COUNT(*)::int AS count FROM opportunities o WHERE ${scope.join(" AND ")} GROUP BY o.status`, scopeParams);
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

/** The list values of a lead's fields must be of their lists. */
async function checkLeadEntry(db: Queryable, input: LeadEntryInput): Promise<void> {
  await assertListValue(db, "lead_type", input.leadSourceId, { required: true, label: "Lead source" });
  await assertListValue(db, "bd_action", input.bdActionId, { label: "BD action" });
  await assertListValue(db, "client_response", input.clientResponseId, { label: "Client response" });
  // The company record must exist and the contacts must be its own (as in Add deal: a contact belongs to a company).
  if (input.organizationId) {
    const { rows } = await db.query("SELECT name FROM organizations WHERE id = ?", [input.organizationId]);
    const organization = (rows as { name: string }[])[0];
    if (!organization) throw new HttpError(400, "That company no longer exists.");
    input.companyName = organization.name;
  }
  const personIds = input.personIds ?? [];
  if (personIds.length) {
    const { rows } = await db.query("SELECT id FROM persons WHERE id = ANY(?) AND organization_id = ?", [personIds, input.organizationId]);
    if ((rows as unknown[]).length !== personIds.length) throw new HttpError(400, "Every contact must be a contact of the company.");
  }
}

async function saveLeadContacts(db: Queryable, opportunityId: number, personIds: number[]): Promise<void> {
  await db.query("DELETE FROM opportunity_persons WHERE opportunity_id = ?", [opportunityId]);
  for (const [position, personId] of personIds.entries()) {
    await db.query("INSERT INTO opportunity_persons (opportunity_id, person_id, position) VALUES (?, ?, ?)", [opportunityId, personId, position]);
  }
}

/**
 * A lead added by hand (request of November 19, 2026): it goes to the inbox like a card the searches found. A company that is
 * already a lead in the inbox, or a live deal, is refused with its name, so it is not added twice.
 */
/**
 * A lead or a deal with the same website (request of November 19, 2026), compared without the protocol, "www." or letter
 * case. Throws 409 naming it.
 */
async function refuseSameWebsite(connection: Queryable, website: string, exceptOpportunityId: number | null): Promise<void> {
  const key = websiteKey(website);
  if (!key) return;
  const { rows: cards } = await connection.query("SELECT id, company_name AS \"companyName\", website, status FROM opportunities WHERE website <> '' AND id <> ?", [exceptOpportunityId ?? 0]);
  const card = (cards as { id: number; companyName: string; website: string; status: OpportunityStatus }[]).find((row) => sameWebsite(row.website, website));
  if (card) throw new HttpError(409, `${card.companyName} is already a lead with the website ${key} (${card.status === "new" ? "in the inbox" : card.status === "not_relevant" ? "marked not relevant" : "converted to a deal"}).`);
  const { rows: deals } = await connection.query(
    "SELECT l.client_name AS \"clientName\", l.company_url AS \"companyUrl\", st.code AS \"statusCode\", st.value AS status, l.record_state AS \"recordState\", CONCAT(u.first_name, ' ', u.last_name) AS \"ownerName\" FROM leads l JOIN list_values st ON st.id = l.status_id JOIN users u ON u.id = l.owner_id WHERE l.company_url <> ''",
  );
  const deal = (deals as { clientName: string; companyUrl: string; statusCode: string; status: string; recordState: string; ownerName: string }[]).find((row) => sameWebsite(row.companyUrl, website));
  if (deal) throw new HttpError(409, `${deal.clientName} already exists as ${dealWhere(deal)} with the website ${key}.`);
}

/** How a matching deal is named in the refusal: client or deal, its status and owner, and whether it is archived or queued. */
const dealWhere = (deal: { statusCode: string; status: string; recordState: string; ownerName: string }) =>
  `${deal.recordState === "archived" ? "an archived " : deal.recordState === "queued" ? "a queued " : "a "}${deal.statusCode === "client" ? "client" : `${deal.status} deal`} (owner ${deal.ownerName})`;

/**
 * A deal for the same company (request of November 20, 2026), archived and queued ones included: the same name, website, phone or
 * address, as Add Deal compares them. A lead is not added for a company that is already a deal or a client.
 */
async function refuseExistingDeal(connection: Queryable, input: { companyName: string; website: string; location: string }, exceptLeadId: number | null = null): Promise<void> {
  const match = await findDuplicateLead({ clientName: input.companyName, companyUrl: input.website, contactPhone: "", contactAltPhone: "", address: input.location, clientEmails: [] }, connection, exceptLeadId);
  if (!match || match.matchedOn === "similar_name_address") return;
  const found = match.lead;
  throw new HttpError(409, `${found.clientName} already exists as ${dealWhere({ statusCode: found.statusCode, status: found.status, recordState: found.recordState, ownerName: found.ownerName })}. Open it from the Pipeline${found.recordState === "archived" ? "'s Archive" : ""} instead of adding a lead.`, {
    code: "deal_exists", deal: { leadId: found.id, clientName: found.clientName, recordState: found.recordState, ownerName: found.ownerName },
  });
}

export async function createManualOpportunity(input: LeadEntryInput, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    await checkLeadEntry(connection, input);
    // A deal or client for the same company comes first: it names the deal, archived ones too (request of November 20, 2026).
    await refuseExistingDeal(connection, input);
    const key = normalizeCompanyName(input.companyName);
    // A company picked from Contacts that already has a live deal is that deal's: the check below names it.
    if (!key) throw new HttpError(400, "Enter the company's name.");
    const { rows: existing } = await connection.query("SELECT id, company_name AS \"companyName\", status FROM opportunities WHERE company_key = ?", [key]);
    const same = (existing as { id: number; companyName: string; status: OpportunityStatus }[])[0];
    if (same) throw new HttpError(409, `${same.companyName} is already a lead (${same.status === "new" ? "in the inbox" : same.status === "not_relevant" ? "marked not relevant" : "converted to a deal"}).`);
    await refuseSameWebsite(connection, input.website, null);
    const now = toSqlDateTime(new Date());
    const result = await connection.query(
      `INSERT INTO opportunities (company_key, company_name, website, location, status, revived, listings_count, latest_title, first_seen_at, last_seen_at, lead_type_id, bd_action_id, client_response_id, note, added_by, organization_id)
       VALUES (?, ?, ?, ?, 'new', FALSE, 0, '', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [key, input.companyName, input.website, input.location, now, now, input.leadSourceId, input.bdActionId, input.clientResponseId, input.note, actor.id, input.organizationId ?? null],
    );
    const id = insertId(result);
    await saveLeadContacts(connection, id, input.personIds ?? []);
    const created = (await getOpportunity(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "opportunity.created", entityType: "opportunity", entityId: id, after: { companyName: created.companyName, leadSource: created.leadSource, bdAction: created.bdAction, clientResponse: created.clientResponse },
      details: `${actor.name} added the lead ${created.companyName} by hand`,
    });
    return created;
  });
}

/** Changes a lead's fields (name, website, location, Lead Source, BD action, Client response, note) while it is in the inbox or not relevant. */
export async function updateOpportunityDetails(id: number, input: LeadEntryInput, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Lead not found.");
    if (before.status !== "new" && before.status !== "not_relevant") throw new HttpError(409, `${before.companyName} is already a deal: change it on the deal.`);
    await checkLeadEntry(connection, input);
    if (websiteKey(input.website) !== websiteKey(before.website)) await refuseSameWebsite(connection, input.website, id);
    // A renamed lead may now name a company that is already a deal (request of November 20, 2026).
    if (normalizeCompanyName(input.companyName) !== normalizeCompanyName(before.companyName) || websiteKey(input.website) !== websiteKey(before.website)) await refuseExistingDeal(connection, input, before.lead?.id ?? null);
    await connection.query(
      "UPDATE opportunities SET company_name = ?, website = ?, location = ?, lead_type_id = ?, bd_action_id = ?, client_response_id = ?, note = ?, organization_id = ? WHERE id = ?",
      [input.companyName, input.website, input.location, input.leadSourceId, input.bdActionId, input.clientResponseId, input.note, input.organizationId ?? null, id],
    );
    await saveLeadContacts(connection, id, input.personIds ?? []);
    const after = (await getOpportunity(id, connection))!;
    const fields = ["companyName", "website", "location", "leadSource", "bdAction", "clientResponse", "note"] as const;
    const changed: string[] = fields.filter((field) => before[field] !== after[field]);
    const names = (item: Opportunity) => item.contacts.map((contact) => contact.name).join(", ");
    if (names(before) !== names(after)) changed.push("contacts");
    const valueOf = (item: Opportunity, field: string) => (field === "contacts" ? names(item) : item[field as (typeof fields)[number]]);
    if (changed.length) {
      await recordAudit(connection, {
        actorId: actor.id, action: "opportunity.updated", entityType: "opportunity", entityId: id,
        before: Object.fromEntries(changed.map((field) => [field, valueOf(before, field)])), after: Object.fromEntries(changed.map((field) => [field, valueOf(after, field)])),
        details: `${actor.name} changed the lead ${after.companyName}: ${changed.join(", ")}`,
      });
    }
    return after;
  });
}

export async function countNewOpportunities(db: Queryable = getDatabasePool()): Promise<number> {
  const { rows } = await db.query("SELECT COUNT(*)::int AS count FROM opportunities WHERE status = 'new' AND archived_at IS NULL");
  return Number((rows as { count: number }[])[0]?.count ?? 0);
}

/** Hides a card with a reason; a role-level reason lets the company return with its next new role (OPP-13). */
/** Archive by hand (request of November 20, 2026): a lead in the inbox or marked not relevant moves to the Archive. */
export async function archiveOpportunity(id: number, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Lead not found.");
    if (before.archivedAt) throw new HttpError(409, `${before.companyName} is already in the Archive.`);
    if (before.status !== "new" && before.status !== "not_relevant") throw new HttpError(409, `${before.companyName} is already a deal: archive it from the Pipeline.`);
    await connection.query("UPDATE opportunities SET archived_at = ?, archived_by = ?, archive_kind = 'manual' WHERE id = ? AND archived_at IS NULL", [toSqlDateTime(new Date()), actor.id, id]);
    await recordAudit(connection, { actorId: actor.id, action: "opportunity.archived", entityType: "opportunity", entityId: id, before: { status: before.status }, after: { archived: true }, details: `${actor.name} moved the lead ${before.companyName} to the Archive` });
    return (await getOpportunity(id, connection))!;
  });
}

/**
 * Restore from the Archive: the lead goes back to the inbox (a lead restored as not relevant would be archived again by the
 * days rule), its not-relevant reason cleared.
 */
export async function unarchiveOpportunity(id: number, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Lead not found.");
    if (!before.archivedAt) throw new HttpError(409, `${before.companyName} is not in the Archive.`);
    await connection.query(
      `UPDATE opportunities SET archived_at = NULL, archived_by = NULL, archive_kind = NULL, revived = FALSE,
         status = CASE WHEN status = 'not_relevant' THEN 'new' ELSE status END,
         reason_id = NULL, reason_scope = NULL, reason_note = '', decided_by = CASE WHEN status = 'not_relevant' THEN NULL ELSE decided_by END,
         decided_at = CASE WHEN status = 'not_relevant' THEN NULL ELSE decided_at END
       WHERE id = ?`, [id],
    );
    await recordAudit(connection, { actorId: actor.id, action: "opportunity.unarchived", entityType: "opportunity", entityId: id, before: { archived: true, status: before.status }, after: { archived: false }, details: `${actor.name} restored the lead ${before.companyName} from the Archive` });
    return (await getOpportunity(id, connection))!;
  });
}

/**
 * The scheduler's sweep (request of November 20, 2026): leads marked not relevant longer ago than the days in List of Values
 * (Archive Not Relevant Leads After, 90 to start) move to the Archive.
 */
export async function archiveStaleLeads(now = new Date(), db: Queryable = getDatabasePool()): Promise<{ archived: number; days: number }> {
  const { rows: setting } = await db.query("SELECT value, is_active AS active FROM list_values WHERE list_key = 'lead_archive_days' ORDER BY sort_order, id");
  const days = listNumber("lead_archive_days", setting as { value: string; active: boolean }[]);
  const cutoff = toSqlDateTime(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
  const result = await db.query(
    "UPDATE opportunities SET archived_at = ?, archived_by = NULL, archive_kind = 'auto' WHERE status = 'not_relevant' AND archived_at IS NULL AND decided_at IS NOT NULL AND decided_at < ?",
    [toSqlDateTime(now), cutoff],
  );
  const archived = result.rowCount ?? 0;
  if (archived > 0) await recordAudit(db, { actorId: null, action: "opportunity.auto_archived", entityType: "opportunity", after: { archived, days }, details: `${archived} ${archived === 1 ? "lead" : "leads"} not relevant for over ${days} days moved to the Archive` });
  return { archived, days };
}

/** Puts a lead on a To Do list, moves it to another, or takes it off (request of November 20, 2026): `listId` null to take it off. */
export async function setOpportunityTodo(id: number, listId: number | null, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Lead not found.");
    if (before.status !== "new" && before.status !== "not_relevant") throw new HttpError(409, `${before.companyName} is already a deal: put the deal on a To Do list.`);
    if (listId !== null) await assertListValue(connection, "todo_list", listId, { required: true, label: "To Do list" });
    if (listId === before.todoListId) return before;
    await connection.query("UPDATE opportunities SET todo_list_id = ?, todo_since = ? WHERE id = ?", [listId, listId === null ? null : toSqlDateTime(new Date()), id]);
    const after = (await getOpportunity(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "opportunity.todo", entityType: "opportunity", entityId: id, before: { todoList: before.todoList }, after: { todoList: after.todoList },
      details: `${actor.name}: ${after.todoList ? `${after.companyName} put on To Do: ${after.todoList}` : `${after.companyName} taken off To Do${before.todoList ? `: ${before.todoList}` : ""}`}`,
    });
    return after;
  });
}

/** How many leads are on each To Do list (request of November 20, 2026): the caller's own (added by them) and everyone's. */
export async function leadTodoCounts(viewer: UserAccount, db: Queryable = getDatabasePool()) {
  const { rows } = await db.query(
    `SELECT o.todo_list_id AS "listId", COUNT(*)::int AS everyone, COUNT(*) FILTER (WHERE o.added_by = ?)::int AS mine
     FROM opportunities o WHERE o.todo_list_id IS NOT NULL AND o.archived_at IS NULL AND o.status IN ('new', 'not_relevant') GROUP BY o.todo_list_id`,
    [viewer.id],
  );
  const lists = (rows as { listId: number; everyone: number; mine: number }[]).map((row) => ({ listId: Number(row.listId), mine: Number(row.mine), everyone: Number(row.everyone) }));
  return { lists, mine: lists.reduce((sum, list) => sum + list.mine, 0), everyone: lists.reduce((sum, list) => sum + list.everyone, 0) };
}

export async function markNotRelevant(id: number, reasonId: number, note: string, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Lead not found.");
    if (before.status !== "new") throw new HttpError(409, `${before.companyName} is no longer in the inbox (${before.status === "converted" ? "already assigned" : before.status === "attached" ? "attached to an existing deal" : "already marked not relevant"}).`);
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

/** Puts a not-relevant card back in the inbox. */
export async function restoreOpportunity(id: number, actor: UserAccount): Promise<Opportunity> {
  return withTransaction(async (connection) => {
    const before = await getOpportunity(id, connection);
    if (!before) throw new HttpError(404, "Lead not found.");
    if (before.status !== "not_relevant") throw new HttpError(409, `${before.companyName} is not marked not relevant.`);
    const result = await connection.query(
      "UPDATE opportunities SET status = 'new', reason_id = NULL, reason_scope = NULL, reason_note = '', decided_by = NULL, decided_at = NULL, revived = TRUE WHERE id = ? AND status = 'not_relevant'", [id],
    );
    if (!affectedRows(result)) throw new HttpError(409, "The card changed meanwhile; reload the list.");
    const after = (await getOpportunity(id, connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "opportunity.restored", entityType: "opportunity", entityId: id, before: { status: "not_relevant", reason: before.reason }, after: { status: "new" }, details: `${actor.name} put ${after.companyName} back in the inbox` });
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
  if (!card) throw new HttpError(404, "Lead not found.");
  if (card.status !== "new") throw new HttpError(409, `${card.companyName} is no longer in the inbox.`);
  if (!card.history) throw new HttpError(400, "This company has no earlier deal to reopen; assign it as a new deal.");
  const lead = await getLead(card.history.id);
  if (!lead) throw new HttpError(404, "The earlier deal no longer exists.");
  const reason = "Reopened from the leads inbox";
  if (lead.recordState === "archived") await setLeadState(lead.id, "active", reason, actor);
  if (closedStatusCodes.includes(lead.statusCode)) {
    const { rows } = await getDatabasePool().query("SELECT id FROM list_values WHERE list_key = 'status' AND code = 'cold' LIMIT 1");
    const coldId = Number((rows as { id: number }[])[0]?.id ?? 0);
    if (coldId) await updateLead(lead.id, { statusId: coldId, statusReasonId: null }, actor);
  }
  if (lead.ownerId !== ownerId) await transferLead(lead.id, ownerId, reason, actor);
  const now = new Date();
  await withTransaction(async (connection) => {
    const claimed = await claimOpportunityForLead(connection, id, { id: lead.id, clientName: lead.clientName, ownerId }, actor, now);
    await addActivity(connection, {
      leadId: lead.id, userId: actor.id, type: "listing", occurredAt: now, touch: false, meta: { opportunityId: id },
      summary: `${reason}: ${claimed.listings.length} job listing${claimed.listings.length === 1 ? "" : "s"}${claimed.trackerEntries ? `, ${claimed.trackerEntries} timeline entr${claimed.trackerEntries === 1 ? "y" : "ies"} from the sales tracker` : ""}`,
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
