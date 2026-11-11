import { toSqlDateTime, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { jobSourceLabels, type JobSourceId } from "@/features/jobs/model";
import type { UserAccount } from "@/features/users/model";
import { trackerDraft } from "./model";

/** Whether a card carries a lead drafted by the tracker import (§10.9): its first-contact date is real history, not a typed-in date. */
export async function opportunityHasDraft(db: Queryable, opportunityId: number): Promise<boolean> {
  const { rows } = await db.query("SELECT draft IS NOT NULL AS tracker FROM opportunities WHERE id = ?", [opportunityId]);
  return Boolean((rows as { tracker: boolean }[])[0]?.tracker);
}

/**
 * Turns a pool card into the lead that was just created for it (called inside the lead's transaction, so the lead
 * and the card change together). The row lock makes two people assigning the same company at once resolve to one
 * lead: the second sees who got it. A card from the sales tracker also hands its drafted timeline entries to the
 * lead, in the owner's name and with their row fingerprints, so the next import recognises those rows. Kept apart
 * from the repository so `features/leads` can import it without a cycle.
 */
export async function claimOpportunityForLead(db: Queryable, opportunityId: number, lead: { id: number; clientName: string; ownerId: number }, actor: UserAccount, now: Date) {
  const { rows } = await db.query(
    `SELECT o.status, o.lead_id AS "leadId", o.company_name AS "companyName", o.draft, CONCAT(u.first_name, ' ', u.last_name) AS "ownerName"
     FROM opportunities o LEFT JOIN leads l ON l.id = o.lead_id LEFT JOIN users u ON u.id = l.owner_id WHERE o.id = ? FOR UPDATE OF o`,
    [opportunityId],
  );
  const row = (rows as { status: string; leadId: number | null; companyName: string; draft: unknown; ownerName: string | null }[])[0];
  if (!row) throw new HttpError(404, "That opportunity no longer exists.");
  if (row.status !== "new") {
    const message = row.status === "converted" ? `${row.companyName} was already assigned to ${row.ownerName ?? "someone else"}.`
      : row.status === "attached" ? `${row.companyName} already belongs to the lead owned by ${row.ownerName ?? "someone else"}.`
      : `${row.companyName} was marked not relevant; restore it first.`;
    throw new HttpError(409, message, { opportunityStatus: row.status, leadId: row.leadId });
  }
  const nowSql = toSqlDateTime(now);
  await db.query("UPDATE opportunities SET status = 'converted', lead_id = ?, decided_by = ?, decided_at = ?, revived = FALSE, draft = NULL WHERE id = ?", [lead.id, actor.id, nowSql, opportunityId]);
  await db.query("UPDATE opportunity_listings SET lead_id = ? WHERE opportunity_id = ?", [lead.id, opportunityId]);
  const { rows: listings } = await db.query("SELECT title, url, source FROM opportunity_listings WHERE opportunity_id = ? ORDER BY posted_at DESC NULLS LAST, last_seen_at DESC, id DESC LIMIT 20", [opportunityId]);
  const draft = trackerDraft(row.draft);
  let trackerEntries = 0;
  for (const entry of draft?.entries ?? []) {
    if (!entry.summary || !entry.occurredAt) continue;
    await db.query(
      "INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, body, value_code, meta, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [lead.id, lead.ownerId, entry.type, entry.summary.slice(0, 500), entry.body, entry.valueCode, JSON.stringify(entry.meta), entry.occurredAt, nowSql],
    );
    trackerEntries += 1;
  }
  await recordAudit(db, {
    actorId: actor.id, action: "opportunity.converted", entityType: "opportunity", entityId: opportunityId, after: { leadId: lead.id, status: "converted", trackerEntries },
    details: `${actor.name} assigned ${row.companyName} as lead ${lead.clientName}${trackerEntries ? ` with ${trackerEntries} timeline entr${trackerEntries === 1 ? "y" : "ies"} from the sales tracker` : ""}`,
  }, now);
  return {
    listings: (listings as { title: string; url: string; source: JobSourceId }[]).map((item) => ({ title: item.title, url: item.url, source: jobSourceLabels[item.source] ?? item.source })),
    trackerEntries,
    trackerSheet: draft?.sheet ?? null,
  };
}
