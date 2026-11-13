import type { Queryable } from "@/lib/db";
import type { LeadInput } from "@/features/leads/model";
import { copyOrganizationToDeals, copyPersonToDeals, syncContactsFromLeads } from "../../../scripts/lib/contacts-sync.mjs";
import { contactKey } from "./model";

// Keeps a deal's own copy of its contact fields and the organization / person records in step (SPEC §10.14).
// The statements shared with the import and the migration live in scripts/lib/contacts-sync.mjs.

const run = (db: Queryable) => (sql: string, params: unknown[] = []) => db.query(sql, params);

type Linked = { organizationId: number | null; personId: number | null };
const linksOf = async (db: Queryable, leadId: number): Promise<Linked> => {
  const { rows } = await db.query(`SELECT organization_id AS "organizationId", person_id AS "personId" FROM leads WHERE id = ?`, [leadId]);
  return (rows[0] as Linked | undefined) ?? { organizationId: null, personId: null };
};

/**
 * A new deal: link it to its organization and person (created when the names are new), let what was typed on the deal
 * update them where it says something (an empty field never wipes a value), then give every deal of both the same values.
 */
export async function linkNewDeal(db: Queryable, leadId: number, personId: number | null = null): Promise<void> {
  if (personId) {
    // Added from a person who has no organization yet: they join the deal's organization, so no second person is made.
    await db.query(
      `INSERT INTO organizations (name, name_key, website, address, city_id, industry, company_size_id, owner_id, created_by, created_at)
       SELECT TRIM(l.client_name), LOWER(TRIM(l.client_name)), l.company_url, l.address, l.city_id, l.industry, l.company_size_id, l.owner_id, l.created_by, l.created_at
       FROM leads l WHERE l.id = ? AND TRIM(l.client_name) <> '' ON CONFLICT DO NOTHING`,
      [leadId],
    );
    await db.query(
      `UPDATE persons p SET organization_id = o.id FROM leads l JOIN organizations o ON o.name_key = LOWER(TRIM(l.client_name))
       WHERE l.id = ? AND p.id = ? AND p.organization_id IS NULL AND p.name_key = LOWER(TRIM(l.client_executive))
         AND NOT EXISTS (SELECT 1 FROM persons other WHERE other.organization_id = o.id AND other.name_key = p.name_key)`,
      [leadId, personId],
    );
  }
  await syncContactsFromLeads(run(db), [leadId]);
  await db.query(
    `UPDATE organizations o SET website = CASE WHEN l.company_url <> '' THEN l.company_url ELSE o.website END, address = CASE WHEN l.address <> '' THEN l.address ELSE o.address END,
       city_id = COALESCE(l.city_id, o.city_id), industry = CASE WHEN l.industry <> '' THEN l.industry ELSE o.industry END, company_size_id = COALESCE(l.company_size_id, o.company_size_id)
     FROM leads l WHERE l.id = ? AND o.id = l.organization_id`,
    [leadId],
  );
  await db.query(
    `UPDATE persons p SET emails = CASE WHEN jsonb_array_length(l.client_emails) > 0 THEN l.client_emails ELSE p.emails END, phone = CASE WHEN l.contact_phone <> '' THEN l.contact_phone ELSE p.phone END,
       alt_phone = CASE WHEN l.contact_alt_phone <> '' THEN l.contact_alt_phone ELSE p.alt_phone END, remark = CASE WHEN l.contact_remark <> '' THEN l.contact_remark ELSE p.remark END
     FROM leads l WHERE l.id = ? AND p.id = l.person_id`,
    [leadId],
  );
  const links = await linksOf(db, leadId);
  if (links.organizationId) await copyOrganizationToDeals(run(db), links.organizationId);
  if (links.personId) await copyPersonToDeals(run(db), links.personId);
}

const organizationColumns: Partial<Record<keyof LeadInput, [string, string]>> = {
  companyUrl: ["website", "company_url"], address: ["address", "address"], cityId: ["city_id", "city_id"], industry: ["industry", "industry"], companySizeId: ["company_size_id", "company_size_id"],
};
const personColumns: Partial<Record<keyof LeadInput, [string, string]>> = {
  clientEmails: ["emails", "client_emails"], contactPhone: ["phone", "contact_phone"], contactAltPhone: ["alt_phone", "contact_alt_phone"], contactRemark: ["remark", "contact_remark"],
};

/**
 * A deal was edited (its row is already updated). A changed client or contact name fixes the name of an organization or
 * person that only this deal uses, otherwise the deal moves to the contact of that name (created when new). The contact
 * fields that were edited are taken over by the organization and person, and reach their other deals.
 */
export async function applyDealContactChanges(db: Queryable, before: { id: number; organizationId: number | null; personId: number | null; clientName: string; clientExecutive: string }, changes: Partial<LeadInput>): Promise<void> {
  const touched = (Object.keys(changes) as (keyof LeadInput)[]).filter((key) => changes[key] !== undefined);
  const renamedClient = changes.clientName !== undefined && contactKey(changes.clientName) !== contactKey(before.clientName);
  const renamedPerson = changes.clientExecutive !== undefined && contactKey(changes.clientExecutive) !== contactKey(before.clientExecutive);
  const organizationSets = touched.filter((key) => organizationColumns[key]);
  const personSets = touched.filter((key) => personColumns[key]);
  if (!renamedClient && !renamedPerson && !organizationSets.length && !personSets.length && changes.clientName === undefined && changes.clientExecutive === undefined) return;

  if (renamedClient && before.organizationId && changes.clientName) {
    await db.query(
      `UPDATE organizations o SET name = ?, name_key = ?, aliases = o.aliases || to_jsonb(o.name) WHERE o.id = ?
         AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.organization_id = o.id AND l.id <> ?) AND NOT EXISTS (SELECT 1 FROM organizations other WHERE other.name_key = ?)`,
      [changes.clientName.trim(), contactKey(changes.clientName), before.organizationId, before.id, contactKey(changes.clientName)],
    );
  }
  if (renamedPerson && before.personId && changes.clientExecutive?.trim()) {
    await db.query(
      `UPDATE persons p SET name = ?, name_key = ? WHERE p.id = ?
         AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.person_id = p.id AND l.id <> ?)
         AND NOT EXISTS (SELECT 1 FROM persons other WHERE other.organization_id IS NOT DISTINCT FROM p.organization_id AND other.name_key = ? AND other.id <> p.id)`,
      [changes.clientExecutive.trim(), contactKey(changes.clientExecutive), before.personId, before.id, contactKey(changes.clientExecutive)],
    );
  }
  await syncContactsFromLeads(run(db), [before.id]);
  if (organizationSets.length) {
    await db.query(`UPDATE organizations o SET ${organizationSets.map((key) => `${organizationColumns[key]![0]} = l.${organizationColumns[key]![1]}`).join(", ")} FROM leads l WHERE l.id = ? AND o.id = l.organization_id`, [before.id]);
  }
  if (personSets.length) {
    await db.query(`UPDATE persons p SET ${personSets.map((key) => `${personColumns[key]![0]} = l.${personColumns[key]![1]}`).join(", ")} FROM leads l WHERE l.id = ? AND p.id = l.person_id`, [before.id]);
  }
  const links = await linksOf(db, before.id);
  if (links.organizationId) await copyOrganizationToDeals(run(db), links.organizationId);
  if (links.personId) await copyPersonToDeals(run(db), links.personId);
}
