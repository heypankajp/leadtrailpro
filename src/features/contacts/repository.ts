import { fromSqlDateTime, getDatabasePool, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { statusLabel } from "@/features/list-values/model";
import { hasPrivilege, type UserAccount } from "@/features/users/model";
import { copyOrganizationToDeals, copyPersonToDeals } from "../../../scripts/lib/contacts-sync.mjs";
import {
  contactKey, type ContactActivity, type ContactActivityInput, type ContactDeal, type ContactPage, type ContactPermissions, type ContactQuery, type Organization, type OrganizationDetail, type OrganizationInput,
  type OrganizationRow, type Person, type PersonDetail, type PersonInput, type PersonRow, contactActivityTypes, timelineMonths, type ContactActivityType, type ContactsTimeline, type TimelineRow,
} from "./model";

// People and Organizations (SPEC §10.14). Everyone who may see deals sees every contact; a contact is edited by its
// owner or by someone who may edit any deal, and removed only while it has no deals.

const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
const run = (db: Queryable) => (sql: string, params: unknown[] = []) => db.query(sql, params);
const fullName = (alias: string) => `TRIM(CONCAT(${alias}.first_name, ' ', ${alias}.last_name))`;
// Deals waiting for approval do not count yet; archived deals still belong to their contact.
const counted = "l.record_state IN ('active', 'archived')";
/** `own`: the condition that picks the contact's own notes and calls in contact_activities (alias c). */
const dealStats = (link: string, own: string) => `
  (SELECT COUNT(*)::int FROM leads l WHERE ${link} AND ${counted}) AS deals,
  (SELECT COUNT(*)::int FROM leads l WHERE ${link} AND l.record_state = 'active') AS "openDeals",
  GREATEST((SELECT MAX(l.last_activity_at) FROM leads l WHERE ${link} AND ${counted}), (SELECT MAX(c.occurred_at) FROM contact_activities c WHERE ${own})) AS "lastActivityAt",
  (SELECT l.id FROM leads l WHERE ${link} AND ${counted} ORDER BY (l.record_state = 'active') DESC, l.last_activity_at DESC LIMIT 1) AS "dealId"`;

const personSelect = `
  SELECT p.id, p.name, p.organization_id AS "organizationId", o.name AS organization, p.emails->>0 AS email, NULLIF(p.phone, '') AS phone, ${fullName("u")} AS "ownerName",${dealStats("l.person_id = p.id", "c.person_id = p.id")}
  FROM persons p LEFT JOIN organizations o ON o.id = p.organization_id JOIN users u ON u.id = p.owner_id`;
type Stats = { deals: number; openDeals: number; lastActivityAt: string | null; dealId: number | null };
const withStats = <Row extends Stats>(row: Row): Row => ({ ...row, deals: Number(row.deals), openDeals: Number(row.openDeals), dealId: row.dealId === null ? null : Number(row.dealId), lastActivityAt: fromSqlDateTime(row.lastActivityAt) });

export async function listOrganizations(query: ContactQuery, db: Queryable = getDatabasePool()): Promise<ContactPage<OrganizationRow>> {
  const clauses = ["TRUE"];
  const params: unknown[] = [];
  if (query.q) {
    const pattern = likePattern(query.q.toLowerCase());
    clauses.push("(o.name_key LIKE ? OR LOWER(o.industry) LIKE ? OR LOWER(COALESCE(ci.value, '')) LIKE ?)");
    params.push(pattern, pattern, pattern);
  }
  const from = `FROM organizations o LEFT JOIN list_values ci ON ci.id = o.city_id JOIN users u ON u.id = o.owner_id WHERE ${clauses.join(" AND ")}`;
  const total = await db.query(`SELECT COUNT(*)::int AS total ${from}`, params);
  const { rows } = await db.query(
    `SELECT o.id, o.name, ci.value AS city, NULLIF(o.industry, '') AS industry, ${fullName("u")} AS "ownerName",
       (SELECT COUNT(*)::int FROM persons p WHERE p.organization_id = o.id) AS people,${dealStats("l.organization_id = o.id", "c.organization_id = o.id OR c.person_id IN (SELECT id FROM persons WHERE organization_id = o.id)")}
     ${from} ORDER BY o.name_key LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return { rows: (rows as OrganizationRow[]).map((row) => withStats({ ...row, people: Number(row.people) })), total: Number(total.rows[0]?.total ?? 0), page: query.page, pageSize: query.pageSize };
}

export async function listPeople(query: ContactQuery, db: Queryable = getDatabasePool()): Promise<ContactPage<PersonRow>> {
  const clauses = ["TRUE"];
  const params: unknown[] = [];
  if (query.q) {
    const pattern = likePattern(query.q.toLowerCase());
    clauses.push("(p.name_key LIKE ? OR COALESCE(o.name_key, '') LIKE ? OR LOWER(p.emails::text) LIKE ? OR LOWER(p.phone) LIKE ?)");
    params.push(pattern, pattern, pattern, pattern);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const total = await db.query(`SELECT COUNT(*)::int AS total FROM persons p LEFT JOIN organizations o ON o.id = p.organization_id ${where}`, params);
  const { rows } = await db.query(`${personSelect} ${where} ORDER BY p.name_key, p.id LIMIT ? OFFSET ?`, [...params, query.pageSize, (query.page - 1) * query.pageSize]);
  return { rows: (rows as PersonRow[]).map(withStats), total: Number(total.rows[0]?.total ?? 0), page: query.page, pageSize: query.pageSize };
}

const organizationSelect = `
  SELECT o.id, o.name, o.website, o.address, o.city_id AS "cityId", ci.value AS city, o.industry, o.company_size_id AS "companySizeId", cs.value AS "companySize",
    o.owner_id AS "ownerId", ${fullName("u")} AS "ownerName", o.created_at AS "createdAt", ${fullName("c")} AS "createdByName"
  FROM organizations o LEFT JOIN list_values ci ON ci.id = o.city_id LEFT JOIN list_values cs ON cs.id = o.company_size_id JOIN users u ON u.id = o.owner_id JOIN users c ON c.id = o.created_by`;
const personDetailSelect = `
  SELECT p.id, p.name, p.organization_id AS "organizationId", o.name AS organization, p.emails, p.phone, p.alt_phone AS "altPhone", p.remark,
    p.owner_id AS "ownerId", ${fullName("u")} AS "ownerName", p.created_at AS "createdAt", ${fullName("c")} AS "createdByName"
  FROM persons p LEFT JOIN organizations o ON o.id = p.organization_id JOIN users u ON u.id = p.owner_id JOIN users c ON c.id = p.created_by`;

async function findOrganization(id: number, db: Queryable): Promise<Organization | null> {
  const { rows } = await db.query(`${organizationSelect} WHERE o.id = ?`, [id]);
  const row = rows[0] as Organization | undefined;
  return row ? { ...row, createdAt: fromSqlDateTime(row.createdAt) } : null;
}
async function findPerson(id: number, db: Queryable): Promise<Person | null> {
  const { rows } = await db.query(`${personDetailSelect} WHERE p.id = ?`, [id]);
  const row = rows[0] as Person | undefined;
  return row ? { ...row, emails: Array.isArray(row.emails) ? row.emails : [], createdAt: fromSqlDateTime(row.createdAt) } : null;
}

async function dealsOf(link: string, id: number, db: Queryable): Promise<ContactDeal[]> {
  const { rows } = await db.query(
    `SELECT l.id, l.client_name AS "clientName", l.client_executive AS "clientExecutive", st.value AS status, st.code AS "statusCode", sr.value AS "statusReason", sg.value AS stage,
       ${fullName("u")} AS "ownerName", l.record_state AS "recordState", COALESCE(l.positions, '') AS positions, l.last_activity_at AS "lastActivityAt", l.created_at AS "createdAt"
     FROM leads l JOIN list_values st ON st.id = l.status_id LEFT JOIN list_values sr ON sr.id = l.status_reason_id LEFT JOIN list_values sg ON sg.id = l.stage_id JOIN users u ON u.id = l.owner_id
     WHERE ${link} = ? ORDER BY (l.record_state = 'active') DESC, l.last_activity_at DESC LIMIT 200`,
    [id],
  );
  return (rows as (ContactDeal & { statusReason: string | null })[]).map(({ statusReason, ...row }) => ({ ...row, status: statusLabel(row.status, statusReason), lastActivityAt: fromSqlDateTime(row.lastActivityAt), createdAt: fromSqlDateTime(row.createdAt) }));
}

/**
 * A contact's history: the timelines of its deals together with the notes and calls written on the contact itself
 * (for an organization also those written on its people), newest first.
 */
async function activitiesOf(kind: "organization" | "person", id: number, db: Queryable): Promise<ContactActivity[]> {
  const link = kind === "organization" ? "l.organization_id" : "l.person_id";
  const own = kind === "organization" ? "(c.organization_id = ? OR c.person_id IN (SELECT id FROM persons WHERE organization_id = ?))" : "c.person_id = ?";
  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT a.id, 'deal' AS source, a.lead_id AS "leadId", a.activity_type AS type, a.summary, a.body, ${fullName("u")} AS "userName", a.occurred_at AS "occurredAt", NULL AS about
       FROM lead_activities a JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id WHERE ${link} = ?
       UNION ALL
       SELECT c.id, 'contact' AS source, NULL AS "leadId", c.activity_type AS type, c.summary, c.body, ${fullName("u")} AS "userName", c.occurred_at AS "occurredAt", ${kind === "organization" ? "p.name" : "NULL"} AS about
       FROM contact_activities c LEFT JOIN persons p ON p.id = c.person_id LEFT JOIN users u ON u.id = c.user_id WHERE ${own}
     ) entries ORDER BY "occurredAt" DESC, id DESC LIMIT 80`,
    kind === "organization" ? [id, id, id] : [id, id],
  );
  return (rows as ContactActivity[]).map((row) => ({ ...row, leadId: row.leadId === null ? null : Number(row.leadId), userName: row.userName || null, occurredAt: fromSqlDateTime(row.occurredAt) }));
}

const permissionsFor = (viewer: UserAccount, ownerId: number, dealCount: number): ContactPermissions => {
  const edit = hasPrivilege(viewer, "edit_any_lead") || (hasPrivilege(viewer, "edit_leads") && ownerId === viewer.id);
  return { edit, remove: edit && dealCount === 0, addDeal: hasPrivilege(viewer, "create_leads"), note: hasPrivilege(viewer, "add_notes"), log: hasPrivilege(viewer, "log_activities") };
};

export async function getOrganizationDetail(id: number, viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<OrganizationDetail> {
  const organization = await findOrganization(id, db);
  if (!organization) throw new HttpError(404, "Organization not found.");
  const [people, deals, activities] = await Promise.all([
    db.query(`${personSelect} WHERE p.organization_id = ? ORDER BY p.name_key`, [id]).then((result) => (result.rows as PersonRow[]).map(withStats)),
    dealsOf("l.organization_id", id, db), activitiesOf("organization", id, db),
  ]);
  return { organization, people, deals, activities, permissions: permissionsFor(viewer, organization.ownerId, deals.length) };
}

export async function getPersonDetail(id: number, viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<PersonDetail> {
  const person = await findPerson(id, db);
  if (!person) throw new HttpError(404, "Person not found.");
  const [deals, activities] = await Promise.all([dealsOf("l.person_id", id, db), activitiesOf("person", id, db)]);
  return { person, deals, activities, permissions: permissionsFor(viewer, person.ownerId, deals.length) };
}

const requireCreate = (actor: UserAccount) => { if (!hasPrivilege(actor, "create_leads")) throw new HttpError(403, "You do not have permission to add contacts."); };
const requireEdit = (actor: UserAccount, ownerId: number) => { if (!permissionsFor(actor, ownerId, 0).edit) throw new HttpError(403, "You can only change contacts you own."); };
const organizationValues = (input: OrganizationInput) => [input.name, contactKey(input.name), input.website, input.address, input.cityId, input.industry, input.companySizeId];

export async function createOrganization(input: OrganizationInput, actor: UserAccount): Promise<Organization> {
  requireCreate(actor);
  return withTransaction(async (connection) => {
    const clash = await connection.query("SELECT id FROM organizations WHERE name_key = ?", [contactKey(input.name)]);
    if (clash.rows.length) throw new HttpError(409, `${input.name} is already an organization. Open it from the list.`, { organizationId: Number(clash.rows[0].id) });
    const result = await connection.query(
      "INSERT INTO organizations (name, name_key, website, address, city_id, industry, company_size_id, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [...organizationValues(input), actor.id, actor.id],
    );
    const organization = (await findOrganization(insertId(result), connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "organization.created", entityType: "organization", entityId: organization.id, after: { name: organization.name }, details: `${actor.name} added the organization ${organization.name}` });
    return organization;
  });
}

export async function updateOrganization(id: number, input: OrganizationInput, actor: UserAccount): Promise<Organization> {
  return withTransaction(async (connection) => {
    const before = await findOrganization(id, connection);
    if (!before) throw new HttpError(404, "Organization not found.");
    requireEdit(actor, before.ownerId);
    const clash = await connection.query("SELECT id FROM organizations WHERE name_key = ? AND id <> ?", [contactKey(input.name), id]);
    if (clash.rows.length) throw new HttpError(409, `Another organization is already called ${input.name}.`);
    await connection.query("UPDATE organizations SET name = ?, name_key = ?, website = ?, address = ?, city_id = ?, industry = ?, company_size_id = ? WHERE id = ?", [...organizationValues(input), id]);
    // The sales tracker may still list the old name: it stays known, so the next import finds this organization's deal.
    if (contactKey(input.name) !== contactKey(before.name)) await rememberName(connection, id, [before.name]);
    // Every deal of the organization shows the same company details.
    await copyOrganizationToDeals(run(connection), id);
    const after = (await findOrganization(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "organization.updated", entityType: "organization", entityId: id,
      before: { name: before.name, website: before.website, address: before.address, city: before.city, industry: before.industry, companySize: before.companySize },
      after: { name: after.name, website: after.website, address: after.address, city: after.city, industry: after.industry, companySize: after.companySize },
      details: `${actor.name} updated the organization ${after.name}`,
    });
    return after;
  });
}

export async function deleteOrganization(id: number, actor: UserAccount): Promise<void> {
  await withTransaction(async (connection) => {
    const before = await findOrganization(id, connection);
    if (!before) throw new HttpError(404, "Organization not found.");
    requireEdit(actor, before.ownerId);
    const deals = await connection.query("SELECT COUNT(*)::int AS count FROM leads WHERE organization_id = ?", [id]);
    if (Number(deals.rows[0]?.count ?? 0) > 0) throw new HttpError(409, "An organization with deals cannot be removed. Archive or move its deals first.");
    await connection.query("DELETE FROM organizations WHERE id = ?", [id]);
    await recordAudit(connection, { actorId: actor.id, action: "organization.removed", entityType: "organization", entityId: id, before: { name: before.name }, details: `${actor.name} removed the organization ${before.name} (it had no deals)` });
  });
}

/** The organization a person is filed under: the one with that name, created when the name is new, or none. */
async function organizationFor(connection: Queryable, name: string, actor: UserAccount): Promise<number | null> {
  if (!name) return null;
  const found = await connection.query("SELECT id FROM organizations WHERE name_key = ?", [contactKey(name)]);
  if (found.rows.length) return Number(found.rows[0].id);
  const created = await connection.query("INSERT INTO organizations (name, name_key, owner_id, created_by) VALUES (?, ?, ?, ?) RETURNING id", [name, contactKey(name), actor.id, actor.id]);
  await recordAudit(connection, { actorId: actor.id, action: "organization.created", entityType: "organization", entityId: insertId(created), after: { name }, details: `${actor.name} added the organization ${name} with a person` });
  return insertId(created);
}

export async function createPerson(input: PersonInput, actor: UserAccount): Promise<Person> {
  requireCreate(actor);
  return withTransaction(async (connection) => {
    const organizationId = await organizationFor(connection, input.organizationName, actor);
    if (organizationId) {
      const clash = await connection.query("SELECT id FROM persons WHERE organization_id = ? AND name_key = ?", [organizationId, contactKey(input.name)]);
      if (clash.rows.length) throw new HttpError(409, `${input.name} is already a person at ${input.organizationName}. Open them from the list.`, { personId: Number(clash.rows[0].id) });
    }
    const result = await connection.query(
      "INSERT INTO persons (organization_id, name, name_key, emails, phone, alt_phone, remark, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [organizationId, input.name, contactKey(input.name), JSON.stringify(input.emails), input.phone, input.altPhone, input.remark, actor.id, actor.id],
    );
    const person = (await findPerson(insertId(result), connection))!;
    await recordAudit(connection, { actorId: actor.id, action: "person.created", entityType: "person", entityId: person.id, after: { name: person.name, organization: person.organization }, details: `${actor.name} added the person ${person.name}${person.organization ? ` at ${person.organization}` : ""}` });
    return person;
  });
}

/** Name, emails, phones and remark. The organization of a person is set when they are added, or by their first deal. */
export async function updatePerson(id: number, input: PersonInput, actor: UserAccount): Promise<Person> {
  return withTransaction(async (connection) => {
    const before = await findPerson(id, connection);
    if (!before) throw new HttpError(404, "Person not found.");
    requireEdit(actor, before.ownerId);
    if (before.organizationId && contactKey(input.organizationName) === contactKey(before.organization ?? "")) {
      const clash = await connection.query("SELECT id FROM persons WHERE organization_id = ? AND name_key = ? AND id <> ?", [before.organizationId, contactKey(input.name), id]);
      if (clash.rows.length) throw new HttpError(409, `Another person at ${before.organization} is already called ${input.name}.`);
    }
    // Filing a person under another organization is a correction, allowed while they have no deals. Their deals name the
    // organization they belong to; someone who changed employer is added as a new person there (SPEC §10.16).
    let organizationId = before.organizationId;
    if (contactKey(input.organizationName) !== contactKey(before.organization ?? "")) {
      const deals = await connection.query("SELECT COUNT(*)::int AS count FROM leads WHERE person_id = ?", [id]);
      if (Number(deals.rows[0]?.count ?? 0) > 0) throw new HttpError(409, `${before.name} has deals with ${before.organization}, so they stay there. If they moved to another company, add them as a new person at that organization.`);
      organizationId = await organizationFor(connection, input.organizationName, actor);
      if (organizationId) {
        const taken = await connection.query("SELECT id FROM persons WHERE organization_id = ? AND name_key = ? AND id <> ?", [organizationId, contactKey(input.name), id]);
        if (taken.rows.length) throw new HttpError(409, `${input.organizationName} already has a person called ${input.name}.`);
      }
    }
    await connection.query("UPDATE persons SET organization_id = ?, name = ?, name_key = ?, emails = ?, phone = ?, alt_phone = ?, remark = ? WHERE id = ?",
      [organizationId, input.name, contactKey(input.name), JSON.stringify(input.emails), input.phone, input.altPhone, input.remark, id]);
    await copyPersonToDeals(run(connection), id);
    const after = (await findPerson(id, connection))!;
    await recordAudit(connection, {
      actorId: actor.id, action: "person.updated", entityType: "person", entityId: id,
      before: { name: before.name, emails: before.emails.join(", "), phone: before.phone, altPhone: before.altPhone, remark: before.remark, organization: before.organization },
      after: { name: after.name, emails: after.emails.join(", "), phone: after.phone, altPhone: after.altPhone, remark: after.remark, organization: after.organization },
      details: `${actor.name} updated the person ${after.name}`,
    });
    return after;
  });
}

export async function deletePerson(id: number, actor: UserAccount): Promise<void> {
  await withTransaction(async (connection) => {
    const before = await findPerson(id, connection);
    if (!before) throw new HttpError(404, "Person not found.");
    requireEdit(actor, before.ownerId);
    const deals = await connection.query("SELECT COUNT(*)::int AS count FROM leads WHERE person_id = ?", [id]);
    if (Number(deals.rows[0]?.count ?? 0) > 0) throw new HttpError(409, "A person with deals cannot be removed. Archive or change their deals first.");
    await connection.query("DELETE FROM persons WHERE id = ?", [id]);
    await recordAudit(connection, { actorId: actor.id, action: "person.removed", entityType: "person", entityId: id, before: { name: before.name }, details: `${actor.name} removed the person ${before.name} (they had no deals)` });
  });
}

/** Adds names an organization used to have (after a rename or a merge), without repeats. */
async function rememberName(connection: Queryable, organizationId: number, names: string[]): Promise<void> {
  const kept = names.map((name) => name.trim()).filter(Boolean);
  if (!kept.length) return;
  await connection.query(
    `UPDATE organizations o SET aliases = (
       SELECT COALESCE(jsonb_agg(DISTINCT alias), '[]'::jsonb) FROM jsonb_array_elements_text(o.aliases || ?::jsonb) alias WHERE LOWER(TRIM(alias)) <> o.name_key
     ) WHERE o.id = ?`,
    [JSON.stringify(kept), organizationId],
  );
}

/** A note, or a logged call, email or visit, written on the contact itself: there need not be a deal (SPEC §10.16). */
export async function logContactActivity(kind: "organization" | "person", id: number, input: ContactActivityInput, actor: UserAccount): Promise<void> {
  if (!hasPrivilege(actor, input.type === "note" ? "add_notes" : "log_activities")) throw new HttpError(403, input.type === "note" ? "You do not have permission to add notes." : "You do not have permission to log activities.");
  await withTransaction(async (connection) => {
    const name = kind === "organization" ? (await findOrganization(id, connection))?.name : (await findPerson(id, connection))?.name;
    if (!name) throw new HttpError(404, kind === "organization" ? "Organization not found." : "Person not found.");
    const defaults = { note: "Note", call: `Call with ${name}`, email: `Email to ${name}`, visit: `Visit to ${name}` };
    const summary = input.summary || defaults[input.type];
    await connection.query(
      `INSERT INTO contact_activities (${kind === "organization" ? "organization_id" : "person_id"}, user_id, activity_type, summary, body, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, actor.id, input.type, summary, input.body || null, toSqlDateTime(input.occurredAt ? new Date(input.occurredAt) : new Date())],
    );
    await recordAudit(connection, { actorId: actor.id, action: `${kind}.${input.type}_logged`, entityType: kind, entityId: id, after: { type: input.type, summary }, details: `${actor.name} logged a ${input.type} on ${name}` });
  });
}

/** Folds person `otherId` into `keepId`: deals and notes move, empty fields are filled, emails are joined. */
async function foldPerson(connection: Queryable, keepId: number, otherId: number): Promise<void> {
  await connection.query("UPDATE leads SET person_id = ? WHERE person_id = ?", [keepId, otherId]);
  await connection.query("UPDATE contact_activities SET person_id = ? WHERE person_id = ?", [keepId, otherId]);
  await connection.query(
    `UPDATE persons k SET emails = (SELECT COALESCE(jsonb_agg(DISTINCT email), '[]'::jsonb) FROM jsonb_array_elements_text(k.emails || o.emails) email),
       phone = CASE WHEN k.phone = '' THEN o.phone ELSE k.phone END, alt_phone = CASE WHEN k.alt_phone = '' THEN o.alt_phone ELSE k.alt_phone END, remark = CASE WHEN k.remark = '' THEN o.remark ELSE k.remark END
     FROM persons o WHERE k.id = ? AND o.id = ?`,
    [keepId, otherId],
  );
  await connection.query("DELETE FROM persons WHERE id = ?", [otherId]);
  await copyPersonToDeals(run(connection), keepId);
}

/**
 * Merge duplicates (SPEC §10.16): the other person's deals, notes and details go to this one, and the other is removed.
 * Both must belong to the same organization, or one of them to none.
 */
export async function mergePeople(keepId: number, otherId: number, actor: UserAccount): Promise<Person> {
  if (keepId === otherId) throw new HttpError(400, "Choose a different person to merge.");
  return withTransaction(async (connection) => {
    const [keep, other] = [await findPerson(keepId, connection), await findPerson(otherId, connection)];
    if (!keep || !other) throw new HttpError(404, "Person not found.");
    requireEdit(actor, keep.ownerId);
    requireEdit(actor, other.ownerId);
    if (keep.organizationId && other.organizationId && keep.organizationId !== other.organizationId) throw new HttpError(409, `${keep.name} is at ${keep.organization} and ${other.name} at ${other.organization}. Merge the two organizations first if they are the same company.`);
    await foldPerson(connection, keepId, otherId);
    if (!keep.organizationId && other.organizationId) await connection.query("UPDATE persons SET organization_id = ? WHERE id = ?", [other.organizationId, keepId]);
    await recordAudit(connection, { actorId: actor.id, action: "person.merged", entityType: "person", entityId: keepId, before: { merged: other.name, organization: other.organization }, details: `${actor.name} merged the person ${other.name} into ${keep.name}` });
    return (await findPerson(keepId, connection))!;
  });
}

/**
 * Merge duplicates: the other organization's deals, people and notes go to this one (people of the same name are folded
 * together), empty details are filled from it, its name stays known for the import, and it is removed.
 */
export async function mergeOrganizations(keepId: number, otherId: number, actor: UserAccount): Promise<Organization> {
  if (keepId === otherId) throw new HttpError(400, "Choose a different organization to merge.");
  return withTransaction(async (connection) => {
    const [keep, other] = [await findOrganization(keepId, connection), await findOrganization(otherId, connection)];
    if (!keep || !other) throw new HttpError(404, "Organization not found.");
    requireEdit(actor, keep.ownerId);
    requireEdit(actor, other.ownerId);
    const people = (await connection.query("SELECT id, name_key FROM persons WHERE organization_id = ?", [otherId])).rows as { id: number; name_key: string }[];
    for (const person of people) {
      const twin = await connection.query("SELECT id FROM persons WHERE organization_id = ? AND name_key = ?", [keepId, person.name_key]);
      if (twin.rows.length) await foldPerson(connection, Number(twin.rows[0].id), Number(person.id));
      else await connection.query("UPDATE persons SET organization_id = ? WHERE id = ?", [keepId, person.id]);
    }
    await connection.query("UPDATE leads SET organization_id = ? WHERE organization_id = ?", [keepId, otherId]);
    await connection.query("UPDATE contact_activities SET organization_id = ? WHERE organization_id = ?", [keepId, otherId]);
    await connection.query(
      `UPDATE organizations k SET website = CASE WHEN k.website = '' THEN o.website ELSE k.website END, address = CASE WHEN k.address = '' THEN o.address ELSE k.address END,
         city_id = COALESCE(k.city_id, o.city_id), industry = CASE WHEN k.industry = '' THEN o.industry ELSE k.industry END, company_size_id = COALESCE(k.company_size_id, o.company_size_id)
       FROM organizations o WHERE k.id = ? AND o.id = ?`,
      [keepId, otherId],
    );
    const earlier = (await connection.query("SELECT aliases FROM organizations WHERE id = ?", [otherId])).rows[0]?.aliases;
    await connection.query("DELETE FROM organizations WHERE id = ?", [otherId]);
    await rememberName(connection, keepId, [other.name, ...(Array.isArray(earlier) ? (earlier as string[]) : [])]);
    await copyOrganizationToDeals(run(connection), keepId);
    await recordAudit(connection, { actorId: actor.id, action: "organization.merged", entityType: "organization", entityId: keepId, before: { merged: other.name }, details: `${actor.name} merged the organization ${other.name} into ${keep.name}` });
    return (await findOrganization(keepId, connection))!;
  });
}

/**
 * Contacts timeline (SPEC §10.17): for a page of people, how many calls, emails, visits and notes each month of the
 * last twelve saw, on their deals and on the person themselves.
 */
export async function contactsTimeline(query: ContactQuery, todayYmd: string, db: Queryable = getDatabasePool()): Promise<ContactsTimeline> {
  const months = timelineMonths(todayYmd);
  const clauses = ["TRUE"];
  const params: unknown[] = [];
  if (query.q) {
    const pattern = likePattern(query.q.toLowerCase());
    clauses.push("(p.name_key LIKE ? OR COALESCE(o.name_key, '') LIKE ?)");
    params.push(pattern, pattern);
  }
  const from = `FROM persons p LEFT JOIN organizations o ON o.id = p.organization_id WHERE ${clauses.join(" AND ")}`;
  const total = await db.query(`SELECT COUNT(*)::int AS total ${from}`, params);
  const people = (await db.query(`SELECT p.id, p.name, p.organization_id AS "organizationId", o.name AS organization ${from} ORDER BY p.name_key, p.id LIMIT ? OFFSET ?`, [...params, query.pageSize, (query.page - 1) * query.pageSize])).rows as Omit<TimelineRow, "months" | "lastContactAt">[];
  const rows: TimelineRow[] = people.map((person) => ({ ...person, id: Number(person.id), months: {}, lastContactAt: null }));
  if (rows.length) {
    const ids = rows.map((row) => row.id);
    const types = contactActivityTypes.map((type) => `'${type}'`).join(", ");
    const since = `${months[0]}-01`;
    const counted = await db.query(
      `SELECT entries.person_id AS "personId", to_char(entries.occurred_at, 'YYYY-MM') AS month, entries.type, COUNT(*)::int AS count, MAX(entries.occurred_at) AS latest
       FROM (
         SELECT l.person_id, a.occurred_at, a.activity_type AS type FROM lead_activities a JOIN leads l ON l.id = a.lead_id
         WHERE l.person_id = ANY(?::int[]) AND a.activity_type IN (${types}) AND a.occurred_at >= ?::date
         UNION ALL
         SELECT c.person_id, c.occurred_at, c.activity_type AS type FROM contact_activities c WHERE c.person_id = ANY(?::int[]) AND c.occurred_at >= ?::date
       ) entries GROUP BY 1, 2, 3`,
      [ids, since, ids, since],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const entry of counted.rows as { personId: number; month: string; type: ContactActivityType; count: number; latest: string }[]) {
      const row = byId.get(Number(entry.personId));
      if (!row) continue;
      (row.months[entry.month] ??= {})[entry.type] = Number(entry.count);
      const latest = fromSqlDateTime(entry.latest);
      if (latest && (!row.lastContactAt || latest > row.lastContactAt)) row.lastContactAt = latest;
    }
  }
  return { months, rows, total: Number(total.rows[0]?.total ?? 0), page: query.page, pageSize: query.pageSize };
}
