"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, ChevronRight, ListTodo, Mail, MapPin, Phone, Plus, Target } from "lucide-react";
import { formatDate, formatDateTime, percentChange, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import type { LeadSummary } from "@/features/leads/model";
import { fetchDashboard } from "@/features/reports/client";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, EmptyState, ErrorText, Loading, StatusPill, Tabs } from "@/features/shell/components";

type FollowUpTab = "overdue" | "today" | "tomorrow";

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

export default function ActionCenter() {
  const { user, can, navigate, openLead, openNewLead, dataVersion } = useApp();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const fetcher = useCallback(() => fetchDashboard(scope), [scope]);
  const { data, error } = useAsyncData(fetcher, dataVersion);
  const [chosenTab, setTab] = useState<FollowUpTab | null>(null);
  // Overdue follow-ups are emphasized by default, per the BRD.
  const tab: FollowUpTab = chosenTab ?? (data?.followUps.overdue.length ? "overdue" : "today");

  const metric = (label: string, icon: React.ReactNode, tone: string, current: number, previous: number) => (
    <button className={`metric-card metric-${tone}`} onClick={() => navigate("reports")} aria-label={`View ${label} report`}>
      <div className="metric-top"><span className={`metric-icon icon-${tone}`}>{icon}</span><span className="metric-change">{percentChange(current, previous)}</span></div>
      <span className="metric-label">{label}</span>
      <div className="metric-value-row"><strong>{current}</strong></div>
      <span className="metric-comparison">{previous} last week · this week vs last week</span>
      <div className="metric-compare"><i style={{ width: `${previous === 0 ? (current > 0 ? 100 : 0) : Math.min(100, Math.round((current / Math.max(previous, current)) * 100))}%` }} /></div>
    </button>
  );

  const followUpRow = (lead: LeadSummary, emphasize: boolean) => (
    <button className={`followup-row ${emphasize ? "row-overdue" : ""}`} key={lead.id} onClick={() => openLead(lead.id)}>
      <Avatar name={lead.clientName} seed={lead.id} />
      <span className="followup-info"><strong>{lead.clientName}</strong><small>{lead.bdAction ?? "No BD action yet"}{lead.clientExecutive ? ` · ${lead.clientExecutive}` : ""}</small></span>
      <StatusPill status={lead.status} code={lead.statusCode} />
      <span className={`followup-time ${emphasize ? "overdue" : ""}`}><Clock3 size={13} /> {formatDate(lead.followUpDate)}</span>
      <span className="followup-owner">{lead.ownerName}</span>
      <ChevronRight className="followup-chevron" size={16} />
    </button>
  );

  const targets = data?.targets;
  const percent = targets?.percent ?? null;

  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">YOUR DAY AT A GLANCE</div>
          <h1>{greeting()}, {user.firstName} <span className="wave">✦</span></h1>
          <p>{data ? `Business day ${formatDate(data.today)}. Here's what's happening with your pipeline.` : "Loading your pipeline..."}</p>
        </div>
        <div className="heading-actions">
          {can("view_team_reports") && (
            <div className="scope-toggle" role="group" aria-label="Dashboard scope">
              <button className={scope === "mine" ? "is-active" : ""} onClick={() => setScope("mine")}>My work</button>
              <button className={scope === "team" ? "is-active" : ""} onClick={() => setScope("team")}>Whole team</button>
            </div>
          )}
          {can("create_leads") && <button className="button button-primary" onClick={openNewLead}><Plus size={17} /> Add a lead</button>}
        </div>
      </div>

      <ErrorText message={error} />
      {!data && !error && <Loading text="Loading your action center..." />}

      {data && (
        <>
          <section className="performance-grid" aria-label="Weekly performance">
            {metric("Calls made", <Phone size={17} />, "blue", data.metrics.calls.thisWeek, data.metrics.calls.lastWeek)}
            {metric("Emails sent", <Mail size={17} />, "purple", data.metrics.emails.thisWeek, data.metrics.emails.lastWeek)}
            {metric("Visits made", <MapPin size={17} />, "orange", data.metrics.visits.thisWeek, data.metrics.visits.lastWeek)}
            <button className="metric-card metric-green" onClick={() => navigate("reports")} aria-label="View target progress">
              <div className="metric-top"><span className="metric-icon icon-green"><Target size={17} /></span><span className="metric-change">{targets?.template?.name ?? "No template"}</span></div>
              <span className="metric-label">Target progress</span>
              <div className="metric-value-row"><strong>{percent === null ? "—" : `${percent}%`}</strong><span className="metric-progress-label">{targets ? `${targets.leads.achieved} / ${targets.leads.target} leads this week` : ""}</span></div>
              <div className="progress-track"><i style={{ width: `${percent ?? 0}%` }} /></div>
            </button>
          </section>

          <div className="dashboard-grid">
            <section className="panel follow-up-panel">
              <div className="panel-heading">
                <div><h2>Follow-ups</h2><p>{data.teamWide ? "Across the whole team" : "Leads you own"}, by follow-up date</p></div>
                <button className="text-button" onClick={() => navigate("tasks")}>View tasks <ArrowRight size={14} /></button>
              </div>
              <Tabs
                tabs={[
                  { id: "overdue", label: "Overdue", count: data.followUps.overdue.length, alert: true },
                  { id: "today", label: "Today", count: data.followUps.today.length },
                  { id: "tomorrow", label: "Tomorrow", count: data.followUps.tomorrow.length },
                ]}
                active={tab}
                onChange={setTab}
              />
              <div className="followup-list">
                {data.followUps[tab].slice(0, 8).map((lead) => followUpRow(lead, tab === "overdue"))}
                {data.followUps[tab].length === 0 && <p className="empty-state">{tab === "overdue" ? "No overdue follow-ups. Nice work!" : tab === "today" ? "You're all caught up for today." : "Nothing scheduled for tomorrow yet."}</p>}
              </div>
              {data.followUps[tab].length > 8 && (
                <div className="panel-footnote"><span className="footnote-dot" /> {data.followUps[tab].length - 8} more <button onClick={() => navigate(data.teamWide ? "all-leads" : "leads", null, { sort: "follow_up", direction: "asc" })}>Open the list <ArrowRight size={13} /></button></div>
              )}
            </section>

            <section className="panel target-panel">
              <div className="panel-heading">
                <div><h2>Your targets</h2><p>{targets?.template ? `${targets.template.name} template` : "No target template assigned yet"}</p></div>
              </div>
              <div className="target-score">
                <div className="target-ring" style={{ background: `conic-gradient(#5f70df ${percent ?? 0}%, #eef0f7 0)` }}><div><strong>{percent === null ? "—" : percent}<span>{percent === null ? "" : "%"}</span></strong><small>of plan</small></div></div>
                <div className="target-breakdown">
                  {targets && [targets.leads, targets.visits, targets.conversions].map((part) => (
                    <div key={part.label}><span>{part.label}</span><strong>{part.achieved} <small>/ {part.target || "—"}</small></strong></div>
                  ))}
                </div>
              </div>
              <div className="target-note"><Target size={14} /><span>{percent === null ? "Ask an administrator to assign a target template." : percent >= 100 ? "You have met this period's plan." : `${100 - percent}% of the plan is still open.`}</span></div>
              <button className="panel-link" onClick={() => navigate("reports")}>View full report <ArrowRight size={14} /></button>
            </section>
          </div>

          <div className="dashboard-grid reminders-grid">
            <section className="panel reminder-panel">
              <div className="panel-heading">
                <div><h2>Needs attention</h2><p>Active leads with no activity for {data.inactivityDays}+ days</p></div>
              </div>
              {data.inactiveLeads.length === 0 ? <EmptyState title="Every lead has recent activity" /> : (
                <div className="followup-list">
                  {data.inactiveLeads.slice(0, 6).map((lead) => (
                    <button className="followup-row" key={lead.id} onClick={() => openLead(lead.id)}>
                      <span className="reminder-icon"><AlertTriangle size={14} /></span>
                      <span className="followup-info"><strong>{lead.clientName}</strong><small>Last activity {relativeTime(lead.lastActivityAt)} · {lead.ownerName}</small></span>
                      <StatusPill status={lead.status} code={lead.statusCode} />
                      <ChevronRight className="followup-chevron" size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="panel reminder-panel">
              <div className="panel-heading">
                <div><h2>Open tasks</h2><p>{data.overdueTaskCount > 0 ? `${data.overdueTaskCount} overdue` : "Nothing overdue"}</p></div>
                <button className="text-button" onClick={() => navigate("tasks")}>All tasks <ArrowRight size={14} /></button>
              </div>
              {data.openTasks.length === 0 ? <EmptyState icon={<ListTodo size={22} />} title="No open tasks" /> : (
                <div className="followup-list">
                  {data.openTasks.slice(0, 6).map((task) => (
                    <button className="followup-row" key={task.id} onClick={() => navigate("tasks", task.id)}>
                      <span className={`priority priority-${task.priority}`}>{task.priority}</span>
                      <span className="followup-info"><strong>{task.title}</strong><small>{task.leadName ?? "No lead"} · {task.assigneeName}</small></span>
                      <span className={`followup-time ${task.dueAt && task.dueAt < new Date().toISOString() ? "overdue" : ""}`}><Clock3 size={13} /> {task.dueAt ? formatDateTime(task.dueAt) : "No due date"}</span>
                      <ChevronRight className="followup-chevron" size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel recent-panel">
            <div className="panel-heading recent-heading">
              <div><h2>Recent leads</h2><p>Latest activity across {data.teamWide ? "the team" : "your"} pipeline</p></div>
              <button className="text-button" onClick={() => navigate(data.teamWide ? "all-leads" : "leads")}>View all leads <ArrowRight size={14} /></button>
            </div>
            <div className="table-scroll">
              <table className="lead-table">
                <thead><tr><th>CLIENT</th><th>STATUS</th><th>LAST BD ACTION</th><th>FOLLOW-UP</th><th>OWNER</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {data.recentLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td><button className="client-cell" onClick={() => openLead(lead.id)}><Avatar name={lead.clientName} seed={lead.id} /><span><strong>{lead.clientName}</strong><small>{lead.clientExecutive || "No contact"}{lead.city ? ` · ${lead.city}` : ""}</small></span></button></td>
                      <td><StatusPill status={lead.status} code={lead.statusCode} /></td>
                      <td><span className="action-cell">{lead.bdAction ?? "—"}</span><small className="activity-time">{relativeTime(lead.lastActivityAt)}</small></td>
                      <td><span className={lead.followUpDate === data.today ? "due-today" : lead.followUpDate && lead.followUpDate < data.today ? "overdue" : "muted-cell"}>{formatDate(lead.followUpDate, "—")}</span></td>
                      <td><span className="owner-cell"><span className="mini-avatar">{lead.ownerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>{lead.ownerName}</span></td>
                      <td><button className="row-more" aria-label={`Open ${lead.clientName}`} onClick={() => openLead(lead.id)}><ChevronRight size={16} /></button></td>
                    </tr>
                  ))}
                  {data.recentLeads.length === 0 && <tr><td colSpan={6} className="empty-state">No active leads yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
