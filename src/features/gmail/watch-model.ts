/**
 * Mailbox watch (MAIL-01, NTF-02): the pure rules behind `watch.ts`. Every few minutes the scheduler scans each connected
 * Gmail mailbox for messages newer than the last scan, keeps the ones exchanged with a lead's client addresses, stamps
 * the lead with the time the client last wrote, and tells the owner about new client emails. No app imports, so the unit
 * tests load this file directly.
 */

/** How often each mailbox is scanned; the scheduler ticks every minute and the claim in job_runs spaces the scans. */
export const mailboxWatchIntervalMinutes = 5;
/** The first scan of a mailbox looks this far back, silently (timeline and timestamps, no notifications). */
export const mailboxWatchBackfillDays = 30;
export const mailboxWatchPageSize = 100;
/** Pages per mailbox per scan; a busier mailbox continues from where it stopped at the next scan. */
export const mailboxWatchMaxPages = 5;

export type WatchMessage = {
  id: string;
  threadId: string;
  /** Gmail's internal receive time, ms since the epoch. */
  internalDate: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
};

export type WatchLead = { id: number; ownerId: number; clientName: string; clientEmails: string[] };

export type WatchMatch = {
  lead: WatchLead;
  message: WatchMessage;
  direction: "sent" | "received";
  /** The client (one of the lead's addresses) is the sender: this is what "client last replied" records. */
  clientReplied: boolean;
  /** Tell the lead owner; false on the first (backfill) scan and for mail the team sent. */
  notify: boolean;
};

export type WatchResult = { scanned: number; matched: number; notified: number; newest: number | null; truncated: boolean; failures: number };

/** `YYYY-MM-DDTHH:MM` floored to the scan interval; one scan per key across every scheduler. */
export function watchPeriodKey(now: Date): string {
  const slot = new Date(now.getTime());
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / mailboxWatchIntervalMinutes) * mailboxWatchIntervalMinutes, 0, 0);
  return slot.toISOString().slice(0, 16);
}

/** Lower-cased, de-duplicated addresses out of a From/To/Cc header value. */
export function extractAddresses(header: string | null | undefined): string[] {
  return [...new Set((header ?? "").match(/[^\s<>,;"']+@[^\s<>,;"']+/g)?.map((address) => address.toLowerCase().replace(/[.,;]+$/, "")) ?? [])];
}

/** The display name of a From header, or the address itself. */
export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/g, "").replace(/"/g, "").trim();
  return name || extractAddresses(from)[0] || "the client";
}

/** Gmail search for everything newer than the last scan (seconds precision); the first scan looks back the backfill window. */
export function gmailSearchQuery(sinceMs: number | null): string {
  const window = sinceMs === null ? `newer_than:${mailboxWatchBackfillDays}d` : `after:${Math.floor(sinceMs / 1000)}`;
  return `${window} -in:drafts -in:chats -in:spam -in:trash`;
}

/** A Gmail `users.messages.get?format=metadata` response reduced to what the watch needs; null when it is not a message. */
export function parseWatchMessage(raw: unknown): WatchMessage | null {
  const message = raw as { id?: unknown; threadId?: unknown; internalDate?: unknown; snippet?: unknown; payload?: { headers?: { name?: string; value?: string }[] } } | null;
  if (!message || typeof message.id !== "string" || !message.id) return null;
  const internalDate = Number(message.internalDate);
  if (!Number.isFinite(internalDate) || internalDate <= 0) return null;
  const header = (name: string) => message.payload?.headers?.find((item) => (item.name ?? "").toLowerCase() === name)?.value ?? "";
  return {
    id: message.id,
    threadId: typeof message.threadId === "string" ? message.threadId : "",
    internalDate,
    from: header("from"),
    to: header("to"),
    cc: header("cc"),
    subject: header("subject") || "(no subject)",
    snippet: typeof message.snippet === "string" ? message.snippet : "",
  };
}

export function messageDirection(message: WatchMessage, mailbox: string): "sent" | "received" {
  return extractAddresses(message.from).includes(mailbox.toLowerCase()) ? "sent" : "received";
}

/** Addresses on the message that could belong to a client: everyone except the team's own addresses. */
export function outsideAddresses(message: WatchMessage, teamAddresses: Set<string>): string[] {
  return [...new Set([...extractAddresses(message.from), ...extractAddresses(message.to), ...extractAddresses(message.cc)])].filter((address) => !teamAddresses.has(address));
}

/** The leads a message belongs to, with direction and whether the client wrote it. */
export function matchMessage(message: WatchMessage, mailbox: string, leads: WatchLead[], teamAddresses: Set<string>, options: { notify: boolean }): WatchMatch[] {
  const outside = new Set(outsideAddresses(message, teamAddresses));
  if (!outside.size) return [];
  const direction = messageDirection(message, mailbox);
  const senders = new Set(extractAddresses(message.from));
  return leads.flatMap((lead) => {
    const addresses = lead.clientEmails.map((address) => address.trim().toLowerCase()).filter(Boolean);
    if (!addresses.some((address) => outside.has(address))) return [];
    const clientReplied = direction === "received" && addresses.some((address) => senders.has(address));
    return [{ lead, message, direction, clientReplied, notify: options.notify && clientReplied }];
  });
}

/** A client email newer than anything the team did on the lead since: the lead is waiting for an answer. */
export function replyWaiting(lead: { lastClientEmailAt: string | null; lastTeamEmailAt: string | null; lastActivityAt: string | null }): boolean {
  if (!lead.lastClientEmailAt) return false;
  const client = new Date(lead.lastClientEmailAt).getTime();
  if (Number.isNaN(client)) return false;
  const after = (value: string | null) => { const time = value ? new Date(value).getTime() : Number.NaN; return Number.isNaN(time) || client > time; };
  return after(lead.lastTeamEmailAt) && after(lead.lastActivityAt);
}

export type MailboxWatchDeps = {
  mailbox: string;
  /** Watermark from the previous scan (ms), null on the first scan. */
  since: number | null;
  teamAddresses: Set<string>;
  listMessages(query: string, pageToken: string | null): Promise<{ ids: string[]; nextPageToken: string | null }>;
  getMessage(id: string): Promise<WatchMessage | null>;
  /** Message ids already stored for this mailbox, out of the given ids. */
  alreadySeen(ids: string[]): Promise<Set<string>>;
  /** Leads whose client emails include any of the addresses. */
  findLeads(addresses: string[]): Promise<WatchLead[]>;
  /** Stores the match (row, lead timestamps, timeline, notification). */
  record(match: WatchMatch): Promise<void>;
};

/**
 * One scan of one mailbox: newest messages first, page by page, each unseen message matched to leads by its outside
 * addresses. The returned `newest` becomes the next watermark; when the page cap was hit it is the oldest message of
 * this scan instead, so the next scan continues from there (stored matches are skipped by `alreadySeen`).
 */
export async function processMailbox(deps: MailboxWatchDeps): Promise<WatchResult> {
  const firstScan = deps.since === null;
  const query = gmailSearchQuery(deps.since);
  const result: WatchResult = { scanned: 0, matched: 0, notified: 0, newest: deps.since, truncated: false, failures: 0 };
  let oldest: number | null = null;
  let pageToken: string | null = null;
  for (let page = 0; page < mailboxWatchMaxPages; page += 1) {
    const listed = await deps.listMessages(query, pageToken);
    const seen = listed.ids.length ? await deps.alreadySeen(listed.ids) : new Set<string>();
    for (const id of listed.ids) {
      if (seen.has(id)) continue;
      let message: WatchMessage | null;
      try {
        message = await deps.getMessage(id);
      } catch {
        result.failures += 1;
        continue;
      }
      if (!message) continue;
      result.scanned += 1;
      result.newest = Math.max(result.newest ?? 0, message.internalDate);
      oldest = oldest === null ? message.internalDate : Math.min(oldest, message.internalDate);
      const outside = outsideAddresses(message, deps.teamAddresses);
      if (!outside.length) continue;
      const leads = await deps.findLeads(outside);
      for (const match of matchMessage(message, deps.mailbox, leads, deps.teamAddresses, { notify: !firstScan })) {
        await deps.record(match);
        result.matched += 1;
        if (match.notify) result.notified += 1;
      }
    }
    pageToken = listed.nextPageToken;
    if (!pageToken) break;
    if (page === mailboxWatchMaxPages - 1) result.truncated = true;
  }
  if (result.truncated && oldest !== null) result.newest = oldest;
  return result;
}
