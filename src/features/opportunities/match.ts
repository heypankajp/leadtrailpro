import type { Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { normalizeCompanyName } from "@/features/trips/matching";
import { sameWebsite } from "@/lib/website-key";

/** A lead (not yet a deal) for the same company: in the inbox, marked not relevant, or archived. */
export type ExistingLeadCard = { id: number; companyName: string; status: "new" | "not_relevant"; archived: boolean; addedByName: string | null; where: string };

const whereOf = (card: { status: string; archived: boolean }) => (card.archived ? "in the Archive" : card.status === "not_relevant" ? "marked Not Relevant" : "in the Leads inbox");

/**
 * The lead a new deal would duplicate (request of November 20, 2026): the same company name (as the deal matcher compares
 * names) or the same website, among the leads that are not deals yet, archived ones included. Kept apart from the
 * repositories so `features/leads` can use it without an import cycle.
 */
export async function findExistingLeadCard(db: Queryable, company: { clientName: string; companyUrl: string }): Promise<ExistingLeadCard | null> {
  const key = normalizeCompanyName(company.clientName);
  const { rows } = await db.query(
    `SELECT o.id, o.company_name AS "companyName", o.company_key AS "companyKey", o.website, o.status, o.archived_at IS NOT NULL AS archived,
       NULLIF(CONCAT(u.first_name, ' ', u.last_name), ' ') AS "addedByName"
     FROM opportunities o LEFT JOIN users u ON u.id = o.added_by
     WHERE o.status IN ('new', 'not_relevant') AND o.deleted_at IS NULL
     ORDER BY o.archived_at IS NOT NULL, o.status = 'not_relevant', o.last_seen_at DESC`,
  );
  type Row = { id: number; companyName: string; companyKey: string; website: string; status: "new" | "not_relevant"; archived: boolean; addedByName: string | null };
  const card = (rows as Row[]).find((row) => (key && (row.companyKey === key || normalizeCompanyName(row.companyName) === key)) || sameWebsite(row.website, company.companyUrl));
  if (!card) return null;
  const archived = Boolean(card.archived);
  return { id: Number(card.id), companyName: card.companyName, status: card.status, archived, addedByName: card.addedByName?.trim() || null, where: whereOf({ status: card.status, archived }) };
}

/** Refuses a new deal for a company that is already a lead, so the person converts that lead instead (409 `lead_exists`). */
export async function refuseExistingLead(db: Queryable, company: { clientName: string; companyUrl: string }): Promise<void> {
  const card = await findExistingLeadCard(db, company);
  if (!card) return;
  throw new HttpError(409, `${card.companyName} already exists as a lead (${card.where}${card.addedByName ? `, added by ${card.addedByName}` : ""}). Convert that lead to this deal: choose its stage and status.`, {
    code: "lead_exists", lead: card,
  });
}

/**
 * Converting an existing lead from Add Deal: a lead marked not relevant or archived goes back to the inbox first, so it can be
 * claimed by the new deal like any lead in the inbox.
 */
export async function reopenLeadCard(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE opportunities SET status = 'new', reason_id = NULL, reason_scope = NULL, reason_note = '', decided_by = NULL, decided_at = NULL,
       archived_at = NULL, archived_by = NULL, archive_kind = NULL
     WHERE id = ? AND status IN ('new', 'not_relevant')`,
    [id],
  );
}
