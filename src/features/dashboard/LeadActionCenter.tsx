"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Ban, ChevronRight, Hourglass, Inbox, MapPin, PieChart, Trophy, UserPlus } from "lucide-react";
import { api, toQuery } from "@/lib/api";
import { formatDate, percentChange, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, EmptyState, ErrorText, Loading } from "@/features/shell/components";
import type { LeadDashboard, LeadDashboardItem } from "./lead-dashboard-model";

const fetchLeadDashboard = (scope: "mine" | "team") => api<LeadDashboard>(`/api/dashboard/leads${toQuery({ scope })}`);

/** The Action Center for leads (request of November 20, 2026), shown when Lead is chosen at the top of the Action Center. */
export default function LeadActionCenter({ scope }: { scope: "mine" | "team" }) {
  const { navigate, openLead, dataVersion } = useApp();
  // Recent Leads (request of November 20, 2026): the leads added by hand and the generated ones in one list, All by default.
  const [recentKind, setRecentKind] = useState<"all" | "manual" | "found">("all");
  const fetcher = useCallback(() => fetchLeadDashboard(scope), [scope]);
  const { data, error } = useAsyncData(fetcher, dataVersion);
  const mineQuery: Record<string, string> = { scope: scope === "team" ? "everyone" : "mine" };
  // A lead opens on its page (Leads for one added by hand, Lead Generation for one the searches found), searched by name.
  const openOne = (item: LeadDashboardItem) => navigate(item.origin === "manual" ? "leads" : "lead-generation", null, { q: item.companyName });

  const metric = (label: string, icon: React.ReactNode, tone: string, current: number, previous: number, view: string) => (
    <button className={`metric-card metric-${tone}`} onClick={() => navigate(view, null, mineQuery)} aria-label={`Open ${label}`}>
      <div className="metric-top"><span className={`metric-icon icon-${tone}`}>{icon}</span><span className="metric-change">{percentChange(current, previous)}</span></div>
      <span className="metric-label">{label}</span>
      <div className="metric-value-row"><strong>{current}</strong></div>
      <span className="metric-comparison">{previous} last week · this week vs last week</span>
      <div className="metric-compare"><i style={{ width: `${previous === 0 ? (current > 0 ? 100 : 0) : Math.min(100, Math.round((current / Math.max(previous, current)) * 100))}%` }} /></div>
    </button>
  );

  const row = (item: LeadDashboardItem, detail: string, icon?: React.ReactNode) => (
    <button className="followup-row" key={item.id} onClick={() => openOne(item)}>
      {icon ?? <Avatar name={item.companyName} seed={item.id} />}
      <span className="followup-info"><strong>{item.companyName}</strong><small>{detail}</small></span>
      <span className={`lead-origin-chip origin-${item.origin}`}>{item.origin === "manual" ? "Manual" : "Generated"}</span>
      <ChevronRight className="followup-chevron" size={16} />
    </button>
  );
  const place = (item: LeadDashboardItem) => [item.latestTitle, item.location].filter(Boolean).join(" · ") || "No role or location";

  if (error) return <ErrorText message={error} />;
  if (!data) return <Loading text="Loading your leads..." />;
  const sourceTotal = data.sources.reduce((sum, source) => sum + source.count, 0);
  const recent = recentKind === "manual" ? data.newest : recentKind === "found" ? data.generated
    : [...data.newest, ...data.generated].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, 6);

  return (
    <>
      <section className="performance-grid" aria-label="Weekly lead numbers">
        {metric("Leads added by hand", <UserPlus size={17} />, "blue", data.metrics.added.thisWeek, data.metrics.added.lastWeek, "leads")}
        {metric("Converted to deals", <Trophy size={17} />, "green", data.metrics.converted.thisWeek, data.metrics.converted.lastWeek, "deals")}
        {metric("Not relevant", <Ban size={17} />, "orange", data.metrics.notRelevant.thisWeek, data.metrics.notRelevant.lastWeek, "leads")}
        <button className="metric-card metric-purple" onClick={() => navigate("todo", null, { kind: "leads" })} aria-label="Open To Be Visited">
          <div className="metric-top"><span className="metric-icon icon-purple"><MapPin size={17} /></span><span className="metric-change">{data.onTodo} on To Do</span></div>
          <span className="metric-label">To Be Visited</span>
          <div className="metric-value-row"><strong>{data.toBeVisitedCount}</strong><span className="metric-progress-label">{data.open} {data.open === 1 ? "lead" : "leads"} in the inbox</span></div>
          <div className="progress-track"><i style={{ width: `${data.open ? Math.min(100, Math.round((data.toBeVisitedCount / data.open) * 100)) : 0}%` }} /></div>
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="panel follow-up-panel">
          <div className="panel-heading">
            <div><h2>Recent Leads</h2><p>{data.teamWide ? "Across the whole team" : "Yours"}, in the inbox, latest first</p></div>
            <button className="text-button" onClick={() => navigate(recentKind === "found" ? "lead-generation" : "leads", null, mineQuery)}>{recentKind === "found" ? "View Lead Generation" : "View Leads"} <ArrowRight size={14} /></button>
          </div>
          <div className="scope-toggle recent-leads-filter" role="group" aria-label="Which leads">
            {(["all", "manual", "found"] as const).map((value) => (
              <button key={value} type="button" className={recentKind === value ? "is-active" : ""} aria-pressed={recentKind === value} onClick={() => setRecentKind(value)}>
                {value === "all" ? "All" : value === "manual" ? "Manual" : "Generated"}
              </button>
            ))}
          </div>
          {recent.length === 0
            ? <EmptyState icon={<Inbox size={22} />} title={recentKind === "manual" ? "No lead added by hand in the inbox" : recentKind === "found" ? "No generated lead in the inbox" : "No lead in the inbox"} text={recentKind === "found" ? "Run the searches on Lead Generation." : "Add a lead with the + at the top."} />
            : <div className="followup-list">{recent.map((item) => row(item, `${place(item)} · ${item.origin === "manual" ? `added ${relativeTime(item.createdAt)}${item.addedByName ? ` by ${item.addedByName}` : ""}` : `found ${relativeTime(item.createdAt)}`}`))}</div>}
        </section>

        <section className="panel target-panel">
          <div className="panel-heading">
            <div><h2>Lead Generation</h2><p>{data.open} in the inbox · {data.openManual} added by hand, {data.open - data.openManual} generated</p></div>
          </div>
          {data.sources.length === 0 ? <EmptyState icon={<PieChart size={22} />} title="No lead in the inbox" /> : (
            <div className="lead-sources">
              {data.sources.map((source) => (
                <div className={`lead-source-row${source.count === 0 ? " is-empty" : ""}`} key={source.label}>
                  <span>{source.label}</span>
                  <div className="lead-source-bar"><i style={{ width: `${source.count === 0 ? 0 : Math.max(4, Math.round((source.count / Math.max(sourceTotal, 1)) * 100))}%` }} /></div>
                  <strong>{source.count}</strong>
                </div>
              ))}
            </div>
          )}
          <button className="panel-link" onClick={() => navigate("lead-generation", null, mineQuery)}>Open Lead Generation <ArrowRight size={14} /></button>
        </section>
      </div>

      <div className="dashboard-grid reminders-grid lead-reminders-grid">
        <section className="panel reminder-panel">
          <div className="panel-heading">
            <div><h2>To Be Visited</h2><p>Leads marked To Be Visited, longest first</p></div>
            <button className="text-button" onClick={() => navigate("todo", null, { kind: "leads" })}>To Do <ArrowRight size={14} /></button>
          </div>
          {data.toBeVisited.length === 0 ? <EmptyState icon={<MapPin size={22} />} title="No lead is marked To Be Visited" /> : (
            <div className="followup-list">{data.toBeVisited.map((item) => row(item, `${item.location || "No location"} · marked ${relativeTime(item.todoSince)}`, <span className="reminder-icon"><MapPin size={14} /></span>))}</div>
          )}
        </section>
        <section className="panel reminder-panel">
          <div className="panel-heading">
            <div><h2>Waiting Longest</h2><p>In the inbox the longest, not on a To Do list: convert, mark or set not relevant</p></div>
          </div>
          {data.waiting.length === 0 ? <EmptyState icon={<Hourglass size={22} />} title="No lead is waiting" /> : (
            <div className="followup-list">{data.waiting.map((item) => row(item, `${place(item)} · since ${formatDate(item.createdAt.slice(0, 10))}`, <span className="reminder-icon"><Hourglass size={14} /></span>))}</div>
          )}
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-heading recent-heading">
          <div><h2>Recently Converted</h2><p>Leads that became deals, latest first</p></div>
          <button className="text-button" onClick={() => navigate("deals", "list", mineQuery)}>View All Deals <ArrowRight size={14} /></button>
        </div>
        <div className="table-scroll">
          <table className="lead-table">
            <thead><tr><th>LEAD</th><th>ORIGIN</th><th>CONVERTED</th><th>BY</th><th>DEAL STAGE</th><th>DEAL OWNER</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {data.converted.map((item) => (
                <tr key={item.id}>
                  <td><button className="client-cell" onClick={() => (item.dealId ? openLead(item.dealId) : openOne(item))}><Avatar name={item.companyName} seed={item.id} /><span><strong>{item.companyName}</strong><small>{item.location || "No location"}</small></span></button></td>
                  <td><span className={`lead-origin-chip origin-${item.origin}`}>{item.origin === "manual" ? "Manual" : "Generated"}</span></td>
                  <td><span className="action-cell">{relativeTime(item.decidedAt)}</span></td>
                  <td><span className="muted-cell">{item.decidedByName ?? "—"}</span></td>
                  <td>{item.dealStage ?? <span className="muted-cell">—</span>}</td>
                  <td>{item.dealOwnerName ? <span className="owner-cell"><span className="mini-avatar">{item.dealOwnerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>{item.dealOwnerName}</span> : <span className="muted-cell">—</span>}</td>
                  <td>{item.dealId && <button className="row-more" aria-label={`Open the deal ${item.companyName}`} onClick={() => openLead(item.dealId!)}><ChevronRight size={16} /></button>}</td>
                </tr>
              ))}
              {data.converted.length === 0 && <tr><td colSpan={7} className="empty-state">No lead converted to a deal yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
