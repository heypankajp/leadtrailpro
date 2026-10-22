/** Lead collaboration threads (COLL-01..06). */

export const mentionGroups = ["all", "admin", "recruiter", "salesmanager"] as const;
export type MentionGroup = (typeof mentionGroups)[number];
export type Mention = { kind: MentionGroup } | { kind: "user"; userId: number; name: string };

export type MessageAttachment = { id: number; fileName: string; label: string };

export type LeadMessage = {
  id: number;
  leadId: number;
  parentId: number | null;
  authorId: number;
  authorName: string;
  authorRole: string;
  /** Empty once the message is removed. */
  body: string;
  mentions: Mention[];
  attachments: MessageAttachment[];
  quoted: { id: number; authorName: string; excerpt: string } | null;
  editedAt: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  createdAt: string;
};

export type MessageThread = { root: LeadMessage; replies: LeadMessage[] };

export type MessageInput = { body: string; parentId: number | null; quotedMessageId: number | null; attachmentIds: number[] };

export const maxMessageLength = 10000;

export function parseMessageInput(value: unknown): { input: MessageInput; errors: string[] } {
  const errors: string[] = [];
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) errors.push("Write a message first.");
  if (text.length > maxMessageLength) errors.push(`Messages must be ${maxMessageLength} characters or fewer.`);
  const id = (raw: unknown, label: string): number | null => {
    if (raw === undefined || raw === null || raw === "") return null;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 1) { errors.push(`${label} is not valid.`); return null; }
    return parsed;
  };
  const attachmentIds = Array.isArray(body.attachmentIds) ? [...new Set(body.attachmentIds.map((raw) => id(raw, "Attachment")).filter((value): value is number => value !== null))] : [];
  return { input: { body: text, parentId: id(body.parentId, "Thread"), quotedMessageId: id(body.quotedMessageId, "Quoted message"), attachmentIds }, errors };
}

/** Mentions in a message: the four groups and any directory user written as `@First Last` (case-insensitive). */
export function parseMentions(body: string, directory: readonly { id: number; name: string }[]): Mention[] {
  const found: Mention[] = [];
  for (const group of mentionGroups) {
    if (new RegExp(`(^|[^\\w@])@${group}(?![\\w-])`, "i").test(body)) found.push({ kind: group });
  }
  const lower = body.toLowerCase();
  for (const user of [...directory].sort((a, b) => b.name.length - a.name.length)) {
    const name = user.name.trim();
    if (name && lower.includes(`@${name.toLowerCase()}`) && !found.some((mention) => mention.kind === "user" && mention.userId === user.id)) found.push({ kind: "user", userId: user.id, name });
  }
  return found;
}

/** Who a set of mentions reaches, given the active users and their roles; the author is left out by the caller. */
export function mentionRecipients(mentions: readonly Mention[], users: readonly { id: number; role: string; active: boolean }[]): number[] {
  const ids = new Set<number>();
  for (const mention of mentions) {
    if (mention.kind === "user") { ids.add(mention.userId); continue; }
    for (const user of users) {
      if (!user.active) continue;
      if (mention.kind === "all" || (mention.kind === "admin" && user.role === "admin") || (mention.kind === "recruiter" && user.role === "recruiter") || (mention.kind === "salesmanager" && user.role === "sales_manager")) ids.add(user.id);
    }
  }
  return [...ids];
}

export const excerptOf = (body: string, max = 160) => (body.length > max ? `${body.slice(0, max).trimEnd()}…` : body);
