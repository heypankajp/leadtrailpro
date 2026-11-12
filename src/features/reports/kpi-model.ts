import type { ReportPeriod } from "../../lib/dates.ts";
import { timeOfDayIn, weekdayOfYmd } from "../notifications/model.ts";

/**
 * KPI report emails to administrators (asked for on November 9, 2026: a daily, weekly, and monthly Sales Manager
 * performance report plus the system-wide picture). Pure rules: which report is due when, the period each covers,
 * the totals, and the text and HTML bodies. No app imports, so the unit tests load this file directly; the data
 * itself comes from `kpi-email.ts` (performance report, team board, pipeline).
 */

export const kpiReportKinds = ["daily", "weekly", "monthly"] as const;
export type KpiReportKind = (typeof kpiReportKinds)[number];
export const isKpiReportKind = (value: unknown): value is KpiReportKind => typeof value === "string" && (kpiReportKinds as readonly string[]).includes(value);
export const kpiReportLabels: Record<KpiReportKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
/** The period each report covers: the last completed one, so the numbers do not move after the email has gone out. */
export const kpiReportPeriod: Record<KpiReportKind, ReportPeriod> = { daily: "yesterday", weekly: "last_week", monthly: "last_month" };
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

export type KpiRow = {
  userId: number; name: string; role: string;
  /** For the period. */
  leadsCreated: number; leadsUpdated: number; calls: number; emails: number; visits: number; notes: number; conversions: number; tasksCompleted: number; targetPercent: number | null;
  /** As things stand when the report is built. */
  activeLeads: number; overdueFollowUps: number; stalled: number; repliesWaiting: number;
};

export type KpiColumn = { key: Exclude<keyof KpiRow, "userId" | "name" | "role">; label: string; short: string; period: boolean };
export const kpiColumns: readonly KpiColumn[] = [
  { key: "leadsCreated", label: "Leads created", short: "Leads", period: true },
  { key: "leadsUpdated", label: "Leads updated", short: "Updated", period: true },
  { key: "calls", label: "Calls", short: "Calls", period: true },
  { key: "emails", label: "Emails", short: "Emails", period: true },
  { key: "visits", label: "Visits", short: "Visits", period: true },
  { key: "notes", label: "Notes", short: "Notes", period: true },
  { key: "conversions", label: "Conversions", short: "Conv.", period: true },
  { key: "tasksCompleted", label: "Tasks done", short: "Tasks", period: true },
  { key: "targetPercent", label: "Target %", short: "Target", period: true },
  { key: "activeLeads", label: "Active leads", short: "Active", period: false },
  { key: "overdueFollowUps", label: "Overdue follow-ups", short: "Overdue", period: false },
  { key: "stalled", label: "Stalled leads", short: "Stalled", period: false },
  { key: "repliesWaiting", label: "Client replies waiting", short: "Replies", period: false },
];

export type KpiReportData = {
  kind: KpiReportKind;
  startYmd: string;
  /** Inclusive. */
  endYmd: string;
  periodLabel: string;
  generatedAt: string;
  rows: KpiRow[];
  totals: KpiRow;
  /** Active leads per status, system-wide, as things stand. */
  pipeline: { label: string; count: number }[];
  pipelineTotal: number;
  /** PIPE-12: leads on the Pipeline board per stage (active, not Client or closed), in board order. */
  pipelineByStage: { label: string; count: number }[];
  appUrl: string | null;
};

export const kpiPeriodLabel = (startYmd: string, endYmd: string) => (startYmd === endYmd ? startYmd : `${startYmd} to ${endYmd}`);

/** The system-wide row: every count summed; the target percentage averaged over the people who have a target. */
export function kpiTotals(rows: readonly KpiRow[]): KpiRow {
  const totals: KpiRow = { userId: 0, name: "All Sales Managers", role: "total", leadsCreated: 0, leadsUpdated: 0, calls: 0, emails: 0, visits: 0, notes: 0, conversions: 0, tasksCompleted: 0, targetPercent: null, activeLeads: 0, overdueFollowUps: 0, stalled: 0, repliesWaiting: 0 };
  const percents: number[] = [];
  for (const row of rows) {
    for (const column of kpiColumns) if (column.key !== "targetPercent") totals[column.key] += row[column.key] ?? 0;
    if (row.targetPercent !== null) percents.push(row.targetPercent);
  }
  totals.targetPercent = percents.length ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : null;
  return totals;
}

export const kpiSubject = (data: KpiReportData) => `LeadTrailPro KPI report (${kpiReportLabels[data.kind].toLowerCase()}): ${data.periodLabel}`;

const cell = (row: KpiRow, column: KpiColumn) => (column.key === "targetPercent" ? (row.targetPercent === null ? "—" : `${row.targetPercent}%`) : String(row[column.key]));

const intro = (data: KpiReportData) => `${kpiReportLabels[data.kind]} KPI report for ${data.periodLabel}: ${data.rows.length} Sales Manager${data.rows.length === 1 ? "" : "s"}. The first nine columns are for that period; the last four are as of ${data.generatedAt.slice(0, 16).replace("T", " ")} UTC.`;

/** Plain-text body: a fixed-width table, the totals, and the pipeline. */
export function formatKpiText(data: KpiReportData): string {
  const rows = [...data.rows, data.totals];
  const nameWidth = Math.max(14, ...rows.map((row) => row.name.length));
  const widths = kpiColumns.map((column) => Math.max(column.short.length, ...rows.map((row) => cell(row, column).length)));
  const line = (name: string, values: string[]) => [name.padEnd(nameWidth), ...values.map((value, index) => value.padStart(widths[index]))].join("  ");
  const table = [
    line("Sales Manager", kpiColumns.map((column) => column.short)),
    line("-".repeat(nameWidth), widths.map((width) => "-".repeat(width))),
    ...data.rows.map((row) => line(row.name, kpiColumns.map((column) => cell(row, column)))),
    line("-".repeat(nameWidth), widths.map((width) => "-".repeat(width))),
    line(data.totals.name, kpiColumns.map((column) => cell(data.totals, column))),
  ];
  const pipeline = data.pipeline.length ? data.pipeline.map((status) => `${status.label} ${status.count}`).join(", ") : "no active leads";
  const stages = data.pipelineByStage ?? [];
  const onBoard = stages.reduce((sum, stage) => sum + stage.count, 0);
  const byStage = stages.length ? stages.map((stage) => `${stage.label} ${stage.count}`).join(", ") : "no leads on the board";
  return [
    intro(data), "",
    data.rows.length ? table.join("\n") : "No active Sales Manager.", "",
    `Columns: ${kpiColumns.map((column) => `${column.short} = ${column.label}`).join("; ")}.`, "",
    `Pipeline now (${data.pipelineTotal} active leads): ${pipeline}.`,
    `Pipeline by stage (${onBoard} on the board): ${byStage}.`,
    data.appUrl ? `\nOpen the reports in LeadTrailPro: ${data.appUrl}` : "",
  ].join("\n").trim() + "\n";
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** HTML body for mail clients: the same table with the period and the current-state columns told apart. */
export function formatKpiHtml(data: KpiReportData): string {
  const th = (text: string, extra = "") => `<th style="padding:6px 8px;border-bottom:2px solid #d8dbe6;text-align:right;font-size:12px;color:#4b5068;${extra}">${escapeHtml(text)}</th>`;
  const td = (text: string, extra = "") => `<td style="padding:6px 8px;border-bottom:1px solid #eceef4;text-align:right;font-size:13px;${extra}">${escapeHtml(text)}</td>`;
  const periodCount = kpiColumns.filter((column) => column.period).length;
  const head = `<tr><th></th><th colspan="${periodCount}" style="padding:4px 8px;font-size:11px;color:#6b7190;text-align:center;border-bottom:1px solid #eceef4">${escapeHtml(data.periodLabel)}</th><th colspan="${kpiColumns.length - periodCount}" style="padding:4px 8px;font-size:11px;color:#6b7190;text-align:center;border-bottom:1px solid #eceef4">As of now</th></tr>`
    + `<tr>${th("Sales Manager", "text-align:left")}${kpiColumns.map((column) => th(column.short)).join("")}</tr>`;
  const body = data.rows.map((row) => `<tr>${td(row.name, "text-align:left;font-weight:600;color:#2d3246")}${kpiColumns.map((column) => td(cell(row, column))).join("")}</tr>`).join("");
  const totals = `<tr>${td(data.totals.name, "text-align:left;font-weight:700;color:#2d3246;border-top:2px solid #d8dbe6")}${kpiColumns.map((column) => td(cell(data.totals, column), "font-weight:700;border-top:2px solid #d8dbe6")).join("")}</tr>`;
  const pipeline = data.pipeline.length ? data.pipeline.map((status) => `${escapeHtml(status.label)} <strong>${status.count}</strong>`).join(", ") : "no active leads";
  const stages = data.pipelineByStage ?? [];
  const onBoard = stages.reduce((sum, stage) => sum + stage.count, 0);
  const byStage = stages.length ? stages.map((stage) => `${escapeHtml(stage.label)} <strong>${stage.count}</strong>`).join(", ") : "no leads on the board";
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#2d3246">`,
    `<p>${escapeHtml(intro(data))}</p>`,
    data.rows.length ? `<table style="border-collapse:collapse;min-width:720px">${head}${body}${totals}</table>` : "<p>No active Sales Manager.</p>",
    `<p style="font-size:12px;color:#6b7190">${kpiColumns.map((column) => `${escapeHtml(column.short)} = ${escapeHtml(column.label)}`).join("; ")}.</p>`,
    `<p>Pipeline now (${data.pipelineTotal} active leads): ${pipeline}.</p>`,
    `<p>Pipeline by stage (${onBoard} on the board): ${byStage}.</p>`,
    data.appUrl ? `<p><a href="${escapeHtml(data.appUrl)}">Open the reports in LeadTrailPro</a></p>` : "",
    "</div>",
  ].join("");
}
