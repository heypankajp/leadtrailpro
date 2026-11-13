// Contacts as records (SPEC §10.14): every deal belongs to an organization and, when it names a contact person, to a
// person of that organization. The deal keeps its own copy of the contact's fields (client name, executive, emails,
// phones, address …) because the import, the reports, the emails and the planners read them there; this module is the
// one place that keeps the two in step. Plain SQL with `?` placeholders through the caller's `query(sql, params)`, so
// the app, the tracker import, the sample data and the migration all use the same statements.

const orgKey = "LOWER(TRIM(l.client_name))";
const personKey = "LOWER(TRIM(l.client_executive))";
const liveliest = "(l.record_state = 'active') DESC, l.last_activity_at DESC, l.id DESC";

/**
 * Makes sure the organization and the person named on each deal exist, and links the deal to them. `leadIds` limits the
 * work to those deals; without it every deal is checked (the migration, the end of an import). Safe to run again.
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query
 * @param {number[] | null} [leadIds]
 */
export async function syncContactsFromLeads(query, leadIds = null) {
  const scope = leadIds ? "l.id = ANY(?::int[])" : "TRUE";
  const params = leadIds ? [leadIds] : [];
  if (leadIds && !leadIds.length) return;
  await query(
    `INSERT INTO organizations (name, name_key, website, address, city_id, industry, company_size_id, owner_id, created_by, created_at)
     SELECT DISTINCT ON (${orgKey}) TRIM(l.client_name), ${orgKey}, l.company_url, l.address, l.city_id, l.industry, l.company_size_id, l.owner_id, l.created_by, l.created_at
     FROM leads l
     WHERE ${scope} AND TRIM(l.client_name) <> '' AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.name_key = ${orgKey})
     ORDER BY ${orgKey}, ${liveliest}
     ON CONFLICT DO NOTHING`,
    params,
  );
  await query(`UPDATE leads l SET organization_id = o.id FROM organizations o WHERE ${scope} AND o.name_key = ${orgKey} AND l.organization_id IS DISTINCT FROM o.id`, params);
  await query(
    `INSERT INTO persons (organization_id, name, name_key, emails, phone, alt_phone, remark, owner_id, created_by, created_at)
     SELECT DISTINCT ON (l.organization_id, ${personKey}) l.organization_id, TRIM(l.client_executive), ${personKey}, l.client_emails, l.contact_phone, l.contact_alt_phone, l.contact_remark, l.owner_id, l.created_by, l.created_at
     FROM leads l
     WHERE ${scope} AND TRIM(l.client_executive) <> '' AND l.organization_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.organization_id = l.organization_id AND p.name_key = ${personKey})
     ORDER BY l.organization_id, ${personKey}, ${liveliest}
     ON CONFLICT DO NOTHING`,
    params,
  );
  await query(
    `UPDATE leads l SET person_id = p.id FROM persons p
     WHERE ${scope} AND p.organization_id = l.organization_id AND p.name_key = ${personKey} AND l.person_id IS DISTINCT FROM p.id`,
    params,
  );
  await query(`UPDATE leads l SET person_id = NULL WHERE ${scope} AND l.person_id IS NOT NULL AND TRIM(l.client_executive) = ''`, params);
}

/**
 * Copies an organization's fields onto every deal linked to it (after the organization was edited or took a deal's values).
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query
 * @param {number} organizationId
 */
export async function copyOrganizationToDeals(query, organizationId) {
  await query(
    `UPDATE leads l SET client_name = o.name, company_url = o.website, address = o.address, city_id = o.city_id, industry = o.industry, company_size_id = o.company_size_id
     FROM organizations o
     WHERE o.id = ? AND l.organization_id = o.id
       AND (l.client_name, l.company_url, l.address, l.city_id, l.industry, l.company_size_id) IS DISTINCT FROM (o.name, o.website, o.address, o.city_id, o.industry, o.company_size_id)`,
    [organizationId],
  );
}

/**
 * Copies a person's fields onto every deal linked to them.
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query
 * @param {number} personId
 */
export async function copyPersonToDeals(query, personId) {
  await query(
    `UPDATE leads l SET client_executive = p.name, client_emails = p.emails, contact_phone = p.phone, contact_alt_phone = p.alt_phone, contact_remark = p.remark
     FROM persons p
     WHERE p.id = ? AND l.person_id = p.id
       AND (l.client_executive, l.client_emails, l.contact_phone, l.contact_alt_phone, l.contact_remark) IS DISTINCT FROM (p.name, p.emails, p.phone, p.alt_phone, p.remark)`,
    [personId],
  );
}

/**
 * After an import: a contact that has exactly one deal takes that deal's values (the sheet is the newer source), so
 * the contact pages show what the deal shows. Contacts with several deals are left to the people who edit them.
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query
 */
export async function refreshContactsFromSingleDeals(query) {
  await query(
    `UPDATE organizations o SET website = l.company_url, address = l.address, city_id = l.city_id, industry = l.industry, company_size_id = l.company_size_id
     FROM leads l
     WHERE l.organization_id = o.id AND (SELECT COUNT(*) FROM leads x WHERE x.organization_id = o.id) = 1
       AND (o.website, o.address, o.city_id, o.industry, o.company_size_id) IS DISTINCT FROM (l.company_url, l.address, l.city_id, l.industry, l.company_size_id)`,
  );
  await query(
    `UPDATE persons p SET emails = l.client_emails, phone = l.contact_phone, alt_phone = l.contact_alt_phone, remark = l.contact_remark
     FROM leads l
     WHERE l.person_id = p.id AND (SELECT COUNT(*) FROM leads x WHERE x.person_id = p.id) = 1
       AND (p.emails, p.phone, p.alt_phone, p.remark) IS DISTINCT FROM (l.client_emails, l.contact_phone, l.contact_alt_phone, l.contact_remark)`,
  );
}
