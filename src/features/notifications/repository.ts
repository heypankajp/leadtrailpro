import { getDatabasePool, fromSqlDateTime, toSqlDateTime, type Queryable } from "@/lib/db";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { getUsersByIds } from "@/features/users/repository";
import { notificationTypes, type AppNotification, type NotificationType } from "./model";

type Row = { id: number; type: string; title: string; body: string | null; leadId: number | null; taskId: number | null; readAt: string | null; createdAt: string };

const toNotification = (row: Row): AppNotification => ({
  id: Number(row.id),
  type: notificationTypes.includes(row.type as NotificationType) ? (row.type as NotificationType) : "task_updated",
  title: row.title,
  body: row.body,
  leadId: row.leadId === null ? null : Number(row.leadId),
  taskId: row.taskId === null ? null : Number(row.taskId),
  readAt: fromSqlDateTime(row.readAt),
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
});

export type NotifyInput = {
  userIds: number[];
  /** The person who caused the event; they are never notified about their own action. */
  actorId?: number | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  leadId?: number | null;
  taskId?: number | null;
  /** Also email recipients who opted in to event emails (default true; digests email on their own). */
  email?: boolean;
};

/** Stores an in-app notification for each target and emails the ones who asked for event emails (best effort). */
export async function notifyUsers(db: Queryable, input: NotifyInput): Promise<number> {
  const targets = [...new Set(input.userIds)].filter((id) => id !== input.actorId);
  if (!targets.length) return 0;
  const now = toSqlDateTime(new Date());
  for (const userId of targets) {
    await db.query(
      "INSERT INTO notifications (user_id, type, title, body, lead_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [userId, input.type, input.title.slice(0, 200), input.body ?? null, input.leadId ?? null, input.taskId ?? null, now],
    );
  }
  if (input.email !== false && isMailerConfigured()) {
    const users = await getUsersByIds(targets, db);
    for (const user of users) {
      if (!user.active || !user.notificationPrefs.emailEvents) continue;
      try {
        await sendMail({ to: user.email, subject: `SalesTrackPro: ${input.title}`, text: `${input.title}\n\n${input.body ?? ""}`.trim() });
      } catch (error) {
        console.error("Event email failed.", error instanceof Error ? error.message : error);
      }
    }
  }
  return targets.length;
}

export async function listNotifications(userId: number, options: { limit?: number; unreadOnly?: boolean } = {}, db: Queryable = getDatabasePool()): Promise<AppNotification[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const { rows } = await db.query(
    `SELECT id, type, title, body, lead_id AS "leadId", task_id AS "taskId", read_at AS "readAt", created_at AS "createdAt" FROM notifications
     WHERE user_id = ? ${options.unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY id DESC LIMIT ${limit}`,
    [userId],
  );
  return (rows as Row[]).map(toNotification);
}

export async function unreadCount(userId: number, db: Queryable = getDatabasePool()): Promise<number> {
  const { rows } = await db.query("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]);
  return Number((rows as { count: number }[])[0].count);
}

export async function markRead(userId: number, ids: number[] | "all", db: Queryable = getDatabasePool()): Promise<number> {
  const now = toSqlDateTime(new Date());
  if (ids === "all") return (await db.query("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", [now, userId])).rowCount;
  if (!ids.length) return 0;
  return (await db.query(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`, [now, userId, ...ids])).rowCount;
}
