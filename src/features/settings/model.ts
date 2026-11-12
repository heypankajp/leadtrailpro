import type { JobSourceSettings } from "@/features/jobs/model";
import type { MapsSettings } from "@/features/maps/model";
import type { OpportunitySettings } from "@/features/opportunities/model";
import type { SystemRole } from "@/features/users/model";
import { defaultKpiReports, normalizeKpiReports, type KpiReportSettings } from "../reports/kpi-model.ts";

/** A non-working day in the business calendar (public holiday, company closure). */
export type Holiday = { date: string; name: string };

/**
 * TASK-05: a needs-attention rule. `statusId` and `bdActionId` are list-value ids (null = any); `days` is how long a
 * lead may go without recorded activity before it is flagged. The most specific rule wins (see resolveInactivityDays).
 */
export type InactivityRule = { statusId: number | null; bdActionId: number | null; /** PIPE-08: the pipeline stage the rule applies to (null = any). */ stageId: number | null; days: number };

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

/**
 * Email delivery through the Google app: the mailbox the app sends from, whether the weekly stalled-leads report goes
 * out, which KPI reports administrators get (daily, weekly, monthly; SPEC §7.18), and whether connected mailboxes
 * are watched for client replies (MAIL-01).
 */
export type EmailSettings = { senderUserId: number | null; reportEmails: boolean; kpiReports: KpiReportSettings; watchMailboxes: boolean };
export const defaultEmailSettings: EmailSettings = { senderUserId: null, reportEmails: false, kpiReports: { ...defaultKpiReports }, watchMailboxes: true };

export function normalizeEmailSettings(value: unknown): { email: EmailSettings; error: string | null } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const raw = record.senderUserId;
  const senderUserId = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (senderUserId !== null && (!Number.isSafeInteger(senderUserId) || senderUserId < 1)) return { email: defaultEmailSettings, error: "Choose a valid sending mailbox." };
  return {
    email: { senderUserId, reportEmails: record.reportEmails === true, kpiReports: normalizeKpiReports(record.kpiReports), watchMailboxes: record.watchMailboxes === undefined ? true : record.watchMailboxes === true },
    error: null,
  };
}

/** PIPE-09 (§10.11): the next step each pipeline stage suggests, and the switches of the next-step prompt. */
export const stageFollowUpActivities = ["call", "email", "visit", "task"] as const;
export type StageFollowUpActivity = (typeof stageFollowUpActivities)[number];
export type StageFollowUp = { activity: StageFollowUpActivity; businessDays: number };
export type PipelineSettings = {
  /** By stage code: the task offered (or created, with `autoFollowUp`) when a lead reaches the stage; a stage without an entry offers a plain follow-up on the next working day. */
  followUps: Record<string, StageFollowUp>;
  /** Ask for the next step after a logged call, email, or visit, a BD action, or a stage move. */
  promptNextStep: boolean;
  /** Create the stage's suggested task for the owner without asking when a lead reaches the stage (Pipedrive's "deal moved → schedule a call"). */
  autoFollowUp: boolean;
};
export const maxFollowUpBusinessDays = 60;
export const defaultPipelineSettings: PipelineSettings = {
  followUps: { contact_made: { activity: "call", businessDays: 1 }, profile_shared: { activity: "call", businessDays: 3 } },
  promptNextStep: true,
  autoFollowUp: false,
};

export function normalizePipelineSettings(value: unknown): { pipeline: PipelineSettings; error: string | null } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawFollowUps = record.followUps && typeof record.followUps === "object" && !Array.isArray(record.followUps) ? (record.followUps as Record<string, unknown>) : null;
  const followUps: Record<string, StageFollowUp> = {};
  if (rawFollowUps) {
    const entries = Object.entries(rawFollowUps);
    if (entries.length > 50) return { pipeline: defaultPipelineSettings, error: "Keep the per-stage next steps to 50 stages or fewer." };
    for (const [code, entry] of entries) {
      if (!/^[a-z0-9_]{1,60}$/.test(code)) return { pipeline: defaultPipelineSettings, error: "Each per-stage next step must be keyed by a stage code." };
      if (entry === null || entry === undefined || entry === "") continue;
      const item = typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const activity = item.activity;
      const businessDays = Number(item.businessDays);
      if (!stageFollowUpActivities.includes(activity as StageFollowUpActivity)) return { pipeline: defaultPipelineSettings, error: "Each per-stage next step needs an activity: call, email, visit, or task." };
      if (!Number.isInteger(businessDays) || businessDays < 0 || businessDays > maxFollowUpBusinessDays) return { pipeline: defaultPipelineSettings, error: `Per-stage next steps are due 0 to ${maxFollowUpBusinessDays} business days later.` };
      followUps[code] = { activity: activity as StageFollowUpActivity, businessDays };
    }
  }
  return {
    pipeline: {
      followUps: rawFollowUps ? followUps : { ...defaultPipelineSettings.followUps },
      promptNextStep: record.promptNextStep === undefined ? defaultPipelineSettings.promptNextStep : record.promptNextStep === true,
      autoFollowUp: record.autoFollowUp === true,
    },
    error: null,
  };
}

export type AppSettings = {
  roleLabels: Record<SystemRole, string>;
  reminders: ReminderSettings;
  digests: DigestSettings;
  /** TRIP-06: order, budgets, cache life, and prefetch count of the job-listing sources (SPEC §7.13). */
  jobSources: JobSourceSettings;
  /** OPP-06: when the keyword searches run and how many listings each source may return per search. */
  opportunities: OpportunitySettings;
  /** The mailbox system email is sent from (a user with a connected Gmail) and the switch for report emails. */
  email: EmailSettings;
  /** PIPE-09: the next step each stage suggests and the next-step prompt switches (§10.11). */
  pipeline: PipelineSettings;
  /** Monthly budgets per Google Maps SKU and the warning level for administrators (SPEC §10.8). */
  maps: MapsSettings;
  /** Sorted by date. Used with weekends for "yesterday" in reports and for natural-language due dates. */
  holidays: Holiday[];
};

export const maxHolidays = 400;
export const maxHolidayNameLength = 80;
export const maxInactivityRules = 50;
export const maxInactivityDays = 365;

/**
 * The most specific matching rule wins. A rule matches when each of its set fields (status, BD action, stage) equals the
 * lead's; BD action outranks stage, which outranks status, so: status + action > action > status + stage > stage > status.
 * Without a match the default number of days applies.
 */
export function resolveInactivityDays(lead: { statusId: number; bdActionId: number | null; stageId?: number | null }, reminders: ReminderSettings): number {
  let best: { score: number; days: number } | null = null;
  for (const rule of reminders.rules) {
    const stageId = rule.stageId ?? null;
    if (rule.statusId !== null && rule.statusId !== lead.statusId) continue;
    if (rule.bdActionId !== null && rule.bdActionId !== lead.bdActionId) continue;
    if (stageId !== null && stageId !== (lead.stageId ?? null)) continue;
    const score = (rule.bdActionId !== null ? 4 : 0) + (stageId !== null ? 2 : 0) + (rule.statusId !== null ? 1 : 0);
    if (!best || score > best.score) best = { score, days: rule.days };
  }
  return best ? best.days : reminders.inactivityDays;
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
    const stageId = id(record.stageId);
    const days = Number(record.days);
    const invalid = (value: number | null) => value !== null && (!Number.isSafeInteger(value) || value < 1);
    if (invalid(statusId) || invalid(bdActionId) || invalid(stageId)) {
      return { rules: [], error: "Each reminder rule needs valid status, BD action, and stage choices." };
    }
    if (statusId === null && bdActionId === null && stageId === null) return { rules: [], error: "A reminder rule needs a status, a BD action, a stage, or a combination of them; use the default days for everything else." };
    if (!Number.isInteger(days) || days < 1 || days > maxInactivityDays) return { rules: [], error: `Reminder rule days must be between 1 and ${maxInactivityDays}.` };
    byKey.set(`${statusId ?? "any"}:${bdActionId ?? "any"}:${stageId ?? "any"}`, { statusId, bdActionId, stageId, days });
  }
  return { rules: [...byKey.values()], error: null };
}
