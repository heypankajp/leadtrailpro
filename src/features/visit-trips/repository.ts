import { fromSqlDateTime, getDatabasePool, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { addActivity, selectLeads, setLeadState } from "@/features/leads/repository";
import type { LeadSummary } from "@/features/leads/model";
import { hasPrivilege, type UserAccount } from "@/features/users/model";
import { recentTripsLimit, type TripDeleteChoice, type VisitTrip, type VisitTripFilters, type VisitTripInput, type VisitTripPage } from "./model";

type TripRow = Omit<VisitTrip, "companies" | "dealCount" | "kind" | "address"> & { kind?: VisitTrip["kind"]; address?: string | null; dealCount: number | string; companies: string[] | null };

const tripSelect = `
  SELECT 'visit' AS kind, '' AS address, t.id, t.title, TO_CHAR(t.trip_date, 'YYYY-MM-DD') AS "tripDate", t.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName",
    t.created_by AS "createdById", CONCAT(c.first_name, ' ', c.last_name) AS "createdByName", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
    (SELECT COUNT(*) FROM visit_trip_deals d JOIN leads l ON l.id = d.lead_id WHERE d.trip_id = t.id AND l.record_state = 'active') AS "dealCount",
    ARRAY(SELECT l.client_name FROM visit_trip_deals d JOIN leads l ON l.id = d.lead_id WHERE d.trip_id = t.id AND l.record_state = 'active' ORDER BY d.sort_order, d.added_at) AS companies
  FROM visit_trips t
  JOIN users o ON o.id = t.owner_id
  JOIN users c ON c.id = t.created_by
`;

const toTrip = (row: TripRow): VisitTrip => ({
  ...row,
  kind: row.kind === "planner" ? "planner" : "visit",
  address: row.address ?? "",
  id: Number(row.id),
  ownerId: Number(row.ownerId),
  createdById: Number(row.createdById),
  dealCount: Number(row.dealCount),
  companies: row.companies ?? [],
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  updatedAt: fromSqlDateTime(row.updatedAt) ?? row.updatedAt,
});

const likePattern = (term: string) => `%${term.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** Who may change a trip: its owner, whoever created it, and the people who may reassign any deal (managers, admins). */
export function canManageTrip(user: UserAccount, trip: Pick<VisitTrip, "ownerId" | "createdById">): boolean {
  return trip.ownerId === user.id || trip.createdById === user.id || hasPrivilege(user, "reassign_leads");
}

/** The number of trips "Recent Planned Trips" shows: List of values → Recent Planned Trips (how many), 30 by default. */
export async function configuredRecentTrips(db: Queryable = getDatabasePool()): Promise<number> {
  const { rows } = await db.query("SELECT value FROM list_values WHERE list_key = 'recent_trips_limit' AND is_active = TRUE ORDER BY sort_order, id LIMIT 1");
  return recentTripsLimit((rows as { value: string }[])[0]?.value);
}

/**
 * Sales Trips (review of November 18, 2026): the trips planned for To Do deals together with the trips made in the Sales
 * Trip Planner. A planner trip's date is the first planned visit among its companies, or the day it was planned; its
 * companies are its shortlist, or every company found. Planner trips follow the planner's own rule: everyone sees
 * their own, people with team reports see everyone's.
 * Filters: owner, a date or a period, and a keyword (the title; a deal's organization, contact, city or address; a
 * planner trip's address or one of its companies). `recent` lists the most recently planned trips, up to the number
 * configured in List of values, instead of upcoming trips first.
 */
export async function listVisitTrips(filters: VisitTripFilters, viewer: UserAccount): Promise<VisitTripPage> {
  const visitClauses: string[] = [];
  const visitParams: unknown[] = [];
  const plannerClauses: string[] = [];
  const plannerParams: unknown[] = [];
  if (!hasPrivilege(viewer, "view_team_reports")) { plannerClauses.push("s.owner_id = ?"); plannerParams.push(viewer.id); }
  if (filters.q) {
    const pattern = likePattern(filters.q);
    const dealFields = ["l.client_name", "l.client_executive", "ci.value", "l.address", "o.name", "p.name"];
    visitClauses.push(`(LOWER(t.title) LIKE ? OR EXISTS (
      SELECT 1 FROM visit_trip_deals d JOIN leads l ON l.id = d.lead_id
        LEFT JOIN list_values ci ON ci.id = l.city_id
        LEFT JOIN organizations o ON o.id = l.organization_id
        LEFT JOIN persons p ON p.organization_id = l.organization_id
      WHERE d.trip_id = t.id AND (${dealFields.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ?`).join(" OR ")})))`);
    visitParams.push(pattern, ...dealFields.map(() => pattern));
    plannerClauses.push("(LOWER(s.title) LIKE ? OR LOWER(s.address) LIKE ? OR EXISTS (SELECT 1 FROM sales_trip_results r WHERE r.trip_id = s.id AND (LOWER(r.company_name) LIKE ? OR LOWER(r.address) LIKE ?)))");
    plannerParams.push(pattern, pattern, pattern, pattern);
  }
  const outerClauses: string[] = [];
  const outerParams: unknown[] = [];
  if (filters.ownerId) { outerClauses.push("u.owner_id = ?"); outerParams.push(filters.ownerId); }
  if (filters.date) { outerClauses.push("u.trip_date = ?::date"); outerParams.push(filters.date); }
  if (filters.from) { outerClauses.push("u.trip_date >= ?::date"); outerParams.push(filters.from); }
  if (filters.to) { outerClauses.push("u.trip_date <= ?::date"); outerParams.push(filters.to); }
  const where = (clauses: string[]) => (clauses.length ? clauses.join(" AND ") : "TRUE");
  const union = `
    SELECT 'visit' AS kind, t.id, t.title, t.trip_date, t.owner_id, t.created_by, t.created_at, t.updated_at, '' AS address,
      (SELECT COUNT(*) FROM visit_trip_deals d JOIN leads l ON l.id = d.lead_id WHERE d.trip_id = t.id AND l.record_state = 'active') AS deal_count,
      ARRAY(SELECT l.client_name FROM visit_trip_deals d JOIN leads l ON l.id = d.lead_id WHERE d.trip_id = t.id AND l.record_state = 'active' ORDER BY d.sort_order, d.added_at) AS companies
    FROM visit_trips t WHERE ${where(visitClauses)}
    UNION ALL
    SELECT 'planner' AS kind, s.id, s.title,
      COALESCE((SELECT MIN(r.planned_visit_date) FROM sales_trip_results r WHERE r.trip_id = s.id), s.created_at::date) AS trip_date,
      s.owner_id, s.owner_id AS created_by, s.created_at, s.updated_at, s.address,
      (SELECT COUNT(*) FROM sales_trip_results r WHERE r.trip_id = s.id
         AND (r.shortlisted OR NOT EXISTS (SELECT 1 FROM sales_trip_results x WHERE x.trip_id = s.id AND x.shortlisted))) AS deal_count,
      ARRAY(SELECT r.company_name FROM sales_trip_results r WHERE r.trip_id = s.id
              AND (r.shortlisted OR NOT EXISTS (SELECT 1 FROM sales_trip_results x WHERE x.trip_id = s.id AND x.shortlisted))
            ORDER BY r.sequence, r.id) AS companies
    FROM sales_trips s WHERE ${where(plannerClauses)}`;
  const params = [...visitParams, ...plannerParams, ...outerParams];
  const select = `
    SELECT u.kind, u.id, u.title, TO_CHAR(u.trip_date, 'YYYY-MM-DD') AS "tripDate", u.owner_id AS "ownerId", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName",
      u.created_by AS "createdById", CONCAT(c.first_name, ' ', c.last_name) AS "createdByName", u.created_at AS "createdAt", u.updated_at AS "updatedAt",
      u.address, u.deal_count AS "dealCount", u.companies
    FROM (${union}) u JOIN users o ON o.id = u.owner_id JOIN users c ON c.id = u.created_by
    WHERE ${where(outerClauses)}`;
  const db = getDatabasePool();
  const offset = (filters.page - 1) * filters.pageSize;
  if (filters.recent) {
    // The most recently planned trips, at most the configured number, a page at a time.
    const limit = await configuredRecentTrips(db);
    const take = Math.max(0, Math.min(filters.pageSize, limit - offset));
    const [{ rows: countRows }, { rows }] = await Promise.all([
      db.query(`SELECT COUNT(*) AS total FROM (${select}) counted`, params),
      take ? db.query(`${select} ORDER BY u.created_at DESC, u.id DESC LIMIT ${take} OFFSET ${offset}`, params) : Promise.resolve({ rows: [], rowCount: 0 }),
    ]);
    const total = Math.min(Number((countRows as { total: number }[])[0].total), limit);
    return { trips: (rows as TripRow[]).map(toTrip), total, page: filters.page, pageSize: filters.pageSize };
  }
  // Upcoming trips first (soonest on top), then the past ones, most recent first.
  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM (${select}) counted`, params),
    db.query(
      `${select}
       ORDER BY (u.trip_date < CURRENT_DATE), CASE WHEN u.trip_date >= CURRENT_DATE THEN u.trip_date END ASC, u.trip_date DESC, u.created_at DESC, u.id DESC
       LIMIT ${filters.pageSize} OFFSET ${offset}`,
      params,
    ),
  ]);
  return { trips: (rows as TripRow[]).map(toTrip), total: Number((countRows as { total: number }[])[0].total), page: filters.page, pageSize: filters.pageSize };
}

export async function getVisitTrip(id: number, db: Queryable = getDatabasePool()): Promise<VisitTrip | null> {
  const { rows } = await db.query(`${tripSelect} WHERE t.id = ? LIMIT 1`, [id]);
  const row = (rows as TripRow[])[0];
  return row ? toTrip(row) : null;
}

/** The deals on a trip in visiting order (archived ones are left out). */
export async function visitTripDeals(id: number, db: Queryable = getDatabasePool()): Promise<LeadSummary[]> {
  return selectLeads(
    "l.record_state = 'active' AND l.id IN (SELECT lead_id FROM visit_trip_deals WHERE trip_id = ?)",
    [id, id],
    "(SELECT d.sort_order FROM visit_trip_deals d WHERE d.trip_id = ? AND d.lead_id = l.id), l.client_name",
    200,
    db,
  );
}

async function requireOwner(db: Queryable, ownerId: number): Promise<void> {
  const { rows } = await db.query("SELECT 1 FROM users WHERE id = ? AND is_active = TRUE AND role <> 'recruiter'", [ownerId]);
  if (!rows.length) throw new HttpError(400, "Choose an active salesperson for the trip.");
}

async function requireManageable(db: Queryable, id: number, actor: UserAccount): Promise<VisitTrip> {
  const trip = await getVisitTrip(id, db);
  if (!trip) throw new HttpError(404, "Sales trip not found.");
  if (!canManageTrip(actor, trip)) throw new HttpError(403, "Only the trip's owner, its creator or a manager can change this sales trip.");
  return trip;
}

/** The "To be visited" To Do list, which trips are planned from; null if an administrator removed it. */
async function toBeVisitedList(db: Queryable): Promise<{ id: number; value: string } | null> {
  const { rows } = await db.query("SELECT id, value FROM list_values WHERE list_key = 'todo_list' AND code = 'to_be_visited' LIMIT 1");
  const row = (rows as { id: number; value: string }[])[0];
  return row ? { id: Number(row.id), value: row.value } : null;
}

/**
 * Review of November 18, 2026: a deal moved onto a sales trip leaves the "To be visited" list (it is planned now). The
 * trip remembers the list each deal was on, so a deal taken off the trip, or a deleted trip's deals when the user asks
 * for it, go back to that list. Each move is written on the deal's timeline like a move made by hand.
 */
async function moveOffToBeVisited(db: Queryable, leadIds: number[], trip: { title: string; tripDate: string }, actor: UserAccount, now: Date): Promise<void> {
  const list = await toBeVisitedList(db);
  if (!list || !leadIds.length) return;
  const { rows } = await db.query("UPDATE leads SET todo_list_id = NULL, todo_since = NULL WHERE id = ANY(?::int[]) AND todo_list_id = ? RETURNING id", [leadIds, list.id]);
  for (const row of rows as { id: number }[]) {
    await addActivity(db, { leadId: Number(row.id), userId: actor.id, type: "todo", summary: `To Do: removed from ${list.value}, now on the sales trip ${trip.title} (${trip.tripDate})`, meta: { fromListId: list.id, toListId: null }, occurredAt: now });
  }
}

type TripDealOrigin = { leadId: number; listId: number | null };

/**
 * Puts deals back on the To Do list they came from. A deal that came from no list, that has been put on another list
 * since, that is no longer active, or that is still on another sales trip, is left as it is.
 */
async function moveBackToTodo(db: Queryable, origins: TripDealOrigin[], trip: { title: string }, actor: UserAccount, now: Date): Promise<number> {
  let moved = 0;
  for (const { leadId, listId } of origins) {
    if (!listId) continue;
    const { rows } = await db.query(
      `UPDATE leads l SET todo_list_id = ?, todo_since = ? FROM list_values v
       WHERE l.id = ? AND v.id = ? AND l.todo_list_id IS NULL AND l.record_state = 'active'
         AND NOT EXISTS (SELECT 1 FROM visit_trip_deals d WHERE d.lead_id = l.id)
       RETURNING v.value AS list`,
      [listId, toSqlDateTime(now), leadId, listId],
    );
    const row = (rows as { list: string }[])[0];
    if (!row) continue;
    await addActivity(db, { leadId, userId: actor.id, type: "todo", summary: `To Do: back on ${row.list}, off the sales trip ${trip.title}`, meta: { fromListId: null, toListId: listId }, occurredAt: now });
    moved += 1;
  }
  return moved;
}

async function tripOrigins(db: Queryable, tripId: number, leadId?: number): Promise<TripDealOrigin[]> {
  const { rows } = await db.query(
    `SELECT lead_id AS "leadId", from_todo_list_id AS "listId" FROM visit_trip_deals WHERE trip_id = ?${leadId ? " AND lead_id = ?" : ""} ORDER BY sort_order`,
    leadId ? [tripId, leadId] : [tripId],
  );
  return (rows as { leadId: number; listId: number | null }[]).map((row) => ({ leadId: Number(row.leadId), listId: row.listId === null ? null : Number(row.listId) }));
}

/** Adds deals to the end of the trip; deals already on it, and deals that are not active, are skipped. Returns how many were added. */
async function addDeals(db: Queryable, tripId: number, leadIds: number[], actor: UserAccount, now: Date): Promise<number> {
  if (!leadIds.length) return 0;
  const { rows: active } = await db.query("SELECT id FROM leads WHERE id = ANY(?::int[]) AND record_state = 'active'", [leadIds]);
  const allowed = new Set((active as { id: number }[]).map((row) => Number(row.id)));
  const { rows: [{ last }] } = await db.query("SELECT COALESCE(MAX(sort_order), 0) AS last FROM visit_trip_deals WHERE trip_id = ?", [tripId]);
  let order = Number(last);
  const added: number[] = [];
  for (const leadId of leadIds) {
    if (!allowed.has(leadId)) continue;
    // The To Do list the deal is on now is kept with it: deleting the trip can send it back there.
    const result = await db.query(
      `INSERT INTO visit_trip_deals (trip_id, lead_id, sort_order, added_by, added_at, from_todo_list_id)
       VALUES (?, ?, ?, ?, ?, (SELECT todo_list_id FROM leads WHERE id = ?)) ON CONFLICT DO NOTHING`,
      [tripId, leadId, order + 1, actor.id, toSqlDateTime(now), leadId],
    );
    if (result.rowCount) { order += 1; added.push(leadId); }
  }
  if (added.length) {
    await db.query("UPDATE visit_trips SET updated_at = ? WHERE id = ?", [toSqlDateTime(now), tripId]);
    const { rows: [trip] } = await db.query(`SELECT title, TO_CHAR(trip_date, 'YYYY-MM-DD') AS "tripDate" FROM visit_trips WHERE id = ?`, [tripId]);
    await moveOffToBeVisited(db, added, trip as { title: string; tripDate: string }, actor, now);
  }
  return added.length;
}

export async function createVisitTrip(input: VisitTripInput, leadIds: number[], actor: UserAccount): Promise<VisitTrip> {
  return withTransaction(async (db) => {
    // Managers plan trips for others; everyone else plans their own.
    const ownerId = input.ownerId && hasPrivilege(actor, "reassign_leads") ? input.ownerId : actor.id;
    await requireOwner(db, ownerId);
    const now = new Date();
    const { rows: [created] } = await db.query(
      "INSERT INTO visit_trips (title, trip_date, owner_id, created_by, created_at, updated_at) VALUES (?, ?::date, ?, ?, ?, ?) RETURNING id",
      [input.title, input.tripDate, ownerId, actor.id, toSqlDateTime(now), toSqlDateTime(now)],
    );
    const id = Number(created.id);
    const added = await addDeals(db, id, leadIds, actor, now);
    await recordAudit(db, {
      actorId: actor.id, action: "visit_trip.created", entityType: "visit_trip", entityId: id,
      after: { title: input.title, tripDate: input.tripDate, ownerId, deals: added },
      details: `${actor.name} planned the sales trip ${input.title} on ${input.tripDate}${added ? ` with ${added} ${added === 1 ? "deal" : "deals"}` : ""}`,
    }, now);
    return (await getVisitTrip(id, db))!;
  });
}

export async function updateVisitTrip(id: number, input: Partial<VisitTripInput>, actor: UserAccount): Promise<VisitTrip> {
  return withTransaction(async (db) => {
    const before = await requireManageable(db, id, actor);
    const next = { title: input.title ?? before.title, tripDate: input.tripDate ?? before.tripDate, ownerId: before.ownerId };
    if (input.ownerId && input.ownerId !== before.ownerId) {
      if (!hasPrivilege(actor, "reassign_leads")) throw new HttpError(403, "Only a manager can give the trip to someone else.");
      await requireOwner(db, input.ownerId);
      next.ownerId = input.ownerId;
    }
    const now = new Date();
    await db.query("UPDATE visit_trips SET title = ?, trip_date = ?::date, owner_id = ?, updated_at = ? WHERE id = ?", [next.title, next.tripDate, next.ownerId, toSqlDateTime(now), id]);
    await recordAudit(db, {
      actorId: actor.id, action: "visit_trip.updated", entityType: "visit_trip", entityId: id,
      before: { title: before.title, tripDate: before.tripDate, ownerId: before.ownerId }, after: next, details: `${actor.name} edited the sales trip ${next.title}`,
    }, now);
    return (await getVisitTrip(id, db))!;
  });
}

/**
 * Deletes a trip and does with its active deals what the user chose (review of November 18, 2026): back on the To Do
 * list each came from, in the Pipeline only, or archived with the Archival reason and notes given. Returns how many
 * deals were moved back or archived.
 */
export async function deleteVisitTrip(id: number, choice: TripDeleteChoice, actor: UserAccount): Promise<{ changed: number }> {
  return withTransaction(async (db) => {
    const trip = await requireManageable(db, id, actor);
    if (choice.deals === "archive" && !hasPrivilege(actor, "archive_leads")) throw new HttpError(403, "You do not have permission to archive deals.");
    const origins = await tripOrigins(db, id);
    const now = new Date();
    await db.query("DELETE FROM visit_trips WHERE id = ?", [id]);
    let changed = 0;
    if (choice.deals === "todo") changed = await moveBackToTodo(db, origins, trip, actor, now);
    if (choice.deals === "archive") {
      const { rows } = await db.query("SELECT id FROM leads WHERE id = ANY(?::int[]) AND record_state = 'active'", [origins.map((origin) => origin.leadId)]);
      for (const row of rows as { id: number }[]) {
        await setLeadState(Number(row.id), "archived", choice.notes, actor, db, choice.archiveReasonId);
        changed += 1;
      }
    }
    const outcome = { todo: "its deals back on their To Do lists", pipeline: "its deals kept in the Pipeline", archive: "its deals archived" }[choice.deals];
    await recordAudit(db, {
      actorId: actor.id, action: "visit_trip.deleted", entityType: "visit_trip", entityId: id,
      before: { title: trip.title, tripDate: trip.tripDate, ownerId: trip.ownerId, companies: trip.companies },
      after: { deals: choice.deals, changed, ...(choice.deals === "archive" ? { archiveReasonId: choice.archiveReasonId, notes: choice.notes } : {}) },
      details: `${actor.name} deleted the sales trip ${trip.title}, ${outcome}`,
    }, now);
    return { changed };
  });
}

export async function addVisitTripDeals(id: number, leadIds: number[], actor: UserAccount): Promise<{ trip: VisitTrip; added: number }> {
  return withTransaction(async (db) => {
    const trip = await requireManageable(db, id, actor);
    const now = new Date();
    const added = await addDeals(db, id, leadIds, actor, now);
    if (added) {
      await recordAudit(db, {
        actorId: actor.id, action: "visit_trip.deals_added", entityType: "visit_trip", entityId: id,
        after: { leadIds }, details: `${actor.name} added ${added} ${added === 1 ? "deal" : "deals"} to the sales trip ${trip.title}`,
      }, now);
    }
    return { trip: (await getVisitTrip(id, db))!, added };
  });
}

export async function removeVisitTripDeal(id: number, leadId: number, actor: UserAccount): Promise<VisitTrip> {
  return withTransaction(async (db) => {
    const trip = await requireManageable(db, id, actor);
    const origins = await tripOrigins(db, id, leadId);
    const result = await db.query("DELETE FROM visit_trip_deals WHERE trip_id = ? AND lead_id = ?", [id, leadId]);
    if (result.rowCount) {
      await db.query("UPDATE visit_trips SET updated_at = ? WHERE id = ?", [toSqlDateTime(new Date()), id]);
      await moveBackToTodo(db, origins, trip, actor, new Date());
      await recordAudit(db, {
        actorId: actor.id, action: "visit_trip.deal_removed", entityType: "visit_trip", entityId: id,
        before: { leadId }, details: `${actor.name} took a deal off the sales trip ${trip.title}`,
      });
    }
    return (await getVisitTrip(id, db))!;
  });
}
