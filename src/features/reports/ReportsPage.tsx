"use client";

import { useCallback, useState } from "react";
import { ChevronDown, Download, Mail, MapPin, Phone, TrendingUp, UsersRound } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { reportPeriodLabels, reportPeriods, type ReportPeriod } from "@/lib/dates";
import { formatDate, formatDateTime, formatShortDate } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, EmptyState, ErrorText, Loading } from "@/features/shell/components";
import { fetchDrilldown, fetchReport } from "./client";
import type { DrilldownMetric, DrilldownResult, PerformanceReport, PerformanceRow } from "./model";

const metricColumns: { key: keyof PerformanceRow; label: string; metric?: DrilldownMetric }[] = [
  { key: "leadsCreated", label: "Leads", metric: "leads" },
  { key: "leadsUpdated", label: "Updated" },
  { key: "calls", label: "Calls", metric: "calls" },
  { key: "emails", label: "Emails", metric: "emails" },
  { key: "visits", label: "Visits", metric: "visits" },
  { key: "notes", label: "Notes", metric: "notes" },
  { key: "conversions", label: "Conv.", metric: "conversions" },
  { key: "tasksCreated", label: "Tasks", metric: "tasks" },
  { key: "tasksCompleted", label: "Done" },
  { key: "filesUploaded", label: "Files" },
  { key: "logins", label: "Logins" },
];

export default function ReportsPage() {
  const { user, can, reference, openLead, dataVersion, roleLabel } = useApp();
  const [period, setPeriod] = useState<ReportPeriod>("this_week");
  const [userId, setUserId] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ row: PerformanceRow; metric: DrilldownMetric; data: DrilldownResult | null; error: string } | null>(null);
  const teamWide = can("view_team_reports");
  const fetcher = useCallback(() => fetchReport(period, teamWide ? userId : user.id), [period, userId, teamWide, user.id]);
  const { data: report, error } = useAsyncData<PerformanceReport>(fetcher, dataVersion);

  const openDrill = async (row: PerformanceRow, metric: DrilldownMetric) => {
    setDrill({ row, metric, data: null, error: "" });
    try {
      setDrill({ row, metric, data: await fetchDrilldown(period, row.userId, metric), error: "" });
    } catch (caught) {
      setDrill({ row, metric, data: null, error: errorMessage(caught) });
    }
  };

  const totals = (report?.rows ?? []).reduce((sum, row) => ({
    leads: sum.leads + row.leadsCreated, calls: sum.calls + row.calls, emails: sum.emails + row.emails, visits: sum.visits + row.visits, conversions: sum.conversions + row.conversions,
  }), { leads: 0, calls: 0, emails: 0, visits: 0, conversions: 0 });

  const exportCsv = () => {
    if (!report) return;
    const header = ["Name", "Role", "Stage", "Template", ...metricColumns.map((column) => column.label), "Target %"];
    const lines = report.rows.map((row) => [row.name, roleLabel(row.role as "admin"), row.stage, row.template ?? "", ...metricColumns.map((column) => String(row[column.key] ?? "")), row.targetPercent === null ? "" : String(row.targetPercent)]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `salestrackpro-${period}-${report.range.startYmd}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const maxBar = Math.max(1, ...(report?.series ?? []).map((point) => point.calls + point.emails + point.visits));
  const people = reference.users.filter((person) => person.role !== "recruiter");

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">{teamWide ? "TEAM PERFORMANCE" : "YOUR PERFORMANCE"}</div><h1>Reports & dashboard</h1><p>{report ? `${formatDate(report.range.startYmd)} to ${formatDate(report.range.endExclusiveYmd === report.range.startYmd ? report.range.startYmd : addDays(report.range.endExclusiveYmd, -1))}` : "Activity, leads, conversions, and target progress."}</p></div>
        <a className={`button button-outline ${report ? "" : "is-disabled"}`} href={report ? `/api/reports/export?period=${period}${teamWide && userId ? `&userId=${userId}` : ""}` : undefined} download><Download size={16} /> Export Excel</a>
        <button className="button button-outline" onClick={exportCsv} disabled={!report}><Download size={16} /> CSV</button>
      </div>
      <div className="report-toolbar">
        <div className="report-periods">
          {reportPeriods.map((option) => <button key={option} className={option === period ? "active-period" : ""} onClick={() => setPeriod(option)}>{reportPeriodLabels[option]}</button>)}
        </div>
        {teamWide && (
          <label className="select-filter"><UsersRound size={15} />
            <select aria-label="Sales manager" value={userId ?? ""} onChange={(event) => setUserId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">All sales managers</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select><ChevronDown size={14} />
          </label>
        )}
      </div>
      <ErrorText message={error} />
      {!report && !error && <Loading text="Building the report..." />}
      {report && (
        <>
          <div className="opportunity-stats">
            <Stat label="Leads created" value={totals.leads} icon={<UsersRound size={17} />} />
            <Stat label="Calls made" value={totals.calls} icon={<Phone size={17} />} />
            <Stat label="Emails sent" value={totals.emails} icon={<Mail size={17} />} />
            <Stat label="Road visits" value={totals.visits} icon={<MapPin size={17} />} />
            <Stat label="Conversions" value={totals.conversions} icon={<TrendingUp size={17} />} />
          </div>

          <div className="panel report-chart-panel">
            <div className="panel-heading"><div><h2>Activity over time</h2><p>Calls, emails, and visits per business day</p></div></div>
            <div className="chart-legend"><span><i className="legend-blue" /> Calls</span><span><i className="legend-purple" /> Emails</span><span><i className="legend-orange" /> Visits</span></div>
            {report.series.length === 0 ? <EmptyState title="No activity in this period" /> : (
              <div className="bar-chart">
                <div className="chart-y-axis"><span>{maxBar}</span><span>{Math.round(maxBar / 2)}</span><span>0</span></div>
                <div className="chart-bars">
                  {report.series.map((point) => (
                    <div className="bar-day" key={point.date} title={`${formatDate(point.date)}: ${point.calls} calls, ${point.emails} emails, ${point.visits} visits, ${point.leads} leads`}>
                      <div className="bar-stack">
                        <i style={{ height: `${(point.calls / maxBar) * 100}%` }} />
                        <i style={{ height: `${(point.emails / maxBar) * 100}%` }} />
                        <i style={{ height: `${(point.visits / maxBar) * 100}%` }} />
                      </div>
                      <small>{report.series.length > 14 ? formatShortDate(point.date).replace(/\D+$/, "") : formatShortDate(point.date)}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <section className="panel team-panel">
            <div className="panel-heading"><div><h2>{teamWide ? "Sales manager performance" : "Your numbers"}</h2><p>Click a number to see the records behind it</p></div></div>
            <div className="table-scroll">
              <table className="lead-table team-table report-table">
                <thead><tr><th>TEAM MEMBER</th><th>STAGE</th>{metricColumns.map((column) => <th key={column.key}>{column.label.toUpperCase()}</th>)}<th>TARGET</th></tr></thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.userId}>
                      <td><span className="owner-cell"><span className="mini-avatar">{row.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><strong>{row.name}</strong></span></td>
                      <td><span className="muted-cell">{row.stage.replace("_", " ")}{row.template ? ` · ${row.template}` : ""}</span></td>
                      {metricColumns.map((column) => (
                        <td key={column.key}>{column.metric ? <button className="link-button number" onClick={() => void openDrill(row, column.metric!)}>{row[column.key]}</button> : row[column.key]}</td>
                      ))}
                      <td>{row.targetPercent === null ? <span className="muted-cell">No template</span> : <span className="target-progress"><i style={{ width: `${row.targetPercent}%` }} />{row.targetPercent}%</span>}</td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && <tr><td colSpan={metricColumns.length + 3} className="empty-state">No people to report on.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {drill && (
        <Dialog title={`${drill.row.name} · ${drill.metric}`} eyebrow={reportPeriodLabels[period].toUpperCase()} onClose={() => setDrill(null)}>
          <ErrorText message={drill.error} />
          {!drill.data && !drill.error && <Loading />}
          {drill.data?.activities && (
            <div className="timeline-list">
              {drill.data.activities.map((activity) => (
                <article className="timeline-entry" key={activity.id}>
                  <div><div className="timeline-head"><button className="link-button" onClick={() => openLead(activity.leadId)}><strong>{activity.leadName}</strong></button></div><p className="timeline-body">{activity.summary}{activity.body ? ` — ${activity.body}` : ""}</p><small>{formatDateTime(activity.occurredAt)}</small></div>
                </article>
              ))}
              {!drill.data.activities.length && <EmptyState title="Nothing recorded in this period" />}
            </div>
          )}
          {drill.data?.leads && (
            <div className="timeline-list">
              {drill.data.leads.map((lead) => <article className="timeline-entry" key={lead.id}><div><button className="link-button" onClick={() => openLead(lead.id)}><strong>{lead.clientName}</strong></button><small>{lead.status} · created {formatDateTime(lead.createdAt)}</small></div></article>)}
              {!drill.data.leads.length && <EmptyState title="No leads created in this period" />}
            </div>
          )}
          {drill.data?.tasks && (
            <div className="timeline-list">
              {drill.data.tasks.map((task) => <article className="timeline-entry" key={task.id}><div><strong>{task.title}</strong><small>{task.status} · {task.leadName ?? "No lead"} · due {task.dueAt ? formatDateTime(task.dueAt) : "—"}</small></div></article>)}
              {!drill.data.tasks.length && <EmptyState title="No tasks in this period" />}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="small-stat"><div className="small-stat-top"><span>{label}</span><span className="small-stat-icon">{icon}</span></div><strong>{value}</strong><small>In the selected period</small></div>;
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
