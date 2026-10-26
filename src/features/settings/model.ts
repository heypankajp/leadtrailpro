import type { JobSourceSettings } from "@/features/jobs/model";
import type { SystemRole } from "@/features/users/model";

/** A non-working day in the business calendar (public holiday, company closure). */
export type Holiday = { date: string; name: string };

/**
 * TASK-05: a needs-attention rule. `statusId` and `bdActionId` are list-value ids (null = any); `days` is how long a
 * lead may go without recorded activity before it is flagged. The most specific rule wins (see resolveInactivityDays).
 */
export type InactivityRule = { statusId: number | null; bdActionId: number | null; days: number };

export type ReminderSettings = { inactivityDays: number; rules: InactivityRule[] };

/** TASK-06 / NTF-04: when the daily and weekly digests go out (business timezone; weeklyDay 0 = Sunday … 6 = Saturday). */
export type DigestSettings = { enabled: boolean; dailyTime: string; weeklyDay: number; weeklyTime: string };
export const defaultDigests: DigestSettings = { enabled: true, dailyTime: "07:30", weeklyDay: 1, weeklyTime: "07:30" };

export function normalizeDigests(value: unknown): { digests: DigestSettings; error: string | null } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const time = (key: "dailyTime" | "weeklyTime") => (typeof record[key] === "string" ? (record[key] as string).trim() : defaultDigests[key]);
  const dailyTime = time("dailyTime");
  const weeklyTime = time("weeklyTime");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(weeklyTime)) return { digests: defaultDigests, error: "Digest times must be HH:MM." };
  const weeklyDay = record.weeklyDay === undefined ? defaultDigests.weeklyDay : Number(record.weeklyDay);
  if (!Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6) return { digests: defaultDigests, error: "The weekly digest day must be a weekday number from 0 (Sunday) to 6 (Saturday)." };
  return { digests: { enabled: record.enabled === undefined ? defaultDigests.enabled : record.enabled === true, dailyTime, weeklyDay, weeklyTime }, error: null };
}

export type AppSettings = {
  roleLabels: Record<SystemRole, string>;
  reminders: ReminderSettings;
  digests: DigestSettings;
  /** TRIP-06: order, budgets, cache life, and prefetch count of the job-listing sources (SPEC §7.13). */
  jobSources: JobSourceSettings;
  /** Sorted by date. Used with weekends for "yesterday" in reports and for natural-language due dates. */
  holidays: Holiday[];
};

export const maxHolidays = 400;
export const maxHolidayNameLength = 80;
export const maxInactivityRules = 50;
export const maxInactivityDays = 365;

/** Status + BD action beats BD action alone, which beats status alone, which beats the default number of days. */
export function resolveInactivityDays(lead: { statusId: number; bdActionId: number | null }, reminders: ReminderSettings): number {
  const rules = reminders.rules;
  const exact = rules.find((rule) => rule.statusId === lead.statusId && rule.bdActionId !== null && rule.bdActionId === lead.bdActionId);
  if (exact) return exact.days;
  const byAction = rules.find((rule) => rule.statusId === null && rule.bdActionId !== null && rule.bdActionId === lead.bdActionId);
  if (byAction) return byAction.days;
  const byStatus = rules.find((rule) => rule.bdActionId === null && rule.statusId === lead.statusId);
  if (byStatus) return byStatus.days;
  return reminders.inactivityDays;
}

/** Keeps well-formed rules; later duplicates of the same status/action pair replace earlier ones. */
export function normalizeInactivityRules(value: unknown): { rules: InactivityRule[]; error: string | null } {
  if (!Array.isArray(value)) return { rules: [], error: "Reminder rules must be a list." };
  if (value.length > maxInactivityRules) return { rules: [], error: `Keep the reminder rules to ${maxInactivityRules} or fewer.` };
  const byKey = new Map<string, InactivityRule>();
  for (const entry of value) {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const id = (raw: unknown) => (raw === null || raw === undefined || raw === "" ? null : Number(raw));
    const statusId = id(record.statusId);
    const bdActionId = id(record.bdActionId);
    const days = Number(record.days);
    if ((statusId !== null && (!Number.isSafeInteger(statusId) || statusId < 1)) || (bdActionId !== null && (!Number.isSafeInteger(bdActionId) || bdActionId < 1))) {
      return { rules: [], error: "Each reminder rule needs valid status and BD action choices." };
    }
    if (statusId === null && bdActionId === null) return { rules: [], error: "A reminder rule needs a status, a BD action, or both; use the default days for everything else." };
    if (!Number.isInteger(days) || days < 1 || days > maxInactivityDays) return { rules: [], error: `Reminder rule days must be between 1 and ${maxInactivityDays}.` };
    byKey.set(`${statusId ?? "any"}:${bdActionId ?? "any"}`, { statusId, bdActionId, days });
  }
  return { rules: [...byKey.values()], error: null };
}
