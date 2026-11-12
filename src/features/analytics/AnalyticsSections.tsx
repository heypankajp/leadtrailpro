"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Briefcase, Download, Layers, TrendingUp, Users } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { CustomRange, ReportPeriod } from "@/lib/dates";
import { formatDate, formatShortDate, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import type { LeadSummary } from "@/features/leads/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, EmptyState, ErrorText, Loading, StatusPill } from "@/features/shell/components";
import { CategoryBars, StackedBars, colorFor, seriesColors, statusColors } from "./charts";
import { fetchAnalytics, fetchAnalyticsLeads, fetchTeamBoard, fetchTeamBoardLeads } from "./client";
import { emptyAnalyticsFilters, teamBoardMetricLabels, type AnalyticsFilters, type AnalyticsReport, type TeamBoard, type TeamBoardMetric, type TeamBoardRow } from "./model";

type Props = { period: ReportPeriod; custom: CustomRange | null; ownerId: number | null };
type Drill = { title: string; leads: LeadSummary[] | null; error: string };

const downloadCsv = (name: string, header: string[], lines: (string | number)[][]) => {
  const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** The analytics sections below the performance table (RPT-*, decided November 6, 2026): pipeline, movement, time in status, stalled leads, the pool, breakdowns, leaderboard. */
export default function AnalyticsSections({ period, custom, ownerId }: Props) {
  const { reference, openLead, dataVersion, can } = useApp();
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyAnalyticsFilters);
  const effective: AnalyticsFilters = { ...filters, ownerId };
  const key = JSON.stringify([period, custom, effective]);
  const fetcher = useCallback(() => fetchAnalytics(period, custom, effective), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error } = useAsyncData<AnalyticsReport>(fetcher, dataVersion);
  const [drill, setDrill] = useState<Drill | null>(null);
  const values = reference.listValues;
  const set = (patch: Partial<AnalyticsFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const drillWith = async (title: string, load: () => Promise<{ leads: LeadSummary[] }>) => {
    setDrill({ title, leads: null, error: "" });
    try { setDrill({ title, leads: (await load()).leads, error: "" }); } catch (caught) { setDrill({ title, leads: null, error: errorMessage(caught) }); }
  };
  const drillTo = (title: string, statusCode: string | null, drillOwner: number | null) => drillWith(title, () => fetchAnalyticsLeads(effective, statusCode, drillOwner));

  const statusSeries = (report: AnalyticsReport) => report.statuses.map((status, index) => ({ key: status.code, label: status.label, color: colorFor(status.code, index) }));
  // PIPE-12: stages take the categorical hues in board order.
  const stageColor = (index: number) => seriesColors[index % seriesColors.length];
  const stageSeries = (report: AnalyticsReport) => report.stages.map((stage, index) => ({ key: stage.code, label: stage.label, color: stageColor(index) }));
  const drillStage = (stage: { id: number; label: string }, drillOwner: number | null, ownerName?: string) => drillWith(`${ownerName ? `${ownerName} · ` : ""}${stage.label} stage`, () => fetchAnalyticsLeads(effective, null, drillOwner, stage.id));
  const bucketLabel = (report: AnalyticsReport, label: string) => (report.bucketKind === "month" ? label.slice(0, 7) : formatShortDate(label));

  return (
    <>
      {can("view_team_reports") && <TeamBoardSection drill={drillWith} />}
      <div className="report-toolbar analytics-filters" aria-label="Pipeline filters">
        <select aria-label="Status" value={filters.statusId ?? ""} onChange={(event) => set({ statusId: event.target.value ? Number(event.target.value) : null })}><option value="">All statuses</option>{values.status.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        <select aria-label="Lead type" value={filters.leadTypeId ?? ""} onChange={(event) => set({ leadTypeId: event.target.value ? Number(event.target.value) : null })}><option value="">All lead types</option>{values.lead_type.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        <select aria-label="City" value={filters.cityId ?? ""} onChange={(event) => set({ cityId: event.target.value ? Number(event.target.value) : null })}><option value="">All cities</option>{values.city.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        <select aria-label="Lead source" value={filters.source} onChange={(event) => set({ source: event.target.value as AnalyticsFilters["source"] })}><option value="">Any source</option><option value="pool">From the opportunity pool</option><option value="other">Added by hand or from a trip</option></select>
        <input aria-label="Industry" placeholder="Industry" value={filters.industry} onChange={(event) => set({ industry: event.target.value })} maxLength={120} />
        <input aria-label="Client" placeholder="Client name" value={filters.client} onChange={(event) => set({ client: event.target.value })} maxLength={120} />
        <input aria-label="Job type" placeholder="Job type (e.g. full time)" value={filters.jobType} onChange={(event) => set({ jobType: event.target.value })} maxLength={60} />
        {JSON.stringify(filters) !== JSON.stringify(emptyAnalyticsFilters) && <button type="button" className="text-button" onClick={() => setFilters(emptyAnalyticsFilters)}>Clear filters</button>}
      </div>
      <ErrorText message={error} />
      {!data && !error && <Loading text="Building the analytics..." />}
      {data && (
        <>
          <section className="panel analytics-panel">
            <div className="panel-heading"><div><h2>Pipeline now</h2><p>{data.pipeline.total} active leads by status{data.teamWide ? " and salesperson" : ""}; click a number or a bar for the leads behind it</p></div></div>
            <div className="opportunity-stats">
              {data.pipeline.byStatus.map((status, index) => (
                <button type="button" key={status.code} className="small-stat small-stat-button" onClick={() => void drillTo(`${status.label} leads`, status.code, null)}>
                  <div className="small-stat-top"><span><i className="stat-dot" style={{ background: colorFor(status.code, index) }} /> {status.label}</span></div><strong>{status.count}</strong><small>of {data.pipeline.total}</small>
                </button>
              ))}
            </div>
            {data.teamWide && data.pipeline.byOwner.length > 0 && (
              <StackedBars horizontal height={Math.max(160, 34 * data.pipeline.byOwner.length + 60)} xKey="name" series={statusSeries(data)}
                data={data.pipeline.byOwner.map((owner) => ({ name: owner.name, ownerId: owner.ownerId, ...owner.counts }))}
                onBarClick={(row, code) => void drillTo(`${String(row.name)} · ${data.statuses.find((status) => status.code === code)?.label ?? code}`, code, Number(row.ownerId))} />
            )}
            {data.stages.length > 0 && (
              <>
                <div className="panel-heading analytics-subheading"><div><h3>By stage</h3><p>{data.pipelineByStage.total} leads on the Pipeline board (active, not Client or closed){data.teamWide ? ", by stage and salesperson" : ""}</p></div></div>
                <div className="opportunity-stats">
                  {data.pipelineByStage.byStage.map((stage, index) => (
                    <button type="button" key={stage.code} className="small-stat small-stat-button" onClick={() => void drillStage(stage, null)}>
                      <div className="small-stat-top"><span><i className="stat-dot" style={{ background: stageColor(index) }} /> {stage.label}</span></div><strong>{stage.count}</strong><small>of {data.pipelineByStage.total}</small>
                    </button>
                  ))}
                </div>
                {data.teamWide && data.pipelineByStage.byOwner.length > 0 && (
                  <StackedBars horizontal height={Math.max(160, 34 * data.pipelineByStage.byOwner.length + 60)} xKey="name" series={stageSeries(data)}
                    data={data.pipelineByStage.byOwner.map((owner) => ({ name: owner.name, ownerId: owner.ownerId, ...owner.counts }))}
                    onBarClick={(row, code) => { const stage = data.stages.find((item) => item.code === code); if (stage) void drillStage(stage, Number(row.ownerId), String(row.name)); }} />
                )}
              </>
            )}
          </section>

          {data.stages.length > 0 && (
            <div className="analytics-grid">
              <section className="panel analytics-panel">
                <div className="panel-heading"><div><h2>Stage over time</h2><p>How the board looked at the end of each {data.bucketKind}, from every stage move on the timeline; leads placed by the migration count in their first known stage</p></div></div>
                {data.stageOverTime.length === 0 ? <EmptyState title="Nothing in this period" /> : (
                  <StackedBars height={240} xKey="label" series={stageSeries(data)} data={data.stageOverTime.map((point) => ({ label: bucketLabel(data, point.label), ...point.counts }))} />
                )}
              </section>
              <section className="panel analytics-panel">
                <div className="panel-heading"><div><h2>Time in stage</h2><p>Median days a lead stayed in a stage before moving on (stays that ended in the period) · {data.stageMovement.total} stage move{data.stageMovement.total === 1 ? "" : "s"} in the period, {data.stageMovement.forward} forward, {data.stageMovement.backwards} back</p></div></div>
                {data.timeInStage.every((row) => row.samples === 0) ? <EmptyState title="No completed stays in this period" /> : (
                  <>
                    <CategoryBars labelKey="label" valueKey="medianDays" valueLabel="Median days" colorOf={(_row, index) => stageColor(index)} data={data.timeInStage.map((row) => ({ label: row.label, code: row.code, medianDays: row.medianDays ?? 0 }))} />
                    <table className="opp-table"><thead><tr><th>Stage</th><th>Median days</th><th>Slowest quarter from</th><th>Leads measured</th><th>Entered in period</th></tr></thead>
                      <tbody>{data.timeInStage.map((row) => <tr key={row.code}><td>{row.label}</td><td>{row.medianDays ?? "—"}</td><td>{row.p75Days ?? "—"}</td><td>{row.samples}</td><td>{data.stageMovement.entered[row.code] ?? 0}</td></tr>)}</tbody></table>
                  </>
                )}
              </section>
            </div>
          )}

          <section className="panel analytics-panel">
            <div className="panel-heading"><div><h2>Status over time</h2><p>How the pipeline looked at the end of each {data.bucketKind}, from every status change on the timeline</p></div></div>
            {data.statusOverTime.length === 0 ? <EmptyState title="Nothing in this period" /> : (
              <StackedBars height={260} xKey="label" series={statusSeries(data)} data={data.statusOverTime.map((point) => ({ label: bucketLabel(data, point.label), ...point.counts }))} />
            )}
          </section>

          <div className="analytics-grid">
            <section className="panel analytics-panel">
              <div className="panel-heading"><div><h2>Movement in the period</h2><p>Status changes recorded between {formatDate(data.range.startYmd)} and {formatDate(data.range.endExclusiveYmd)}</p></div></div>
              <div className="opportunity-stats">
                <div className="small-stat"><div className="small-stat-top"><span>Cold → Warm</span></div><strong>{data.movement.funnel.coldToWarm}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Warm → Hot</span></div><strong>{data.movement.funnel.warmToHot}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Hot → Client</span></div><strong>{data.movement.funnel.hotToClient}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Became clients</span><span className="small-stat-icon"><TrendingUp size={15} /></span></div><strong>{data.movement.funnel.anyToClient}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Went backwards</span><span className="small-stat-icon"><AlertTriangle size={15} /></span></div><strong>{data.movement.backwards}</strong></div>
              </div>
              {data.teamWide && data.movement.byOwner.length > 0 && (
                <table className="opp-table"><thead><tr><th>Salesperson</th><th>To warm</th><th>To hot</th><th>To client</th><th>Lost</th><th>Disqualified</th></tr></thead>
                  <tbody>{data.movement.byOwner.map((row) => <tr key={row.ownerId}><td><strong>{row.name}</strong></td><td>{row.toWarm}</td><td>{row.toHot}</td><td>{row.toClient}</td><td>{row.lost}</td><td>{row.disqualified}</td></tr>)}</tbody></table>
              )}
            </section>
            <section className="panel analytics-panel">
              <div className="panel-heading"><div><h2>Why deals closed</h2><p>Lost and disqualified reasons in the period</p></div></div>
              {Object.keys(data.movement.lostReasons).length + Object.keys(data.movement.disqualifiedReasons).length === 0 ? <EmptyState title="No lost or disqualified leads in this period" /> : (
                <CategoryBars labelKey="label" valueKey="count" valueLabel="Leads" colorOf={(row) => (row.kind === "lost" ? statusColors.lost : statusColors.disqualified)}
                  data={[...Object.entries(data.movement.lostReasons).map(([label, count]) => ({ label: `Lost: ${label}`, count, kind: "lost" })), ...Object.entries(data.movement.disqualifiedReasons).map(([label, count]) => ({ label: `Disqualified: ${label}`, count, kind: "disqualified" }))].sort((a, b) => b.count - a.count)} />
              )}
            </section>
          </div>

          <div className="analytics-grid">
            <section className="panel analytics-panel">
              <div className="panel-heading"><div><h2>Time in status</h2><p>Median days a lead stayed in a status before moving on (stays that ended in the period)</p></div></div>
              {data.timeInStatus.every((row) => row.samples === 0) ? <EmptyState title="No completed stays in this period" /> : (
                <>
                  <CategoryBars labelKey="label" valueKey="medianDays" valueLabel="Median days" colorOf={(row, index) => colorFor(String(row.code), index)} data={data.timeInStatus.map((row) => ({ label: row.label, code: row.code, medianDays: row.medianDays ?? 0 }))} />
                  <table className="opp-table"><thead><tr><th>Status</th><th>Median days</th><th>Slowest quarter from</th><th>Leads measured</th></tr></thead>
                    <tbody>{data.timeInStatus.map((row) => <tr key={row.code}><td>{row.label}</td><td>{row.medianDays ?? "—"}</td><td>{row.p75Days ?? "—"}</td><td>{row.samples}</td></tr>)}</tbody></table>
                </>
              )}
            </section>
            <section className="panel analytics-panel">
              <div className="panel-heading"><div><h2>Leaderboard</h2><p>Per salesperson in the period</p></div></div>
              <table className="opp-table"><thead><tr><th>Salesperson</th><th>Leads created</th><th>Conversions</th><th>Activities</th><th>Overdue follow-ups</th><th>From the pool</th></tr></thead>
                <tbody>{data.leaderboard.map((row) => <tr key={row.ownerId}><td><strong>{row.name}</strong></td><td>{row.leadsCreated}</td><td>{row.conversions}</td><td>{row.activities}</td><td>{row.overdueFollowUps}</td><td>{row.opportunitiesTaken}</td></tr>)}
                  {data.leaderboard.length === 0 && <tr><td colSpan={6} className="empty-state">No people to report on.</td></tr>}</tbody></table>
            </section>
          </div>

          <section className="panel analytics-panel">
            <div className="panel-heading">
              <div><h2>Stalled leads</h2><p>{data.stalled.total} lead{data.stalled.total === 1 ? "" : "s"} longer in a status or quiet for longer than the needs-attention rules allow, or with an overdue follow-up; worst first</p></div>
              <button type="button" className="button button-outline button-small" disabled={!data.stalled.leads.length} onClick={() => downloadCsv("leadtrailpro-stalled-leads.csv", ["Client", "Status", "Owner", "Days in status", "Allowed", "Days since activity", "Follow-up", "Reasons"], data.stalled.leads.map((lead) => [lead.clientName, lead.statusLabel, lead.ownerName, lead.daysInStatus, lead.allowedDays, lead.daysSinceActivity, lead.followUpDate ?? "", lead.reasons.join("; ")]))}><Download size={13} /> CSV</button>
            </div>
            {data.stalled.leads.length === 0 ? <EmptyState icon={<Users size={22} />} title="Nothing is stalled" text="Every active lead is within its limits." /> : (
              <table className="opp-table stalled-table">
                <thead><tr><th>Client</th><th>Status</th><th>Owner</th><th>Why</th><th>In status</th><th>Quiet for</th><th aria-label="Open" /></tr></thead>
                <tbody>
                  {data.stalled.leads.map((lead) => (
                    <tr key={lead.id}>
                      <td><strong>{lead.clientName}</strong></td>
                      <td><StatusPill status={lead.statusLabel} code={lead.statusCode} /></td>
                      <td>{lead.ownerName}</td>
                      <td className="opp-details">{lead.reasons.join(" · ")}</td>
                      <td>{lead.daysInStatus} d <small className="muted-cell">limit {lead.allowedDays}</small></td>
                      <td>{lead.daysSinceActivity} d</td>
                      <td><button type="button" className="button button-outline button-small" onClick={() => openLead(lead.id)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {can("view_leads") && (
            <section className="panel analytics-panel">
              <div className="panel-heading"><div><h2>Opportunity pool</h2><p>What the job searches found in the period and what became of it</p></div></div>
              <div className="opportunity-stats">
                <div className="small-stat"><div className="small-stat-top"><span>Listings found</span><span className="small-stat-icon"><Briefcase size={15} /></span></div><strong>{data.pool.totals.found}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>New companies</span></div><strong>{data.pool.totals.newCompanies}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Assigned as leads</span></div><strong>{data.pool.totals.assigned}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Not relevant</span></div><strong>{data.pool.totals.notRelevant}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Fed existing leads</span></div><strong>{data.pool.totals.attached}</strong></div>
                <div className="small-stat"><div className="small-stat-top"><span>Median time to assign</span></div><strong>{data.pool.totals.medianHoursToAssign === null ? "—" : data.pool.totals.medianHoursToAssign >= 48 ? `${Math.round(data.pool.totals.medianHoursToAssign / 24)} d` : `${Math.round(data.pool.totals.medianHoursToAssign)} h`}</strong></div>
              </div>
              <div className="analytics-grid">
                <div>
                  <h3 className="analytics-subtitle">Per run</h3>
                  {data.pool.runs.length === 0 ? <EmptyState title="No search run in this period" /> : (
                    <StackedBars height={220} xKey="date" series={[{ key: "newCompanies", label: "New companies", color: seriesColors[0] }, { key: "attached", label: "Fed existing leads", color: seriesColors[2] }]} data={data.pool.runs.map((run) => ({ date: formatShortDate(run.date), newCompanies: run.newCompanies, attached: run.attached }))} />
                  )}
                </div>
                <div>
                  <h3 className="analytics-subtitle">By job type</h3>
                  {data.pool.byJobType.length === 0 ? <EmptyState title="No listings in this period" /> : (
                    <StackedBars horizontal height={Math.max(140, 30 * data.pool.byJobType.length + 50)} xKey="type" series={[{ key: "assigned", label: "Assigned", color: seriesColors[2] }, { key: "rest", label: "Not assigned", color: seriesColors[0] }]} data={data.pool.byJobType.map((row) => ({ type: row.type, assigned: row.assigned, rest: Math.max(0, row.companies - row.assigned) }))} />
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="panel analytics-panel">
            <div className="panel-heading"><div><h2>Where the leads are</h2><p>Active leads by industry, city, and lead type, with how many are clients; and the clients worked most in the period</p></div></div>
            <div className="analytics-grid analytics-grid-3">
              {([["Industry", data.breakdown.industries], ["City", data.breakdown.cities], ["Lead type", data.breakdown.leadTypes]] as const).map(([title, rows]) => (
                <div key={title}>
                  <h3 className="analytics-subtitle"><Layers size={13} /> {title}</h3>
                  {rows.length === 0 ? <EmptyState title="No leads" /> : <StackedBars horizontal height={Math.max(140, 28 * rows.length + 50)} xKey="label" series={[{ key: "clients", label: "Clients", color: statusColors.client }, { key: "others", label: "Other leads", color: seriesColors[0] }]} data={rows.map((row) => ({ label: row.label, clients: row.clients, others: row.leads - row.clients }))} />}
                </div>
              ))}
            </div>
            {data.breakdown.topClients.length > 0 && (
              <table className="opp-table"><thead><tr><th>Most worked</th><th>Status</th><th>Owner</th><th>Activities</th></tr></thead>
                <tbody>{data.breakdown.topClients.map((row) => <tr key={row.leadId}><td><button type="button" className="link-button" onClick={() => openLead(row.leadId)}><strong>{row.clientName}</strong></button></td><td>{row.statusLabel}</td><td>{row.ownerName}</td><td>{row.activities}</td></tr>)}</tbody></table>
            )}
          </section>
        </>
      )}
      {drill && (
        <Dialog title={drill.title} eyebrow="LEADS BEHIND THE NUMBER" onClose={() => setDrill(null)}>
          <ErrorText message={drill.error} />
          {!drill.leads && !drill.error && <Loading />}
          {drill.leads && (
            <div className="timeline-list">
              {drill.leads.map((lead) => <article className="timeline-entry" key={lead.id}><div><button className="link-button" onClick={() => { setDrill(null); openLead(lead.id); }}><strong>{lead.clientName}</strong></button><small> · {lead.statusLabel} · {lead.ownerName} · last activity {formatDate(lead.lastActivityAt.slice(0, 10))}</small></div></article>)}
              {!drill.leads.length && <EmptyState title="No leads match" />}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

/**
 * Team board (RPT-02, November 7, 2026): one row per salesperson as things stand now, the people with the most waiting on
 * them first. Every count opens the leads behind it, so a manager can read the lead, comment, reassign, or assign a task.
 */
function TeamBoardSection({ drill }: { drill: (title: string, load: () => Promise<{ leads: LeadSummary[] }>) => void }) {
  const { dataVersion } = useApp();
  const fetcher = useCallback(() => fetchTeamBoard(), []);
  const { data, error } = useAsyncData<TeamBoard>(fetcher, dataVersion);
  const count = (row: TeamBoardRow, metric: TeamBoardMetric, value: number, alert: boolean) => (
    value > 0
      ? <button type="button" className={`link-button board-number${alert ? " is-alert" : ""}`} onClick={() => drill(`${row.name} · ${teamBoardMetricLabels[metric]}`, () => fetchTeamBoardLeads(row.userId, metric))}>{value}</button>
      : <span className="board-zero">0</span>
  );
  return (
    <section className="panel analytics-panel team-board" aria-label="Team board">
      <div className="panel-heading"><div><h2>Team board</h2><p>Where each salesperson stands right now, the people with the most waiting on them first · activity since Monday {data ? formatDate(data.weekStartYmd) : ""}. Click a number for the leads.</p></div></div>
      <ErrorText message={error} />
      {!data && !error && <Loading />}
      {data && (
        <table className="opp-table">
          <thead><tr><th>Salesperson</th><th>Active leads</th><th>Overdue follow-ups</th><th>Stalled</th><th>Client replies waiting</th><th>This week</th><th>Leads created</th><th>Last active</th></tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.userId}>
                <td><strong>{row.name}</strong>{row.role !== "sales_manager" && <small className="muted-cell"> · {row.role === "admin" ? "Admin" : row.role}</small>}</td>
                <td>{count(row, "active", row.activeLeads, false)}</td>
                <td>{count(row, "overdue", row.overdueFollowUps, true)}</td>
                <td>{count(row, "stalled", row.stalled, true)}</td>
                <td>{count(row, "replies", row.repliesWaiting, true)}</td>
                <td><small>{row.calls} calls · {row.emails} emails · {row.visits} visits</small></td>
                <td>{row.leadsCreated}</td>
                <td><small>{row.lastActivityAt ? relativeTime(row.lastActivityAt) : "never"}</small></td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={8} className="empty-state">No salespeople to show.</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}
