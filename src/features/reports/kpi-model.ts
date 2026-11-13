import type { ReportPeriod } from "../../lib/dates.ts";
import { timeOfDayIn, weekdayOfYmd } from "../notifications/model.ts";

/**
 * KPI report emails to administrators (asked for on November 9, 2026: a daily, weekly, and monthly Sales Manager
 * report plus the system-wide picture; reworked on November 12, 2026 after the first real emails: yesterday's
 * numbers next to today's read as a contradiction, so every report now leads with where each person's leads stand
 * at the moment it is built, split by status). Pure rules: which report is due when, the totals, and the text and
 * HTML bodies. No app imports, so the unit tests load this file directly; the data itself comes from
 * `kpi-email.ts` (leads by owner and status, team board, pipeline by stage, performance report).
 */

export const kpiReportKinds = ["daily", "weekly", "monthly"] as const;
export type KpiReportKind = (typeof kpiReportKinds)[number];
export const isKpiReportKind = (value: unknown): value is KpiReportKind => typeof value === "string" && (kpiReportKinds as readonly string[]).includes(value);
export const kpiReportLabels: Record<KpiReportKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
/**
 * The period whose activity a report adds below the current state: the last completed week or month. The daily
 * report has none; it only shows where things stand.
 */
export const kpiActivityPeriod: Record<KpiReportKind, ReportPeriod | null> = { daily: null, weekly: "last_week", monthly: "last_month" };
export const kpiJobName = (kind: KpiReportKind) => `kpi_${kind}`;

export type KpiReportSettings = Record<KpiReportKind, boolean>;
export const defaultKpiReports: KpiReportSettings = { daily: true, weekly: true, monthly: true };
export function normalizeKpiReports(value: unknown): KpiReportSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const flag = (kind: KpiReportKind) => (record[kind] === undefined ? defaultKpiReports[kind] : record[kind] === true);
  return { daily: flag("daily"), weekly: flag("weekly"), monthly: flag("monthly") };
}

type DigestTimes = { dailyTime: string; weeklyDay: number; weeklyTime: string };

const addDays = (ymd: string, days: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
const mondayOf = (ymd: string) => { const day = weekdayOfYmd(ymd); return addDays(ymd, day === 0 ? -6 : 1 - day); };

/**
 * When a report is due, in the business time zone: the daily one on business days at the daily digest time (it covers
 * the previous working day), the weekly one on the weekly digest day at its time, the monthly one on the first day of
 * the month at the daily digest time. The digests' own on/off switch does not apply; the KPI switches do.
 */
export function isKpiReportDue(kind: KpiReportKind, digests: DigestTimes, now: Date, timeZone: string, todayYmd: string, holidays: readonly string[] = []): boolean {
  const weekday = weekdayOfYmd(todayYmd);
  if (kind === "daily" && (weekday === 0 || weekday === 6 || holidays.includes(todayYmd))) return false;
  if (kind === "weekly" && weekday !== digests.weeklyDay) return false;
  if (kind === "monthly" && !todayYmd.endsWith("-01")) return false;
  const [hour, minute] = (kind === "weekly" ? digests.weeklyTime : digests.dailyTime).split(":").map(Number);
  const current = timeOfDayIn(now, timeZone);
  return current.hour * 60 + current.minute >= hour * 60 + minute;
}

/** One run per period: the key the job claims in `job_runs`. */
export function kpiPeriodKey(kind: KpiReportKind, todayYmd: string): string {
  return kind === "daily" ? todayYmd : kind === "weekly" ? `week-${mondayOf(todayYmd)}` : `month-${todayYmd.slice(0, 7)}`;
}

/** A status of the lead status list that at least one lead has, in list order; `key` indexes `KpiRow.byStatus`. */
export type KpiStatus = { key: string; label: string };

/** Where one person's leads stand when the report is built. */
export type KpiRow = {
  userId: number; name: string; role: string;
  /** Every lead the person owns that is neither archived nor deleted; the sum of `byStatus`. */
  leads: number;
  byStatus: Record<string, number>;
  overdueFollowUps: number; stalled: number; repliesWaiting: number;
};

export const kpiAttentionColumns = [
  { key: "overdueFollowUps", label: "the follow-up date has passed", short: "Overdue" },
  { key: "stalled", label: "no activity for longer than the needs-attention rule allows", short: "Stalled" },
  { key: "repliesWaiting", label: "a client email is waiting for an answer", short: "Replies" },
] as const;

/** What one person did in the period of a weekly or monthly report. */
export type KpiActivityRow = {
  userId: number; name: string; role: string;
  leadsCreated: number; leadsUpdated: number; calls: number; emails: number; visits: number; notes: number; conversions: number; tasksCompleted: number; targetPercent: number | null;
};

export const kpiActivityColumns = [
  { key: "leadsCreated", label: "Deals created", short: "Created" },
  { key: "leadsUpdated", label: "Deals updated", short: "Updated" },
  { key: "calls", label: "Calls", short: "Calls" },
  { key: "emails", label: "Emails", short: "Emails" },
  { key: "visits", label: "Visits", short: "Visits" },
  { key: "notes", label: "Notes", short: "Notes" },
  { key: "conversions", label: "Conversions", short: "Conv." },
  { key: "tasksCompleted", label: "Tasks done", short: "Tasks" },
  { key: "targetPercent", label: "Target %", short: "Target" },
] as const;

export type KpiReportData = {
  kind: KpiReportKind;
  /** When the numbers were read, in the business time zone: "2026-11-12 07:30". */
  asOf: string;
  timeZone: string;
  /** The status columns, in list order. */
  statuses: KpiStatus[];
  /** One row per Sales Manager, and per anyone else who owns a lead, so the totals cover every lead. */
  rows: KpiRow[];
  totals: KpiRow;
  /** PIPE-12: leads on the Pipeline board per stage (active, not Client or closed), in board order. */
  pipelineByStage: { label: string; count: number }[];
  /**
   * Weekly and monthly reports: what was recorded in the last completed period, only the people who did something;
   * the totals cover everyone. Null on the daily report.
   */
  activity: { periodLabel: string; rows: KpiActivityRow[]; totals: KpiActivityRow } | null;
  appUrl: string | null;
};

export const kpiPeriodLabel = (startYmd: string, endYmd: string) => (startYmd === endYmd ? startYmd : `${startYmd} to ${endYmd}`);

/** The system-wide row: every count summed, status by status. */
export function kpiTotals(rows: readonly KpiRow[]): KpiRow {
  const totals: KpiRow = { userId: 0, name: "All Sales Managers", role: "total", leads: 0, byStatus: {}, overdueFollowUps: 0, stalled: 0, repliesWaiting: 0 };
  for (const row of rows) {
    totals.leads += row.leads;
    for (const column of kpiAttentionColumns) totals[column.key] += row[column.key];
    for (const [key, value] of Object.entries(row.byStatus)) totals.byStatus[key] = (totals.byStatus[key] ?? 0) + value;
  }
  return totals;
}

/** The period's totals: every count summed; the target percentage averaged over the people who have a target. */
export function kpiActivityTotals(rows: readonly KpiActivityRow[]): KpiActivityRow {
  const totals: KpiActivityRow = { userId: 0, name: "All Sales Managers", role: "total", leadsCreated: 0, leadsUpdated: 0, calls: 0, emails: 0, visits: 0, notes: 0, conversions: 0, tasksCompleted: 0, targetPercent: null };
  const percents: number[] = [];
  for (const row of rows) {
    for (const column of kpiActivityColumns) if (column.key !== "targetPercent") totals[column.key] += row[column.key];
    if (row.targetPercent !== null) percents.push(row.targetPercent);
  }
  totals.targetPercent = percents.length ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : null;
  return totals;
}

/** Whether the person recorded anything in the period; people who did not are left out of the activity table. */
export const hasKpiActivity = (row: KpiActivityRow) => kpiActivityColumns.some((column) => column.key !== "targetPercent" && row[column.key] > 0);

export const kpiSubject = (data: KpiReportData) => `LeadTrailPro KPI report (${kpiReportLabels[data.kind].toLowerCase()}): as of ${data.asOf.slice(0, 10)}`;

const count = (value: number) => value.toLocaleString("en-US");
const plural = (value: number, noun: string) => `${count(value)} ${noun}${value === 1 ? "" : "s"}`;

/** The current-state table: who, how many leads, one column per status, then what is waiting on the person. */
const stateHeader = (data: KpiReportData) => ["Deals", ...data.statuses.map((status) => status.label), ...kpiAttentionColumns.map((column) => column.short)];
const stateCells = (data: KpiReportData, row: KpiRow) => [count(row.leads), ...data.statuses.map((status) => count(row.byStatus[status.key] ?? 0)), ...kpiAttentionColumns.map((column) => count(row[column.key]))];
const activityHeader = kpiActivityColumns.map((column) => column.short);
const activityCells = (row: KpiActivityRow) => kpiActivityColumns.map((column) => (column.key === "targetPercent" ? (row.targetPercent === null ? "—" : `${row.targetPercent}%`) : count(row[column.key])));

const intro = (data: KpiReportData) => `${kpiReportLabels[data.kind]} KPI report as of ${data.asOf} (${data.timeZone}): ${plural(data.totals.leads, "deal")} with ${plural(data.rows.length, "Sales Manager")}. Each row shows where that person's deals stand at that moment.`;
const legend = `Deals = every deal the person owns (archived and deleted ones left out), split by status in the columns after it. ${kpiAttentionColumns.map((column) => `${column.short} = ${column.label}`).join("; ")}.`;
const activityTitle = (label: string) => `Activity recorded in LeadTrailPro, ${label}`;
const noActivity = (label: string) => `No activity was recorded in LeadTrailPro for ${label}.`;
const stageLine = (data: KpiReportData, strong: (value: string) => string, label: (value: string) => string) => {
  const stages = data.pipelineByStage ?? [];
  const onBoard = stages.reduce((sum, stage) => sum + stage.count, 0);
  return `Pipeline by stage (${count(onBoard)} on the board): ${stages.length ? stages.map((stage) => `${label(stage.label)} ${strong(count(stage.count))}`).join(", ") : "no deals on the board"}.`;
};

/** A fixed-width text table: the name column, right-aligned values, a rule above the totals. */
function textTable(header: string[], rows: { name: string; cells: string[] }[], totals: { name: string; cells: string[] }): string {
  const all = [...rows, totals];
  const nameWidth = Math.max(14, ...all.map((row) => row.name.length));
  const widths = header.map((title, index) => Math.max(title.length, ...all.map((row) => row.cells[index].length)));
  const line = (name: string, values: string[]) => [name.padEnd(nameWidth), ...values.map((value, index) => value.padStart(widths[index]))].join("  ");
  const rule = line("-".repeat(nameWidth), widths.map((width) => "-".repeat(width)));
  return [line("Sales Manager", header), rule, ...rows.map((row) => line(row.name, row.cells)), rule, line(totals.name, totals.cells)].join("\n");
}

/** Plain-text body: the current state per person and in total, the pipeline by stage, and the period's activity on weekly and monthly reports. */
export function formatKpiText(data: KpiReportData): string {
  const plain = (value: string) => value;
  const lines = [
    intro(data), "",
    data.rows.length ? textTable(stateHeader(data), data.rows.map((row) => ({ name: row.name, cells: stateCells(data, row) })), { name: data.totals.name, cells: stateCells(data, data.totals) }) : "No active Sales Manager.", "",
    legend, "",
    stageLine(data, plain, plain),
  ];
  if (data.activity) {
    lines.push("");
    if (data.activity.rows.length) lines.push(`${activityTitle(data.activity.periodLabel)}:`, "", textTable(activityHeader, data.activity.rows.map((row) => ({ name: row.name, cells: activityCells(row) })), { name: data.activity.totals.name, cells: activityCells(data.activity.totals) }), "", `${kpiActivityColumns.map((column) => `${column.short} = ${column.label}`).join("; ")}. People with nothing recorded in the period are left out.`);
    else lines.push(noActivity(data.activity.periodLabel));
  }
  if (data.appUrl) lines.push("", `Open the reports in LeadTrailPro: ${data.appUrl}`);
  return lines.join("\n").trim() + "\n";
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** HTML body for mail clients: the same tables, the status columns and the waiting columns under their own headings. */
export function formatKpiHtml(data: KpiReportData): string {
  const th = (text: string, extra = "") => `<th style="padding:6px 8px;border-bottom:2px solid #d8dbe6;text-align:right;font-size:12px;color:#4b5068;${extra}">${escapeHtml(text)}</th>`;
  const td = (text: string, extra = "") => `<td style="padding:6px 8px;border-bottom:1px solid #eceef4;text-align:right;font-size:13px;${extra}">${escapeHtml(text)}</td>`;
  const group = (text: string, span: number) => (span ? `<th colspan="${span}" style="padding:4px 8px;font-size:11px;color:#6b7190;text-align:center;border-bottom:1px solid #eceef4">${escapeHtml(text)}</th>` : "");
  const table = (groups: string, header: string[], rows: { name: string; cells: string[] }[], totals: { name: string; cells: string[] }) =>
    `<table style="border-collapse:collapse;min-width:640px">${groups}<tr>${th("Sales Manager", "text-align:left")}${header.map((title) => th(title)).join("")}</tr>`
    + rows.map((row) => `<tr>${td(row.name, "text-align:left;font-weight:600;color:#2d3246")}${row.cells.map((value) => td(value)).join("")}</tr>`).join("")
    + `<tr>${td(totals.name, "text-align:left;font-weight:700;color:#2d3246;border-top:2px solid #d8dbe6")}${totals.cells.map((value) => td(value, "font-weight:700;border-top:2px solid #d8dbe6")).join("")}</tr></table>`;
  const stateGroups = `<tr><th></th><th></th>${group("By status", data.statuses.length)}${group("Waiting on the person", kpiAttentionColumns.length)}</tr>`;
  const small = (text: string) => `<p style="font-size:12px;color:#6b7190">${escapeHtml(text)}</p>`;
  const parts = [
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#2d3246">`,
    `<p>${escapeHtml(intro(data))}</p>`,
    data.rows.length ? table(stateGroups, stateHeader(data), data.rows.map((row) => ({ name: row.name, cells: stateCells(data, row) })), { name: data.totals.name, cells: stateCells(data, data.totals) }) : "<p>No active Sales Manager.</p>",
    small(legend),
    `<p>${stageLine(data, (value) => `<strong>${value}</strong>`, escapeHtml)}</p>`,
  ];
  if (data.activity) {
    if (data.activity.rows.length) parts.push(
      `<p style="margin-top:22px"><strong>${escapeHtml(activityTitle(data.activity.periodLabel))}</strong></p>`,
      table("", activityHeader, data.activity.rows.map((row) => ({ name: row.name, cells: activityCells(row) })), { name: data.activity.totals.name, cells: activityCells(data.activity.totals) }),
      small(`${kpiActivityColumns.map((column) => `${column.short} = ${column.label}`).join("; ")}. People with nothing recorded in the period are left out.`),
    );
    else parts.push(`<p>${escapeHtml(noActivity(data.activity.periodLabel))}</p>`);
  }
  if (data.appUrl) parts.push(`<p><a href="${escapeHtml(data.appUrl)}">Open the reports in LeadTrailPro</a></p>`);
  parts.push("</div>");
  return parts.join("");
}
