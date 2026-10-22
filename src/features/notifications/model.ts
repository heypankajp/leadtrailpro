/** In-app notifications (NTF-01/02) and the digests that summarise follow-ups and tasks (TASK-06, NTF-03/04). */

export const notificationTypes = [
  "task_assigned", "task_updated", "task_completed", "lead_status", "lead_transferred", "queued_lead", "queued_reviewed", "file_uploaded", "mention", "message", "daily_digest", "weekly_digest",
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export type AppNotification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  leadId: number | null;
  taskId: number | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = { notifications: AppNotification[]; unread: number };

export type DigestJob = "daily" | "weekly";
export const digestJobs: DigestJob[] = ["daily", "weekly"];
export const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `HH:MM` in a time zone for an instant. */
export function timeOfDayIn(now: Date, timeZone: string): { hour: number; minute: number } {
  const text = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(now);
  const [hour, minute] = text.split(":").map(Number);
  return { hour, minute };
}

export function weekdayOfYmd(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Whether a digest is due now: the configured time of day has passed in the business time zone (and, for the
 * weekly digest, today is the configured weekday). Whether it already ran is checked separately against job_runs.
 */
export function isDigestDue(job: DigestJob, settings: { enabled: boolean; dailyTime: string; weeklyDay: number; weeklyTime: string }, now: Date, timeZone: string, todayYmd: string): boolean {
  if (!settings.enabled) return false;
  if (job === "weekly" && weekdayOfYmd(todayYmd) !== settings.weeklyDay) return false;
  const [hour, minute] = (job === "daily" ? settings.dailyTime : settings.weeklyTime).split(":").map(Number);
  const current = timeOfDayIn(now, timeZone);
  return current.hour * 60 + current.minute >= hour * 60 + minute;
}
