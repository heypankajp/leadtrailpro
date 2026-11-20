import { getDatabasePool, toSqlDateTime, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { getUsersByIds } from "@/features/users/repository";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { buildStageReminderEmail, type ReminderDealSnapshot } from "./stage-reminder-email";
import type { UserAccount } from "@/features/users/model";

/**
 * Auto reminders per pipeline stage (request of November 20, 2026): when a deal has been in its stage for the days set for
 * that stage (List of Values → Auto Reminder, 3 to start), its owner gets one reminder: in the app and by email when they
 * receive event emails. One reminder per time the deal enters the stage; clients, lost and disqualified deals, archived and
 * queued deals are left out. The scheduler's every-minute run sends what is due, one message per owner listing their deals.
 */

export const defaultReminderDays = 3;
/** `count`: how many reminders (No. of Reminders, request of November 20, 2026), each `days` after the one before. */
export type StageReminder = { stageId: number; stage: string; pipeline: string | null; days: number; count: number; active: boolean };

/** Every stage with its reminder: the days and whether it is on (a stage without a row yet is 3 days, on). */
export async function listStageReminders(db: Queryable = getDatabasePool()): Promise<StageReminder[]> {
  const { rows } = await db.query(
    `SELECT s.id AS "stageId", s.value AS stage, p.name AS pipeline, COALESCE(r.days, ${defaultReminderDays}) AS days, COALESCE(r.reminder_count, 1) AS count, COALESCE(r.is_active, TRUE) AS active
     FROM list_values s LEFT JOIN stage_reminders r ON r.stage_id = s.id LEFT JOIN pipelines p ON p.id = s.pipeline_id
     WHERE s.list_key = 'stage' AND s.is_active = TRUE
     ORDER BY p.id NULLS FIRST, s.sort_order, s.value`,
  );
  return (rows as StageReminder[]).map((row) => ({ ...row, stageId: Number(row.stageId), days: Number(row.days), count: Number(row.count), active: Boolean(row.active) }));
}

/** Saves one stage's reminder: days from 1 to 365, 1 to 10 reminders, on or off. */
export async function saveStageReminder(stageId: number, days: number, count: number, active: boolean, actor: UserAccount, db: Queryable = getDatabasePool()): Promise<StageReminder[]> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, "Days must be a whole number from 1 to 365.");
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new HttpError(400, "The number of reminders must be a whole number from 1 to 10.");
  const { rows } = await db.query("SELECT value FROM list_values WHERE id = ? AND list_key = 'stage'", [stageId]);
  const stage = (rows as { value: string }[])[0];
  if (!stage) throw new HttpError(404, "Pipeline stage not found.");
  await db.query(
    "INSERT INTO stage_reminders (stage_id, days, reminder_count, is_active, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (stage_id) DO UPDATE SET days = EXCLUDED.days, reminder_count = EXCLUDED.reminder_count, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at",
    [stageId, days, count, active, toSqlDateTime(new Date())],
  );
  await recordAudit(db, { actorId: actor.id, action: "setting.updated", entityType: "setting", after: { stage: stage.value, days, count, active }, details: `${actor.name} set the auto reminder of ${stage.value} to ${active ? `${count} ${count === 1 ? "reminder" : "reminders"} every ${days} ${days === 1 ? "day" : "days"}` : "off"}` });
  return listStageReminders(db);
}

type DueRow = { leadId: number; clientName: string; ownerId: number; stageId: number; stage: string; enteredAt: string; days: number; total: number; sent: number };

/** The scheduler's run: reminds each owner of their deals that stayed in a stage longer than its days. */
export async function runStageReminders(now = new Date(), db: Queryable = getDatabasePool()): Promise<{ deals: number; owners: number }> {
  const { rows } = await db.query(
    `WITH current AS (
       SELECT l.id, l.client_name, l.owner_id, l.stage_id, s.value AS stage,
         COALESCE((SELECT MAX(a.occurred_at) FROM lead_activities a WHERE a.lead_id = l.id AND a.activity_type = 'stage_change' AND a.value_code = s.code), l.created_at) AS entered_at
       FROM leads l
       JOIN list_values s ON s.id = l.stage_id
       JOIN list_values st ON st.id = l.status_id
       WHERE l.record_state = 'active' AND st.code NOT IN ('client', 'lost', 'disqualified')
     )
     SELECT c.id AS "leadId", c.client_name AS "clientName", c.owner_id AS "ownerId", c.stage_id AS "stageId", c.stage, c.entered_at AS "enteredAt",
       COALESCE(r.days, ${defaultReminderDays}) AS days, COALESCE(r.reminder_count, 1) AS total, sent.n AS sent
     FROM current c
     LEFT JOIN stage_reminders r ON r.stage_id = c.stage_id
     CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM stage_reminder_log g WHERE g.lead_id = c.id AND g.stage_id = c.stage_id AND g.entered_at = c.entered_at) sent
     WHERE COALESCE(r.is_active, TRUE)
       -- The next reminder (No. of Reminders, request of November 20, 2026): one interval after the stage was entered, then one
       -- interval after each reminder, until the number set is reached.
       AND sent.n < COALESCE(r.reminder_count, 1)
       AND c.entered_at <= ?::timestamp - make_interval(days => COALESCE(r.days, ${defaultReminderDays}) * (sent.n + 1))
     ORDER BY c.owner_id, c.entered_at
     LIMIT 500`,
    [toSqlDateTime(now)],
  );
  const due = rows as DueRow[];
  if (!due.length) return { deals: 0, owners: 0 };
  const byOwner = new Map<number, DueRow[]>();
  for (const row of due) byOwner.set(Number(row.ownerId), [...(byOwner.get(Number(row.ownerId)) ?? []), row]);
  const daysIn = (enteredAt: string) => Math.max(1, Math.floor((now.getTime() - new Date(`${String(enteredAt).replace(" ", "T")}Z`).getTime()) / 86_400_000));
  const dayCount = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  for (const [ownerId, deals] of byOwner) {
    // Logged first: a failed email never sends the same reminder again on the next minute.
    for (const deal of deals) {
      await db.query("INSERT INTO stage_reminder_log (lead_id, stage_id, entered_at, reminder_no, sent_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", [deal.leadId, deal.stageId, deal.enteredAt, Number(deal.sent) + 1, toSqlDateTime(now)]);
    }
    const title = deals.length === 1
      ? `${deals[0].clientName} has been in ${deals[0].stage} for ${dayCount(daysIn(deals[0].enteredAt))}`
      : `${deals.length} deals have been in their stage longer than set`;
    // The email (request of November 20, 2026): a snapshot of each deal and its latest emails with the client, always sent to
    // the owner as a system reminder when mail is set up; the in-app notification carries the short list.
    await emailReminder(db, ownerId, deals.map((deal) => ({ leadId: Number(deal.leadId), daysInStage: daysIn(deal.enteredAt), reminder: Number(deal.total) > 1 ? `reminder ${Number(deal.sent) + 1} of ${Number(deal.total)}, every ${dayCount(Number(deal.days))}` : `reminder after ${dayCount(Number(deal.days))}` })));
    const which = (deal: DueRow) => (Number(deal.total) > 1 ? `reminder ${Number(deal.sent) + 1} of ${Number(deal.total)}, every ${dayCount(Number(deal.days))}` : `reminder after ${dayCount(Number(deal.days))}`);
    const body = deals.map((deal) => `${deal.clientName}: ${deal.stage} for ${dayCount(daysIn(deal.enteredAt))} (${which(deal)})`).join("\n");
    await notifyUsers(db, { userIds: [ownerId], actorId: null, type: "stage_reminder", title, body, leadId: deals.length === 1 ? Number(deals[0].leadId) : undefined, email: false });
  }
  return { deals: due.length, owners: byOwner.size };
}

const appLink = (hash: string) => { const base = process.env.APP_URL?.trim(); return base ? `${base.replace(/\/$/, "")}/#/${hash}` : null; };

/** Each deal's snapshot for the email: stage, status, value, contact, dates, next step and its latest five emails with the client. */
export async function dealSnapshots(items: { leadId: number; daysInStage: number; reminder: string }[], db: Queryable = getDatabasePool()): Promise<ReminderDealSnapshot[]> {
  if (!items.length) return [];
  const { rows } = await db.query(
    `SELECT l.id, l.client_name AS "clientName", s.value AS stage, st.value AS status, sr.value AS "statusReason", l.client_executive AS contact, l.contact_phone AS phone,
       l.client_emails AS emails, ci.value AS city, l.deal_value AS "dealValue", CONCAT(o.first_name, ' ', o.last_name) AS "ownerName",
       TO_CHAR(l.first_contact_date, 'YYYY-MM-DD') AS "firstContactDate", l.last_activity_at AS "lastActivityAt", TO_CHAR(l.follow_up_date, 'YYYY-MM-DD') AS "followUpDate",
       (SELECT a.summary FROM lead_activities a WHERE a.lead_id = l.id ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) AS "lastActivity",
       (SELECT json_build_object('title', t.title, 'dueAt', t.due_at) FROM tasks t WHERE t.lead_id = l.id AND t.status = 'open' ORDER BY t.due_at ASC NULLS LAST, t.id LIMIT 1) AS "nextTask",
       (SELECT COALESCE(json_agg(json_build_object('direction', e.direction, 'from', e.from_address, 'subject', e.subject, 'at', e.received_at) ORDER BY e.received_at DESC), '[]'::json)
          FROM (SELECT DISTINCT ON (gmail_message_id) direction, from_address, subject, received_at, gmail_message_id FROM lead_emails WHERE lead_id = l.id ORDER BY gmail_message_id, received_at DESC) e
          WHERE e.received_at IS NOT NULL) AS "clientEmails"
     FROM leads l
     JOIN list_values s ON s.id = l.stage_id
     JOIN list_values st ON st.id = l.status_id
     LEFT JOIN list_values sr ON sr.id = l.status_reason_id
     LEFT JOIN list_values ci ON ci.id = l.city_id
     JOIN users o ON o.id = l.owner_id
     WHERE l.id = ANY(?::int[])`,
    [items.map((item) => item.leadId)],
  );
  const parse = <T,>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;
  type Row = { id: number; clientName: string; stage: string; status: string; statusReason: string | null; contact: string; phone: string; emails: unknown; city: string | null; dealValue: string | number | null; ownerName: string; firstContactDate: string | null; lastActivityAt: string | null; followUpDate: string | null; lastActivity: string | null; nextTask: unknown; clientEmails: unknown };
  const byId = new Map((rows as Row[]).map((row) => [Number(row.id), row]));
  return items.flatMap((item) => {
    const row = byId.get(item.leadId);
    if (!row) return [];
    const task = parse<{ title: string; dueAt: string | null } | null>(row.nextTask);
    const emails = (parse<{ direction: "sent" | "received"; from: string; subject: string; at: string }[] | null>(row.clientEmails) ?? []).slice(0, 5);
    return [{
      id: Number(row.id), clientName: row.clientName, stage: row.stage, status: row.statusReason ? `${row.status} – ${row.statusReason}` : row.status,
      daysInStage: item.daysInStage, reminder: item.reminder, contact: row.contact ?? "", phone: row.phone ?? "", emails: parse<string[] | null>(row.emails) ?? [],
      city: row.city ?? "", dealValue: row.dealValue === null ? null : Number(row.dealValue), ownerName: row.ownerName,
      firstContactDate: row.firstContactDate, lastActivityAt: row.lastActivityAt ? String(row.lastActivityAt) : null, lastActivity: row.lastActivity,
      followUpDate: row.followUpDate, nextTask: task ? { title: task.title, dueAt: task.dueAt ? String(task.dueAt) : null } : null,
      link: appLink(`deal/${row.id}`), clientEmails: emails.map((email) => ({ ...email, at: String(email.at) })),
    }];
  });
}

/** Sends one owner their reminder email (a system reminder: sent whatever their event-email preference, when mail is set up). */
async function emailReminder(db: Queryable, ownerId: number, items: { leadId: number; daysInStage: number; reminder: string }[]): Promise<void> {
  if (!isMailerConfigured()) return;
  const [owner] = await getUsersByIds([ownerId], db);
  if (!owner?.active || !owner.email) return;
  const email = buildStageReminderEmail(owner.name, await dealSnapshots(items, db));
  try { await sendMail({ to: owner.email, ...email }); } catch (error) { console.error("Stage reminder email failed.", error instanceof Error ? error.message : error); }
}

/**
 * A sample of the reminder email (request of November 20, 2026), from List of Values → Auto Reminder: up to three active deals
 * (the sender's own first), each shown as if it were due, sent to the address given.
 */
export async function sendSampleStageReminder(to: string, actor: UserAccount, db: Queryable = getDatabasePool()): Promise<{ deals: number }> {
  const address = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) throw new HttpError(400, "Enter a valid email address.");
  const { rows } = await db.query(
    `SELECT l.id, s.code AS "stageCode",
       COALESCE((SELECT MAX(a.occurred_at) FROM lead_activities a WHERE a.lead_id = l.id AND a.activity_type = 'stage_change' AND a.value_code = s.code), l.created_at) AS "enteredAt",
       COALESCE(r.days, ${defaultReminderDays}) AS days
     FROM leads l JOIN list_values s ON s.id = l.stage_id JOIN list_values st ON st.id = l.status_id LEFT JOIN stage_reminders r ON r.stage_id = l.stage_id
     WHERE l.record_state = 'active' AND st.code NOT IN ('client', 'lost', 'disqualified')
     ORDER BY (l.owner_id = ?) DESC, l.last_activity_at DESC LIMIT 3`,
    [actor.id],
  );
  const now = Date.now();
  const items = (rows as { id: number; enteredAt: string; days: number }[]).map((row) => ({
    leadId: Number(row.id), daysInStage: Math.max(1, Math.floor((now - new Date(`${String(row.enteredAt).replace(" ", "T")}Z`).getTime()) / 86_400_000)),
    reminder: `reminder after ${row.days} ${Number(row.days) === 1 ? "day" : "days"}`,
  }));
  if (!items.length) throw new HttpError(409, "No open deal to show in the sample.");
  const email = buildStageReminderEmail(actor.name, await dealSnapshots(items, db), { sample: true });
  await sendMail({ to: address, ...email });
  await recordAudit(db, { actorId: actor.id, action: "setting.sample_sent", entityType: "setting", after: { to: address, deals: items.length }, details: `${actor.name} sent a sample stage reminder email to ${address}` });
  return { deals: items.length };
}
