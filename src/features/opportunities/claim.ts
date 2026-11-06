import { toSqlDateTime, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { jobSourceLabels, type JobSourceId } from "@/features/jobs/model";
import type { UserAccount } from "@/features/users/model";

/**
 * Turns a pool card into the lead that was just created for it (called inside the lead's transaction, so the lead
 * and the card change together). The row lock makes two people assigning the same company at once resolve to one
 * lead: the second sees who got it. Kept apart from the repository so `features/leads` can import it without a cycle.
 */
export async function claimOpportunityForLead(db: Queryable, opportunityId: number, lead: { id: number; clientName: string }, actor: UserAccount, now: Date) {
  const { rows } = await db.query(
    `SELECT o.status, o.lead_id AS "leadId", o.company_name AS "companyName", CONCAT(u.first_name, ' ', u.last_name) AS "ownerName"
     FROM opportunities o LEFT JOIN leads l ON l.id = o.lead_id LEFT JOIN users u ON u.id = l.owner_id WHERE o.id = ? FOR UPDATE OF o`,
    [opportunityId],
  );
  const row = (rows as { status: string; leadId: number | null; companyName: string; ownerName: string | null }[])[0];
  if (!row) throw new HttpError(404, "That opportunity no longer exists.");
  if (row.status !== "new") {
    const message = row.status === "converted" ? `${row.companyName} was already assigned to ${row.ownerName ?? "someone else"}.`
      : row.status === "attached" ? `${row.companyName} already belongs to the lead owned by ${row.ownerName ?? "someone else"}.`
      : `${row.companyName} was marked not relevant; restore it first.`;
    throw new HttpError(409, message, { opportunityStatus: row.status, leadId: row.leadId });
  }
  await db.query("UPDATE opportunities SET status = 'converted', lead_id = ?, decided_by = ?, decided_at = ?, revived = FALSE WHERE id = ?", [lead.id, actor.id, toSqlDateTime(now), opportunityId]);
  await db.query("UPDATE opportunity_listings SET lead_id = ? WHERE opportunity_id = ?", [lead.id, opportunityId]);
  const { rows: listings } = await db.query("SELECT title, url, source FROM opportunity_listings WHERE opportunity_id = ? ORDER BY posted_at DESC NULLS LAST, last_seen_at DESC, id DESC LIMIT 20", [opportunityId]);
  await recordAudit(db, {
    actorId: actor.id, action: "opportunity.converted", entityType: "opportunity", entityId: opportunityId, after: { leadId: lead.id, status: "converted" },
    details: `${actor.name} assigned ${row.companyName} as lead ${lead.clientName}`,
  }, now);
  return { listings: (listings as { title: string; url: string; source: JobSourceId }[]).map((item) => ({ title: item.title, url: item.url, source: jobSourceLabels[item.source] ?? item.source })) };
}
