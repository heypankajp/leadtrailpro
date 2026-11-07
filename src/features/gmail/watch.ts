/**
 * Mailbox watch (MAIL-01, NTF-02): the scheduled scan of every connected Gmail mailbox for mail exchanged with leads.
 * Rules live in `watch-model.ts`; this file does the database and Gmail calls. Runs from `POST /api/jobs/run` and is
 * spaced by a `job_runs` claim per `watchPeriodKey`, so several schedulers never scan the same slot twice.
 *
 * Per matched message: a `lead_emails` row (one per lead), `leads.last_client_email_at` when the client is the sender,
 * `leads.last_team_email_at` when the mailbox sent it, a timeline entry for received mail (not counted as sales
 * activity), and an `email_received` notification to the lead owner for client replies found after the first scan.
 */
import { getDatabasePool, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { getSettings } from "@/features/settings/repository";
import { addActivity } from "@/features/leads/repository";
import { notifyUsers } from "@/features/notifications/repository";
import { accessTokenFor, decryptStoredToken, gmailApiUri, googleConfig } from "./gmail";
import {
  mailboxWatchPageSize, parseWatchMessage, processMailbox, senderName, watchPeriodKey,
  type WatchLead, type WatchMatch, type WatchMessage,
} from "./watch-model";

export type MailboxWatchSummary = {
  periodKey: string;
  mailboxes: number;
  scanned: number;
  matched: number;
  notified: number;
  /** Mailboxes whose scan failed (token revoked, Gmail unavailable) plus single messages that could not be read. */
  failures: number;
};

type ConnectionRow = { userId: number; googleEmail: string; token: string; watchSince: string | null };

const gmailHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

async function listMessages(accessToken: string, query: string, pageToken: string | null): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const url = new URL(`${gmailApiUri()}/gmail/v1/users/me/messages`);
  url.searchParams.set("maxResults", String(mailboxWatchPageSize));
  url.searchParams.set("q", query);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = await fetch(url, { headers: gmailHeaders(accessToken), cache: "no-store" });
  if (!response.ok) throw new Error(`Gmail could not list messages (HTTP ${response.status}).`);
  const data = await response.json() as { messages?: { id: string }[]; nextPageToken?: string };
  return { ids: (data.messages ?? []).map((item) => item.id), nextPageToken: data.nextPageToken ?? null };
}

async function getMessage(accessToken: string, id: string): Promise<WatchMessage | null> {
  const url = new URL(`${gmailApiUri()}/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "metadata");
  for (const header of ["From", "To", "Cc", "Subject"]) url.searchParams.append("metadataHeaders", header);
  const response = await fetch(url, { headers: gmailHeaders(accessToken), cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Gmail could not read message ${id} (HTTP ${response.status}).`);
  return parseWatchMessage(await response.json());
}

/** Active leads whose client emails include any of the addresses (the JSON column is searched as text, then checked exactly). */
async function findLeads(db: Queryable, addresses: string[]): Promise<WatchLead[]> {
  if (!addresses.length) return [];
  const clauses = addresses.map(() => "LOWER(l.client_emails::text) LIKE ?");
  const { rows } = await db.query(
    `SELECT l.id, l.owner_id AS "ownerId", l.client_name AS "clientName", l.client_emails AS "clientEmails" FROM leads l WHERE l.record_state = 'active' AND (${clauses.join(" OR ")})`,
    addresses.map((address) => `%${address.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`),
  );
  return (rows as { id: number; ownerId: number; clientName: string; clientEmails: unknown }[]).map((row) => ({
    id: Number(row.id), ownerId: Number(row.ownerId), clientName: row.clientName, clientEmails: parseClientEmails(row.clientEmails),
  }));
}

function parseClientEmails(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return value.split(/[,;\s]+/).filter(Boolean); }
  }
  return [];
}

async function alreadySeen(db: Queryable, mailbox: string, ids: string[]): Promise<Set<string>> {
  const { rows } = await db.query("SELECT DISTINCT gmail_message_id AS id FROM lead_emails WHERE mailbox = ? AND gmail_message_id = ANY(?)", [mailbox, ids]);
  return new Set((rows as { id: string }[]).map((row) => row.id));
}

/** Stores one match: the row, the lead's timestamps, the timeline entry, and the owner's notification. */
async function recordMatch(connection: ConnectionRow, match: WatchMatch): Promise<void> {
  const { lead, message, direction } = match;
  const receivedAt = toSqlDateTime(new Date(message.internalDate));
  await withTransaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO lead_emails (lead_id, user_id, mailbox, gmail_message_id, thread_id, direction, from_address, subject, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (mailbox, gmail_message_id, lead_id) DO NOTHING RETURNING id`,
      [lead.id, connection.userId, connection.googleEmail.toLowerCase(), message.id, message.threadId, direction, message.from.slice(0, 254), message.subject.slice(0, 500), receivedAt, toSqlDateTime(new Date())],
    );
    if (!inserted.rows.length) return;
    if (match.clientReplied) {
      await db.query("UPDATE leads SET last_client_email_at = GREATEST(COALESCE(last_client_email_at, '1970-01-01'::timestamp), ?::timestamp) WHERE id = ?", [receivedAt, lead.id]);
    } else if (direction === "sent") {
      await db.query("UPDATE leads SET last_team_email_at = GREATEST(COALESCE(last_team_email_at, '1970-01-01'::timestamp), ?::timestamp) WHERE id = ?", [receivedAt, lead.id]);
    }
    if (direction === "received") {
      await addActivity(db, {
        leadId: lead.id, userId: connection.userId, type: "email", touch: false, occurredAt: new Date(message.internalDate),
        summary: `Email from ${senderName(message.from)}: ${message.subject}`.slice(0, 500),
        body: message.snippet ? message.snippet.slice(0, 1000) : null,
        meta: { gmail: true, direction, mailbox: connection.googleEmail, messageId: message.id, threadId: message.threadId, clientReplied: match.clientReplied },
      });
    }
    if (match.notify) {
      await notifyUsers(db, {
        userIds: [lead.ownerId], actorId: null, type: "email_received", leadId: lead.id,
        title: `${lead.clientName} wrote by email: ${message.subject}`.slice(0, 200),
        body: `${senderName(message.from)} wrote to ${connection.googleEmail}${message.snippet ? `: ${message.snippet.slice(0, 240)}` : "."}`,
      });
    }
  });
}

/**
 * The scheduled scan. Returns null when Gmail is not configured, the switch is off, or this interval was already
 * claimed; otherwise the counts for the scheduler's log. One mailbox failing never stops the others.
 */
export async function runMailboxWatch(now = new Date(), db: Queryable = getDatabasePool()): Promise<MailboxWatchSummary | null> {
  if (!googleConfig()) return null;
  const settings = await getSettings(db);
  if (!settings.email.watchMailboxes) return null;
  const periodKey = watchPeriodKey(now);
  const claim = await db.query("INSERT INTO job_runs (job, period_key, status, started_at) VALUES ('mailbox_watch', ?, 'running', ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id", [periodKey, toSqlDateTime(now)]);
  if (!claim.rows.length) return null;
  const jobRunId = Number(claim.rows[0].id);
  const summary: MailboxWatchSummary = { periodKey, mailboxes: 0, scanned: 0, matched: 0, notified: 0, failures: 0 };
  try {
    const { rows } = await db.query(
      `SELECT g.user_id AS "userId", g.google_email AS "googleEmail", g.refresh_token_encrypted AS token, g.watch_since AS "watchSince"
       FROM gmail_connections g JOIN users u ON u.id = g.user_id WHERE u.is_active = TRUE ORDER BY g.user_id`,
    );
    const connections = (rows as ConnectionRow[]).map((row) => ({ ...row, userId: Number(row.userId) }));
    const team = await db.query("SELECT LOWER(email) AS email FROM users UNION SELECT LOWER(google_email) FROM gmail_connections");
    const teamAddresses = new Set((team.rows as { email: string }[]).map((row) => row.email));
    for (const connection of connections) {
      summary.mailboxes += 1;
      const mailbox = connection.googleEmail.toLowerCase();
      const since = connection.watchSince ? new Date(connection.watchSince.includes("T") ? connection.watchSince : `${connection.watchSince.replace(" ", "T")}Z`).getTime() : null;
      try {
        const accessToken = await accessTokenFor(decryptStoredToken(connection.token));
        const result = await processMailbox({
          mailbox, since: Number.isFinite(since) ? since : null, teamAddresses,
          listMessages: (query, pageToken) => listMessages(accessToken, query, pageToken),
          getMessage: (id) => getMessage(accessToken, id),
          alreadySeen: (ids) => alreadySeen(db, mailbox, ids),
          findLeads: (addresses) => findLeads(db, addresses),
          record: (match) => recordMatch(connection, match),
        });
        summary.scanned += result.scanned;
        summary.matched += result.matched;
        summary.notified += result.notified;
        summary.failures += result.failures;
        const watermark = result.newest ?? (since ?? now.getTime());
        await db.query("UPDATE gmail_connections SET watch_since = ?, watch_checked_at = ? WHERE user_id = ?", [toSqlDateTime(new Date(watermark)), toSqlDateTime(new Date()), connection.userId]);
      } catch (error) {
        summary.failures += 1;
        console.error(`Mailbox watch failed for ${connection.googleEmail}.`, error instanceof Error ? error.message : error);
        await db.query("UPDATE gmail_connections SET watch_checked_at = ? WHERE user_id = ?", [toSqlDateTime(new Date()), connection.userId]).catch(() => undefined);
      }
    }
    const status = summary.failures === 0 ? "success" : summary.failures < Math.max(1, summary.mailboxes) ? "partial" : "failed";
    await db.query("UPDATE job_runs SET status = ?, finished_at = ?, details = ? WHERE id = ?", [status, toSqlDateTime(new Date()), `${summary.mailboxes} mailboxes, ${summary.scanned} messages, ${summary.matched} matched, ${summary.notified} notified, ${summary.failures} failures`, jobRunId]);
    return summary;
  } catch (error) {
    await db.query("UPDATE job_runs SET status = 'failed', finished_at = ?, details = ? WHERE id = ?", [toSqlDateTime(new Date()), (error instanceof Error ? error.message : "failed").slice(0, 500), jobRunId]).catch(() => undefined);
    throw error;
  }
}
