import { fromSqlDateTime, getDatabasePool, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { removeAttachmentFile } from "@/features/attachments/storage";
import { addActivity, canEditLead, getLead } from "@/features/leads/repository";
import { getOpportunity } from "@/features/opportunities/repository";
import { hasPrivilege, type UserAccount } from "@/features/users/model";
import { restoreDaysOf, type DeletedItem, type DeletedKind } from "./model";

/**
 * Delete and restore (request of November 20, 2026). A deleted deal keeps its row with record_state "deleted" (out of every
 * list, read-only on its page); a deleted lead keeps its card with deleted_at (and archived_at, so every list leaves it out).
 * Restore Data lists both for 30 days; the scheduler then removes them for good with their notes, activities, tasks and files.
 */

const purgeAt = (deletedAt: string | null, days: number) => (deletedAt ? new Date(new Date(deletedAt).getTime() + days * 86_400_000).toISOString() : null);

/** The days in List of Values → Restore Deleted Deals and Leads Within (30 to start). */
async function restoreDaysSetting(db: Queryable): Promise<number> {
  const { rows } = await db.query("SELECT value, is_active AS active FROM list_values WHERE list_key = 'restore_days' ORDER BY sort_order, id");
  return restoreDaysOf(rows as { value: string; active: boolean }[]);
}

export function canDeleteDeal(user: UserAccount, lead: Parameters<typeof canEditLead>[1]) {
  return hasPrivilege(user, "archive_leads") && canEditLead(user, lead);
}

export async function deleteDeal(id: number, actor: UserAccount): Promise<void> {
  await withTransaction(async (connection) => {
    const lead = await getLead(id, connection);
    if (!lead) throw new HttpError(404, "Deal not found.");
    if (lead.recordState === "deleted") return;
    if (!canDeleteDeal(actor, lead)) throw new HttpError(403, "You can only delete deals you own.");
    const now = new Date();
    await connection.query(
      "UPDATE leads SET deleted_from_state = record_state, record_state = 'deleted', deleted_at = ?, deleted_by = ? WHERE id = ?",
      [toSqlDateTime(now), actor.id, id],
    );
    await addActivity(connection, { leadId: id, userId: actor.id, type: "state_change", summary: "Deal deleted", valueCode: "deleted", occurredAt: now, touch: false });
    await recordAudit(connection, {
      actorId: actor.id, action: "lead.deleted", entityType: "lead", entityId: id, before: { recordState: lead.recordState }, after: { recordState: "deleted" },
      details: `${actor.name} deleted ${lead.clientName}; it can be restored for ${await restoreDaysSetting(connection)} days`,
    }, now);
  });
}

/** Restores deleted deals to the state they had (active, queued or archived); returns how many came back. */
export async function restoreDeals(ids: number[], actor: UserAccount): Promise<number> {
  let restored = 0;
  for (const id of ids) {
    await withTransaction(async (connection) => {
      const lead = await getLead(id, connection);
      if (!lead || lead.recordState !== "deleted" || !canDeleteDeal(actor, lead)) return;
      const now = new Date();
      await connection.query(
        "UPDATE leads SET record_state = COALESCE(deleted_from_state, 'active'), deleted_from_state = NULL, deleted_at = NULL, deleted_by = NULL WHERE id = ?",
        [id],
      );
      await addActivity(connection, { leadId: id, userId: actor.id, type: "state_change", summary: "Deal restored from Restore Data", valueCode: "restored", occurredAt: now, touch: false });
      await recordAudit(connection, { actorId: actor.id, action: "lead.undeleted", entityType: "lead", entityId: id, before: { recordState: "deleted" }, after: { recordState: "restored" }, details: `${actor.name} restored the deleted deal ${lead.clientName}` }, now);
      restored += 1;
    });
  }
  return restored;
}

export async function deleteLeadCard(id: number, actor: UserAccount): Promise<void> {
  await withTransaction(async (connection) => {
    const card = await getOpportunity(id, connection);
    if (!card) throw new HttpError(404, "Lead not found.");
    if (card.status !== "new" && card.status !== "not_relevant") throw new HttpError(409, `${card.companyName} is a deal now: delete the deal instead.`);
    const { rows } = await connection.query("SELECT deleted_at IS NOT NULL AS deleted FROM opportunities WHERE id = ?", [id]);
    if ((rows as { deleted: boolean }[])[0]?.deleted) return;
    const now = toSqlDateTime(new Date());
    await connection.query(
      "UPDATE opportunities SET deleted_was_archived = archived_at IS NOT NULL, archived_at = COALESCE(archived_at, ?), deleted_at = ?, deleted_by = ? WHERE id = ?",
      [now, now, actor.id, id],
    );
    await recordAudit(connection, { actorId: actor.id, action: "opportunity.deleted", entityType: "opportunity", entityId: id, after: { deleted: true }, details: `${actor.name} deleted the lead ${card.companyName}; it can be restored for ${await restoreDaysSetting(connection)} days` });
  });
}

export async function restoreLeadCards(ids: number[], actor: UserAccount): Promise<number> {
  let restored = 0;
  for (const id of ids) {
    await withTransaction(async (connection) => {
      const result = await connection.query(
        `UPDATE opportunities SET archived_at = CASE WHEN deleted_was_archived THEN archived_at ELSE NULL END,
           archived_by = CASE WHEN deleted_was_archived THEN archived_by ELSE NULL END, archive_kind = CASE WHEN deleted_was_archived THEN archive_kind ELSE NULL END,
           deleted_at = NULL, deleted_by = NULL, deleted_was_archived = FALSE
         WHERE id = ? AND deleted_at IS NOT NULL RETURNING company_name AS "companyName"`,
        [id],
      );
      const name = (result.rows as { companyName: string }[])[0]?.companyName;
      if (!name) return;
      await recordAudit(connection, { actorId: actor.id, action: "opportunity.undeleted", entityType: "opportunity", entityId: id, after: { deleted: false }, details: `${actor.name} restored the deleted lead ${name}` });
      restored += 1;
    });
  }
  return restored;
}

type DealRow = { id: number; title: string; deletedByName: string | null; deletedAt: string; stage: string | null; status: string; contact: string; city: string | null; ownerName: string; ownerId: number };
type LeadRow = { id: number; title: string; deletedByName: string | null; deletedAt: string; status: string; contact: string | null; city: string; ownerName: string | null; manual: boolean };

/** Everything deleted in the last 30 days, latest first, with whether the viewer may restore it. */
export async function listDeleted(kind: DeletedKind, viewer: UserAccount, db: Queryable = getDatabasePool()): Promise<DeletedItem[]> {
  const days = await restoreDaysSetting(db);
  if (kind === "deals") {
    const { rows } = await db.query(
      `SELECT l.id, l.client_name AS title, NULLIF(TRIM(CONCAT(d.first_name, ' ', d.last_name)), '') AS "deletedByName", l.deleted_at AS "deletedAt",
         sg.value AS stage, st.value AS status, l.client_executive AS contact, ci.value AS city, TRIM(CONCAT(o.first_name, ' ', o.last_name)) AS "ownerName", l.owner_id AS "ownerId"
       FROM leads l JOIN users o ON o.id = l.owner_id JOIN list_values st ON st.id = l.status_id
       LEFT JOIN users d ON d.id = l.deleted_by LEFT JOIN list_values sg ON sg.id = l.stage_id LEFT JOIN list_values ci ON ci.id = l.city_id
       WHERE l.record_state = 'deleted' ORDER BY l.deleted_at DESC, l.id DESC`,
    );
    const mayRestoreAny = hasPrivilege(viewer, "archive_leads") && hasPrivilege(viewer, "edit_any_lead");
    const mayRestoreOwn = hasPrivilege(viewer, "archive_leads") && hasPrivilege(viewer, "edit_leads");
    return (rows as DealRow[]).map((row) => {
      const deletedAt = fromSqlDateTime(row.deletedAt) ?? row.deletedAt;
      return {
        kind: "deal", id: Number(row.id), title: row.title, deletedByName: row.deletedByName, deletedAt, purgeAt: purgeAt(deletedAt, days)!,
        stage: row.stage, status: row.status, contact: row.contact || null, city: row.city, ownerName: row.ownerName, origin: null,
        canRestore: mayRestoreAny || (mayRestoreOwn && Number(row.ownerId) === viewer.id),
      };
    });
  }
  const { rows } = await db.query(
    `SELECT o.id, o.company_name AS title, NULLIF(TRIM(CONCAT(d.first_name, ' ', d.last_name)), '') AS "deletedByName", o.deleted_at AS "deletedAt",
       o.status, (SELECT p.name FROM opportunity_persons op JOIN persons p ON p.id = op.person_id WHERE op.opportunity_id = o.id ORDER BY op.position LIMIT 1) AS contact,
       o.location AS city, NULLIF(TRIM(CONCAT(a.first_name, ' ', a.last_name)), '') AS "ownerName", (o.added_by IS NOT NULL OR o.draft IS NOT NULL OR o.listings_count = 0) AS manual
     FROM opportunities o LEFT JOIN users d ON d.id = o.deleted_by LEFT JOIN users a ON a.id = o.added_by
     WHERE o.deleted_at IS NOT NULL ORDER BY o.deleted_at DESC, o.id DESC`,
  );
  const mayRestore = hasPrivilege(viewer, "create_leads");
  return (rows as LeadRow[]).map((row) => {
    const deletedAt = fromSqlDateTime(row.deletedAt) ?? row.deletedAt;
    return {
      kind: "lead", id: Number(row.id), title: row.title, deletedByName: row.deletedByName, deletedAt, purgeAt: purgeAt(deletedAt, days)!,
      stage: null, status: row.status === "not_relevant" ? "Not Relevant" : "In the inbox", contact: row.contact, city: row.city || null, ownerName: row.ownerName,
      origin: row.manual ? "manual" : "found", canRestore: mayRestore,
    };
  });
}

/** The scheduler's sweep: deals and leads deleted longer ago than the days set (30 to start) are removed for good, files included. */
export async function purgeDeleted(now = new Date(), db: Queryable = getDatabasePool()): Promise<{ deals: number; leads: number; days: number }> {
  const days = await restoreDaysSetting(db);
  const cutoff = toSqlDateTime(new Date(now.getTime() - days * 86_400_000));
  const { rows: files } = await db.query(
    `SELECT storage_key AS key FROM lead_attachments WHERE lead_id IN (SELECT id FROM leads WHERE record_state = 'deleted' AND deleted_at < ?)
     UNION ALL SELECT ta.storage_key FROM task_attachments ta JOIN tasks t ON t.id = ta.task_id WHERE t.lead_id IN (SELECT id FROM leads WHERE record_state = 'deleted' AND deleted_at < ?)`,
    [cutoff, cutoff],
  );
  const deals = await db.query("DELETE FROM leads WHERE record_state = 'deleted' AND deleted_at < ? RETURNING id, client_name AS name", [cutoff]);
  const leads = await db.query("DELETE FROM opportunities WHERE deleted_at IS NOT NULL AND deleted_at < ? RETURNING id, company_name AS name", [cutoff]);
  for (const file of files as { key: string }[]) await removeAttachmentFile(file.key).catch(() => undefined);
  const dealCount = deals.rowCount ?? 0;
  const leadCount = leads.rowCount ?? 0;
  if (dealCount + leadCount > 0) {
    await recordAudit(db, {
      actorId: null, action: "deleted.purged", entityType: "lead", after: { deals: dealCount, leads: leadCount },
      details: `${dealCount} ${dealCount === 1 ? "deal" : "deals"} and ${leadCount} ${leadCount === 1 ? "lead" : "leads"} deleted over ${days} days ago removed for good`,
    });
  }
  return { deals: dealCount, leads: leadCount, days };
}
