"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Filter,
  Flame,
  LayoutDashboard,
  ListTodo,
  Mail,
  Map,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Status = "Cold" | "Warm" | "Hot" | "Client";

type Lead = {
  id: number;
  name: string;
  contact: string;
  initials: string;
  color: string;
  status: Status;
  action: string;
  followUp: string;
  owner: string;
  city: string;
  industry: string;
  lastActivity: string;
  type: string;
  firstContact: string;
};

const initialLeads: Lead[] = [
  { id: 1, name: "Northstar Logistics", contact: "Elena Vasquez", initials: "NL", color: "violet", status: "Hot", action: "Follow-up call", followUp: "Today", owner: "You", city: "Toronto", industry: "Transportation", lastActivity: "12 min ago", type: "Cold Call", firstContact: "2026-10-13" },
  { id: 2, name: "Meridian Health Group", contact: "James Park", initials: "MH", color: "blue", status: "Warm", action: "Sent proposal", followUp: "Today", owner: "You", city: "Mississauga", industry: "Healthcare", lastActivity: "48 min ago", type: "Cold Email", firstContact: "2026-10-09" },
  { id: 3, name: "Fable & Stone", contact: "Olivia Bennett", initials: "FS", color: "orange", status: "Hot", action: "On-site meeting", followUp: "Tomorrow", owner: "You", city: "Toronto", industry: "Retail", lastActivity: "2 hours ago", type: "Road Trip", firstContact: "2026-10-08" },
  { id: 4, name: "Vertex Manufacturing", contact: "David Kim", initials: "VM", color: "green", status: "Warm", action: "Shared 3 profiles", followUp: "Oct 16", owner: "You", city: "Brampton", industry: "Manufacturing", lastActivity: "Yesterday", type: "Cold Call", firstContact: "2026-10-06" },
  { id: 5, name: "Juniper Hospitality", contact: "Priya Shah", initials: "JH", color: "pink", status: "Cold", action: "First contact", followUp: "Oct 17", owner: "You", city: "Oakville", industry: "Hospitality", lastActivity: "Yesterday", type: "Cold Email", firstContact: "2026-10-05" },
  { id: 6, name: "Brightpath Education", contact: "Marcus Lee", initials: "BE", color: "teal", status: "Client", action: "Contract signed", followUp: "Oct 21", owner: "You", city: "Toronto", industry: "Education", lastActivity: "Oct 12", type: "Road Trip", firstContact: "2026-09-18" },
];

const initialQueuedLeads: Lead[] = [
  { id: 101, name: "Westlake Distribution", contact: "Nina Brooks", initials: "WD", color: "orange", status: "Warm", action: "Historical lead submitted", followUp: "Oct 16", owner: "You", city: "Brampton", industry: "Logistics", lastActivity: "Needs review", type: "Cold Call", firstContact: "2026-08-12" },
  { id: 102, name: "Pinecrest Medical", contact: "Omar Hassan", initials: "PM", color: "teal", status: "Cold", action: "Historical lead submitted", followUp: "Oct 18", owner: "You", city: "Toronto", industry: "Healthcare", lastActivity: "Needs review", type: "Cold Email", firstContact: "2026-07-28" },
];

const initialArchivedLeads: Lead[] = [
  { id: 201, name: "Summit Office Supply", contact: "Grace Wilson", initials: "SO", color: "blue", status: "Cold", action: "No response", followUp: "—", owner: "You", city: "Toronto", industry: "Retail", lastActivity: "Archived Oct 2", type: "Cold Email", firstContact: "2026-09-12" },
];

const navigation: { title: string; items: { id: string; label: string; icon: LucideIcon; count?: string; tone?: string; highlight?: boolean }[] }[] = [
  {
    title: "WORKSPACE",
    items: [
      { id: "home", label: "Action center", icon: LayoutDashboard },
      { id: "leads", label: "My leads", icon: UsersRound, count: "24" },
      { id: "all-leads", label: "All leads", icon: BriefcaseBusiness },
      { id: "Cold", label: "Cold", icon: CircleHelp, tone: "cold" },
      { id: "Warm", label: "Warm", icon: Activity, tone: "warm" },
      { id: "Hot", label: "Hot", icon: Flame, tone: "hot" },
      { id: "Client", label: "Clients", icon: CheckCheck, tone: "client" },
      { id: "queued", label: "Queued leads", icon: Clock3, count: "3" },
      { id: "archive", label: "Archive", icon: FileText },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { id: "opportunities", label: "Opportunities", icon: Sparkles, count: "12", highlight: true },
      { id: "lead-generation", label: "Lead generation", icon: Building2 },
      { id: "tasks", label: "Tasks & reminders", icon: ListTodo, count: "5" },
      { id: "planner", label: "Road visit planner", icon: Map },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { id: "reports", label: "Reports & targets", icon: TrendingUp },
      { id: "admin", label: "Administration", icon: Settings2 },
    ],
  },
];

const opportunities = [
  { company: "Cedarline Foods", title: "Warehouse Operations Manager", location: "Etobicoke, ON", source: "Indeed · 2 days ago", match: 94, color: "green" },
  { company: "Axiom Industrial", title: "Senior Millwright", location: "Vaughan, ON", source: "Company careers · 1 day ago", match: 89, color: "blue" },
  { company: "Everwell Living", title: "Director of Nursing", location: "Toronto, ON", source: "Indeed · 3 days ago", match: 82, color: "orange" },
];

const localDateISO = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function Home() {
  const [activeView, setActiveView] = useState("home");
  const [leads, setLeads] = useState(initialLeads);
  const [queuedLeads, setQueuedLeads] = useState(initialQueuedLeads);
  const [archivedLeads, setArchivedLeads] = useState(initialArchivedLeads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selected, setSelected] = useState<number[]>([]);
  const [dialog, setDialog] = useState<"new-lead" | "lead-detail" | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [newOpportunities, setNewOpportunities] = useState(opportunities);
  const [generated, setGenerated] = useState(false);

  const filteredLeads = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const source = activeView === "archive" ? archivedLeads : activeView === "queued" ? queuedLeads : leads;
    return source.filter((lead) => {
      const matchesSearch =
        !normalized ||
        [lead.name, lead.contact, lead.status, lead.action, lead.city, lead.industry, lead.owner]
          .some((value) => value.toLowerCase().includes(normalized));
      const status = ["Cold", "Warm", "Hot", "Client"].includes(activeView) ? activeView : statusFilter;
      const matchesStatus = status === "All statuses" || lead.status === status;
      const matchesView = activeView !== "leads" || lead.owner === "You";
      return matchesSearch && matchesStatus && matchesView;
    });
  }, [activeView, archivedLeads, leads, queuedLeads, search, statusFilter]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const navigate = (id: string) => {
    setActiveView(id);
    setSearch("");
    setStatusFilter("All statuses");
    setSelected([]);
    setMobileNavOpen(false);
  };

  const openLead = (lead: Lead) => {
    setActiveLead(lead);
    setDialog("lead-detail");
  };

  const createLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    const statusOptions: Status[] = ["Cold", "Warm", "Hot", "Client"];
    const firstContact = String(data.get("firstContact") || localDateISO());
    const newLead: Lead = {
      id: Date.now(),
      name,
      contact: String(data.get("contact") || "New contact"),
      initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      color: "blue",
      status: statusOptions.find((status) => status === data.get("status")) ?? "Cold",
      action: "New lead created",
      followUp: String(data.get("followUp") || "Not set"),
      owner: "You",
      city: String(data.get("city") || "Toronto"),
      industry: String(data.get("industry") || "Other"),
      lastActivity: "Just now",
      type: String(data.get("type") || "Cold Call"),
      firstContact,
    };
    if (firstContact < localDateISO(-1)) {
      setQueuedLeads((current) => [newLead, ...current]);
      setDialog(null);
      navigate("queued");
      notify(`${name} saved as a queued lead for Admin approval`);
      return;
    }
    setLeads((current) => [newLead, ...current]);
    setDialog(null);
    navigate("leads");
    notify(`${name} added to your leads`);
  };

  const archiveSelected = () => {
    if (!selected.length) return;
    const count = selected.length;
    if (activeView === "archive") {
      const restored = archivedLeads.filter((lead) => selected.includes(lead.id));
      setArchivedLeads((current) => current.filter((lead) => !selected.includes(lead.id)));
      setLeads((current) => [...restored, ...current]);
      setSelected([]);
      notify(`${count} ${count === 1 ? "lead" : "leads"} restored to your pipeline`);
      return;
    }
    const toArchive = leads.filter((lead) => selected.includes(lead.id));
    setArchivedLeads((current) => [...toArchive, ...current]);
    setLeads((current) => current.filter((lead) => !selected.includes(lead.id)));
    setSelected([]);
    notify(`${count} ${count === 1 ? "lead" : "leads"} moved to archive`);
  };

  const reviewQueuedLead = (lead: Lead, approve: boolean) => {
    setQueuedLeads((current) => current.filter((item) => item.id !== lead.id));
    if (approve) setLeads((current) => [{ ...lead, action: "Queued lead approved", lastActivity: "Just now" }, ...current]);
    notify(approve ? `${lead.name} approved and added to the pipeline` : `${lead.name} rejected`);
  };

  const toggleSelected = (id: number) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const pageTitles: Record<string, string> = {
    home: "Action center",
    leads: "My leads",
    "all-leads": "All leads",
    Cold: "Cold leads",
    Warm: "Warm leads",
    Hot: "Hot leads",
    Client: "Clients",
    queued: "Queued leads",
    archive: "Archive",
    opportunities: "Opportunity recommendations",
    "lead-generation": "Lead generation",
    tasks: "Tasks & reminders",
    planner: "Road visit planner",
    reports: "Reports & targets",
    admin: "Administration",
  };

  const renderLeads = (mode: "table" | "follow-up" = "table") => (
    <div className="lead-list-wrap">
      <div className="lead-toolbar">
        <div className="search-field lead-search">
          <Search size={16} />
          <input
            aria-label="Search leads"
            placeholder="Search clients, contacts, notes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <label className="select-filter">
          <Filter size={15} />
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All statuses</option>
            <option>Cold</option>
            <option>Warm</option>
            <option>Hot</option>
            <option>Client</option>
          </select>
          <ChevronDown size={14} />
        </label>
        <button className="icon-button filter-button" aria-label="More filters" onClick={() => notify("Advanced filters are ready to configure.")}>
          <SlidersHorizontalIcon />
        </button>
      </div>
      {selected.length > 0 && activeView !== "queued" && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          <button onClick={archiveSelected}><FileText size={14} /> {activeView === "archive" ? "Restore selected" : "Archive selected"}</button>
          <button className="bulk-clear" onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      <div className="table-scroll">
        <table className="lead-table">
          <thead>
            <tr>
              <th><input aria-label="Select all leads" type="checkbox" checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selected.includes(lead.id))} onChange={(event) => setSelected(event.target.checked ? filteredLeads.map((lead) => lead.id) : [])} /></th>
              <th>CLIENT</th>
              <th>STATUS</th>
              <th>LAST BD ACTION</th>
              <th>FOLLOW-UP</th>
              <th>OWNER</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className={mode === "follow-up" && lead.followUp === "Today" ? "row-due" : ""}>
                <td><input aria-label={`Select ${lead.name}`} type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggleSelected(lead.id)} /></td>
                <td>
                  <button className="client-cell" onClick={() => openLead(lead)}>
                    <span className={`avatar avatar-${lead.color}`}>{lead.initials}</span>
                    <span><strong>{lead.name}</strong><small>{lead.contact} · {lead.city}</small></span>
                  </button>
                </td>
                <td><span className={`status-pill status-${lead.status.toLowerCase()}`}><i />{lead.status}</span></td>
                <td><span className="action-cell">{lead.action}</span><small className="activity-time">{lead.lastActivity}</small></td>
                <td><span className={lead.followUp === "Today" ? "due-today" : "muted-cell"}>{lead.followUp === "Today" && <Clock3 size={13} />}{lead.followUp}</span></td>
                <td><span className="owner-cell"><span className="mini-avatar">SL</span>{lead.owner}</span></td>
                <td>
                  {activeView === "queued" ? (
                    <span className="review-actions"><button onClick={() => reviewQueuedLead(lead, true)}>Approve</button><button onClick={() => reviewQueuedLead(lead, false)}>Reject</button></span>
                  ) : activeView === "archive" ? (
                    <button className="restore-button" onClick={() => { setArchivedLeads((current) => current.filter((item) => item.id !== lead.id)); setLeads((current) => [lead, ...current]); notify(`${lead.name} restored to your pipeline`); }}>Restore</button>
                  ) : (
                    <button className="row-more" aria-label={`Open ${lead.name}`} onClick={() => openLead(lead)}><MoreHorizontal size={18} /></button>
                  )}
                </td>
              </tr>
            ))}
            {!filteredLeads.length && <tr><td colSpan={7} className="empty-state">No leads match your search. Try another name or status.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>Showing <strong>{filteredLeads.length}</strong> of <strong>{activeView === "archive" ? archivedLeads.length : activeView === "queued" ? queuedLeads.length : leads.length}</strong> leads</span><button onClick={() => notify("You’re viewing the latest activity first.")}>Recently active <ChevronDown size={14} /></button></div>
    </div>
  );

  const renderDashboard = () => (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">YOUR DAY AT A GLANCE</div>
          <h1>Good morning, Sarah <span className="wave">✦</span></h1>
          <p>Here’s what’s happening with your pipeline today.</p>
        </div>
        <button className="button button-primary" onClick={() => setDialog("new-lead")}><Plus size={17} /> Add a lead</button>
      </div>

      <section className="performance-grid" aria-label="Weekly performance">
        <MetricCard icon={<Phone size={17} />} label="Calls made" value="24" change="+26%" comparison="vs. last week" series="M8 31 C20 28 23 18 34 23 S50 25 60 15 S77 21 87 10 S102 14 114 4" tone="blue" onClick={() => navigate("leads")} />
        <MetricCard icon={<Mail size={17} />} label="Emails sent" value="31" change="+12%" comparison="vs. last week" series="M8 27 C17 30 23 17 34 22 S49 13 61 18 S76 8 87 12 S102 8 114 4" tone="purple" onClick={() => navigate("leads")} />
        <MetricCard icon={<MapPin size={17} />} label="Visits made" value="12" change="+8%" comparison="vs. last week" series="M8 27 C18 23 24 29 34 18 S48 26 59 18 S76 20 86 9 S102 14 114 4" tone="orange" onClick={() => navigate("planner")} />
        <MetricCard icon={<Target size={17} />} label="Monthly target" value="78%" change="18 / 23 leads" comparison="5 leads to goal" series="M8 28 C18 25 24 19 34 22 S50 13 61 16 S74 9 86 12 S102 5 114 4" tone="green" progress={78} onClick={() => navigate("reports")} />
      </section>

      <div className="dashboard-grid">
        <section className="panel follow-up-panel">
          <div className="panel-heading">
            <div><h2>Follow-ups</h2><p>Stay on top of every conversation</p></div>
            <button className="text-button" onClick={() => navigate("tasks")}>View tasks <ArrowRight size={14} /></button>
          </div>
          <div className="followup-tabs">
            <button className="followup-tab is-active">Today <span>4</span></button>
            <button className="followup-tab" onClick={() => notify("No overdue follow-ups. Nice work!")}>Overdue <span className="tab-alert">2</span></button>
            <button className="followup-tab" onClick={() => notify("Showing tomorrow’s planned follow-ups.")}>Tomorrow <span>3</span></button>
          </div>
          <div className="followup-list">
            {leads.filter((lead) => lead.followUp === "Today").slice(0, 3).map((lead) => (
              <button className="followup-row" key={lead.id} onClick={() => openLead(lead)}>
                <span className={`avatar avatar-${lead.color}`}>{lead.initials}</span>
                <span className="followup-info"><strong>{lead.name}</strong><small>{lead.action} · {lead.contact}</small></span>
                <span className={`status-pill status-${lead.status.toLowerCase()}`}><i />{lead.status}</span>
                <span className="followup-time"><Clock3 size={13} /> 10:30 AM</span>
                <ChevronRight className="followup-chevron" size={16} />
              </button>
            ))}
            {leads.filter((lead) => lead.followUp === "Today").length === 0 && <p className="empty-state">You’re all caught up for today.</p>}
          </div>
          <div className="panel-footnote"><span className="footnote-dot" /> 2 follow-ups are past due <button onClick={() => notify("Overdue follow-ups are highlighted in your task list.")}>Review <ArrowRight size={13} /></button></div>
        </section>

        <section className="panel target-panel">
          <div className="panel-heading">
            <div><h2>Your targets</h2><p>October · Training stage</p></div>
            <button className="icon-button subtle-icon" aria-label="Target settings" onClick={() => navigate("reports")}><MoreHorizontal size={18} /></button>
          </div>
          <div className="target-score">
            <div className="target-ring"><div><strong>78<span>%</span></strong><small>monthly goal</small></div></div>
            <div className="target-breakdown"><div><span>Leads created</span><strong>18 <small>/ 23</small></strong></div><div><span>Road visits</span><strong>12 <small>/ 15</small></strong></div><div><span>Conversions</span><strong>4 <small>/ 6</small></strong></div></div>
          </div>
          <div className="target-note"><Sparkles size={14} /><span>You’re <strong>2 leads ahead</strong> of your pace this month.</span></div>
          <button className="panel-link" onClick={() => navigate("reports")}>View target progress <ArrowRight size={14} /></button>
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-heading recent-heading">
          <div><h2>Recent leads</h2><p>Latest activity across your pipeline</p></div>
          <button className="text-button" onClick={() => navigate("leads")}>View all leads <ArrowRight size={14} /></button>
        </div>
        {renderLeads("follow-up")}
      </section>

      <section className="opportunity-banner">
        <div className="opportunity-banner-icon"><Sparkles size={19} /></div>
        <div className="opportunity-banner-copy"><strong>12 new opportunities found for you</strong><span>3 saved searches found relevant job postings overnight.</span></div>
        <button className="button button-light" onClick={() => navigate("opportunities")}>Review opportunities <ArrowRight size={15} /></button>
        <button className="banner-close" aria-label="Dismiss opportunities banner" onClick={(event) => event.currentTarget.parentElement?.remove()}><X size={16} /></button>
      </section>
    </>
  );

  const renderLeadPage = () => (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">YOUR PIPELINE <span className="eyebrow-dot">·</span> {filteredLeads.length} RECORDS</div><h1>{pageTitles[activeView]}</h1><p>Manage relationships and keep every opportunity moving forward.</p></div>
        <button className="button button-primary" onClick={() => setDialog("new-lead")}><Plus size={17} /> Add a lead</button>
      </div>
      <div className="lead-summary-strip">
        <span><i className="summary-dot dot-blue" /> <strong>24</strong> total leads</span><span><i className="summary-dot dot-orange" /> <strong>8</strong> need follow-up</span><span><i className="summary-dot dot-green" /> <strong>4</strong> converted this month</span>
      </div>
      <section className="panel leads-panel">
        <div className="panel-heading leads-panel-heading"><div><h2>All leads</h2><p>Sorted by most recent activity</p></div><button className="icon-button subtle-icon" aria-label="Lead list options" onClick={() => notify("List preferences opened.")}><MoreHorizontal size={18} /></button></div>
        {renderLeads()}
      </section>
    </>
  );

  const renderOpportunities = () => (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">OPPORTUNITY RECOMMENDATION <span className="eyebrow-dot">·</span> UPDATED TODAY</div><h1>Find your next opportunity</h1><p>Relevant hiring signals from your saved searches, all in one place.</p></div>
        <button className="button button-primary" onClick={() => notify("Search terms are ready to configure when a job source is connected.")}><Plus size={17} /> New search term</button>
      </div>
      <div className="opportunity-stats">
        <SmallStat label="New opportunities" value={newOpportunities.length.toString().padStart(2, "0")} note="Since your last visit" icon={<Sparkles size={17} />} />
        <SmallStat label="Found this week" value="38" note="+12% from last week" icon={<TrendingUp size={17} />} />
        <SmallStat label="Converted to leads" value="06" note="This month" icon={<ArrowRight size={17} />} />
        <SmallStat label="Active searches" value="04" note="Across 2 channels" icon={<Search size={17} />} />
      </div>
      <div className="panel opportunity-list-panel">
        <div className="panel-heading"><div><h2>Recommended for you</h2><p>Matched to your locations and staffing focus</p></div><button className="text-button" onClick={() => notify("Showing all active recommendations.")}>View history <ArrowRight size={14} /></button></div>
        <div className="opportunity-filters"><button className="filter-chip active-chip">All new <span>{newOpportunities.length}</span></button><button className="filter-chip" onClick={() => notify("Filtered to the Indeed channel.")}>Indeed</button><button className="filter-chip" onClick={() => notify("Filtered to company career pages.")}>Career pages</button><button className="filter-chip filter-date"><CalendarDays size={14} /> Last 7 days <ChevronDown size={13} /></button></div>
        <div className="recommendation-list">
          {newOpportunities.map((opportunity, index) => (
            <article className="recommendation-card" key={opportunity.company}>
              <div className={`recommendation-logo logo-${opportunity.color}`}>{opportunity.company.split(/\s+/).map((word) => word[0]).join("").slice(0, 2)}</div>
              <div className="recommendation-main"><div className="recommendation-title"><h3>{opportunity.company}</h3><span className="new-badge">NEW</span></div><strong>{opportunity.title}</strong><div className="recommendation-meta"><span><MapPin size={13} />{opportunity.location}</span><span><BriefcaseBusiness size={13} />Full-time</span><span>{opportunity.source}</span></div></div>
              <div className="match-score"><span>{opportunity.match}%</span><small>match</small></div>
              <div className="recommendation-actions"><button className="button button-primary button-small" onClick={() => { setNewOpportunities((current) => current.filter((item) => item.company !== opportunity.company)); notify(`${opportunity.company} converted to a lead`); }}>Convert to lead <ArrowRight size={14} /></button><button className="icon-button recommendation-more" aria-label={`More actions for ${opportunity.company}`} onClick={() => { setNewOpportunities((current) => current.filter((item) => item.company !== opportunity.company)); notify("Opportunity marked as irrelevant."); }}><MoreHorizontal size={18} /></button></div>
              {index < newOpportunities.length - 1 && <span className="recommendation-separator" />}
            </article>
          ))}
          {!newOpportunities.length && <div className="empty-opportunities"><Check size={22} /><strong>You’re all caught up</strong><span>New matching opportunities will show up here.</span></div>}
        </div>
        <div className="source-note"><ShieldCheck size={14} /> Job source connections are a demo preview. Connect approved sources to receive live listings.</div>
      </div>
      <div className="saved-search-row"><div className="saved-search-icon"><Search size={16} /></div><div><strong>Your saved searches</strong><span>Maintenance Hiring · GTA &nbsp; · &nbsp; Healthcare Leadership · Toronto</span></div><button className="text-button" onClick={() => notify("Saved search settings opened.")}>Manage searches <ArrowRight size={14} /></button></div>
    </>
  );

  const renderTasks = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">YOUR WORKDAY <span className="eyebrow-dot">·</span> 5 OPEN</div><h1>Tasks & reminders</h1><p>Every next step, organized so nothing slips through the cracks.</p></div><button className="button button-primary" onClick={() => notify("New task form opened.")}><Plus size={17} /> Create task</button></div>
      <div className="task-columns">
        <TaskColumn title="Overdue" count="2" tone="red" tasks={[["Call back about the revised contract", "Northstar Logistics · Yesterday, 3:00 PM", "High"], ["Send shortlist of 3 candidates", "Meridian Health Group · Yesterday, 5:00 PM", "Medium"]]} onComplete={() => notify("Task marked complete.")} />
        <TaskColumn title="Today" count="3" tone="blue" tasks={[["Follow up on staffing proposal", "Northstar Logistics · 10:30 AM", "High"], ["Confirm Thursday site visit", "Fable & Stone · 1:00 PM", "Medium"], ["Share candidate profiles", "Vertex Manufacturing · 3:30 PM", "Normal"]]} onComplete={() => notify("Task marked complete.")} />
        <TaskColumn title="Upcoming" count="4" tone="green" tasks={[["Introductory call with HR", "Juniper Hospitality · Oct 17", "Normal"], ["Quarterly check-in", "Brightpath Education · Oct 21", "Low"]]} onComplete={() => notify("Task marked complete.")} />
      </div>
    </>
  );

  const renderPlanner = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">PLAN YOUR DAY <span className="eyebrow-dot">·</span> TORONTO, ON</div><h1>Road visit planner</h1><p>Make the most of every mile with a thoughtful route.</p></div><button className="button button-primary" onClick={() => notify("Add a stop to start planning your route.")}><Plus size={17} /> Add a stop</button></div>
      <div className="planner-toolbar panel"><div className="planner-date"><CalendarDays size={17} /><strong>Wednesday, October 14</strong><ChevronDown size={14} /></div><span className="planner-route-note"><MapPin size={14} /> 4 stops <span>·</span> 26 km total</span><button className="button button-outline" onClick={() => notify("Route optimized for travel time.")}><Sparkles size={15} /> Optimize route</button></div>
      <div className="planner-layout"><div className="panel route-panel"><div className="panel-heading"><div><h2>Today’s route</h2><p>Estimated drive time: 1 hr 12 min</p></div><button className="text-button" onClick={() => notify("Route shared with your team.")}>Share route <ArrowRight size={14} /></button></div><div className="route-stops"><RouteStop time="9:00 AM" company="Northstar Logistics" address="2300 Finch Ave W, Toronto" status="Visit planned" color="violet" /><RouteStop time="10:45 AM" company="Axiom Industrial" address="8000 Keele St, Vaughan" status="Visit planned" color="blue" /><RouteStop time="1:30 PM" company="Lunch break" address="30 minutes · near your route" status="30 min" color="orange" lunch /><RouteStop time="2:15 PM" company="Cedarline Foods" address="100 Carrier Dr, Etobicoke" status="Visit planned" color="green" /><RouteStop time="3:45 PM" company="Fable & Stone" address="180 Queen St W, Toronto" status="Visit planned" color="pink" /></div></div><div className="map-placeholder"><div className="map-grid" /><span className="map-water" /><span className="map-label label-one">NORTH YORK</span><span className="map-label label-two">ETOBICOKE</span><span className="map-label label-three">TORONTO</span><div className="map-route-line" /><span className="map-pin pin-one">1</span><span className="map-pin pin-two">2</span><span className="map-pin pin-three">3</span><span className="map-pin pin-four">4</span><div className="map-controls"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div><span className="map-attribution">Map preview</span></div></div>
    </>
  );

  const renderLeadGeneration = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">DISCOVER YOUR NEXT CLIENT</div><h1>Lead generation</h1><p>Explore a company and find a thoughtful way to start a conversation.</p></div></div>
      <div className="panel generation-panel"><div className="generation-intro"><div className="generation-icon"><Sparkles size={20} /></div><div><h2>Research a company</h2><p>Get a quick brief, hiring signals, and a tailored introduction.</p></div></div><form className="generation-form" onSubmit={(event) => { event.preventDefault(); setGenerated(true); notify("Company brief generated from sample preview data."); }}><label>Company name<input required placeholder="e.g. Acme Industries" /></label><label>Company website<input type="url" placeholder="https://company.com" /></label><label>Search radius<span className="input-with-suffix"><input type="number" defaultValue="25" min="1" /><span>km</span></span></label><button className="button button-primary" type="submit"><Sparkles size={16} /> Generate company brief</button></form>{generated && <div className="generated-brief"><div className="brief-heading"><div><span className="eyebrow">COMPANY BRIEF · PREVIEW</span><h2>Acme Industries</h2></div><span className="match-score"><span>86%</span><small>fit score</small></span></div><p>Growing regional manufacturer with a strong footprint across the Greater Toronto Area. Recent hiring activity suggests expansion in operations and skilled trades.</p><div className="brief-pills"><span><BriefcaseBusiness size={13} /> 4 open roles</span><span><MapPin size={13} /> Within 25 km</span><span><Building2 size={13} /> Manufacturing</span></div><div className="brief-actions"><button className="button button-outline" onClick={() => notify("Acme Industries added to your lead generation list.")}>Save to my list</button><button className="button button-primary" onClick={() => { setDialog("new-lead"); }}>Create a lead <ArrowRight size={14} /></button></div></div>}</div>
      <div className="integration-note"><ShieldCheck size={16} /><span><strong>Source transparency matters.</strong> Company research, reviews, and job sources require connected, approved integrations. This preview uses sample content only.</span></div>
    </>
  );

  const renderReports = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">YOUR PERFORMANCE</div><h1>Reports & targets</h1><p>See your momentum and keep your goals in focus.</p></div><button className="button button-outline" onClick={() => notify("Your report export is being prepared.")}><FileText size={16} /> Export report</button></div>
      <div className="report-periods"><button className="active-period">This week</button><button onClick={() => notify("Showing last week’s report.")}>Last week</button><button onClick={() => notify("Showing month-to-date report.")}>This month</button><button onClick={() => notify("Choose a custom date range.")}>Custom range <ChevronDown size={13} /></button></div>
      <div className="opportunity-stats"><SmallStat label="Leads created" value="18" note="Target: 23 this month" icon={<UsersRound size={17} />} /><SmallStat label="Calls made" value="24" note="+26% vs. last week" icon={<Phone size={17} />} /><SmallStat label="Emails sent" value="31" note="+12% vs. last week" icon={<Mail size={17} />} /><SmallStat label="Road visits" value="12" note="Target: 15 this month" icon={<MapPin size={17} />} /></div>
      <div className="panel report-chart-panel"><div className="panel-heading"><div><h2>Activity over time</h2><p>Your weekly interactions by day</p></div><button className="select-filter" onClick={() => notify("Activity chart is showing all interactions.")}>All activity <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-blue" /> Calls</span><span><i className="legend-purple" /> Emails</span><span><i className="legend-orange" /> Visits</span></div><div className="bar-chart"><div className="chart-y-axis"><span>30</span><span>20</span><span>10</span><span>0</span></div><div className="chart-bars">{[["Mon", 44, 58, 26], ["Tue", 69, 46, 34], ["Wed", 85, 73, 53], ["Thu", 57, 67, 30], ["Fri", 72, 83, 45], ["Sat", 24, 18, 12], ["Sun", 16, 25, 9]].map(([day, a, b, c]) => <div className="bar-day" key={day}><div className="bar-stack"><i style={{ height: `${a}%` }} /><i style={{ height: `${b}%` }} /><i style={{ height: `${c}%` }} /></div><small>{day}</small></div>)}</div></div></div>
    </>
  );

  const renderAdmin = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION <span className="eyebrow-dot">·</span> TEAM OVERVIEW</div><h1>Manage your team</h1><p>People, permissions, and the health of your sales pipeline.</p></div><button className="button button-primary" onClick={() => notify("Invite form opened.")}><Plus size={17} /> Invite a teammate</button></div>
      <div className="opportunity-stats"><SmallStat label="Team members" value="12" note="10 active today" icon={<UsersRound size={17} />} /><SmallStat label="Active leads" value="186" note="Across your team" icon={<BriefcaseBusiness size={17} />} /><SmallStat label="Conversions" value="24" note="This month" icon={<TrendingUp size={17} />} /><SmallStat label="Pending approval" value="03" note="Queued leads" icon={<Clock3 size={17} />} /></div>
      <section className="panel team-panel"><div className="panel-heading"><div><h2>Sales manager performance</h2><p>This month · sorted by leads created</p></div><button className="text-button" onClick={() => notify("Team performance report opened.")}>Full report <ArrowRight size={14} /></button></div><div className="table-scroll"><table className="lead-table team-table"><thead><tr><th>TEAM MEMBER</th><th>LEADS</th><th>CALLS</th><th>VISITS</th><th>CONVERSION</th><th>TARGET</th><th /></tr></thead><tbody>{[["SL", "Sarah Lee", "18", "24", "12", "4", "78%"], ["MP", "Michael Patel", "16", "29", "9", "3", "71%"], ["JT", "Jordan Taylor", "14", "21", "11", "5", "84%"], ["AC", "Alex Chen", "11", "18", "8", "2", "63%"]].map((row) => <tr key={row[1]}><td><span className="owner-cell"><span className="mini-avatar">{row[0]}</span><strong>{row[1]}</strong></span></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td>{row[5]}</td><td><span className="target-progress"><i style={{ width: row[6] }} />{row[6]}</span></td><td><button className="row-more" aria-label={`View ${row[1]}`} onClick={() => notify(`${row[1]}'s performance details opened.`)}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div></section>
      <div className="admin-shortcuts"><button className="panel shortcut-card" onClick={() => notify("User management settings opened.")}><UsersRound size={18} /><span><strong>User management</strong><small>Roles, access and account settings</small></span><ChevronRight size={16} /></button><button className="panel shortcut-card" onClick={() => notify("List-of-values settings opened.")}><Settings2 size={18} /><span><strong>List of values</strong><small>Manage statuses and dropdowns</small></span><ChevronRight size={16} /></button><button className="panel shortcut-card" onClick={() => notify("Device authorization settings opened.")}><ShieldCheck size={18} /><span><strong>Device authorization</strong><small>Manage trusted company devices</small></span><ChevronRight size={16} /></button></div>
    </>
  );

  const renderQueuedOrArchive = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">{activeView === "queued" ? "ADMIN REVIEW" : "LEAD HISTORY"}</div><h1>{pageTitles[activeView]}</h1><p>{activeView === "queued" ? "Review historical lead dates before they enter the active pipeline." : "Archived leads are kept for your records and can be restored at any time."}</p></div>{activeView === "queued" && <span className="review-count"><Clock3 size={15} /> 3 awaiting review</span>}</div>
      <section className="panel leads-panel"><div className="panel-heading leads-panel-heading"><div><h2>{activeView === "queued" ? "Awaiting approval" : "Archived leads"}</h2><p>Search across client, contact and lead activity</p></div></div>{renderLeads()}</section>
    </>
  );

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <button className="brand-lockup" onClick={() => navigate("home")} aria-label="SalesTrackPro home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="brand-name">salestrack<span>pro</span></span>
        </button>
        <div className="workspace-switcher"><span className="workspace-icon">N</span><span><strong>Northstar Talent</strong><small>Sales workspace</small></span><ChevronDown size={14} /></div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <span className="nav-label">{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (item.id === "leads" && activeView === "all-leads");
                return (
                  <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${isActive ? "nav-active" : ""} ${item.highlight ? "nav-highlight" : ""} ${item.tone ? `nav-${item.tone}` : ""}`}>
                    <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} /><span>{item.label}</span>{item.count && <span className={`nav-count ${item.highlight ? "count-highlight" : ""}`}>{item.count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div><Sparkles size={15} /><span>QUICK TIP</span></div><p>Keep your leads warm with a timely follow-up.</p><button onClick={() => navigate("tasks")}>See your tasks <ArrowRight size={13} /></button></div>
          <button className="profile-button" onClick={() => notify("Account settings opened.")}><span className="profile-avatar">SL</span><span><strong>Sarah Lee</strong><small>Sales manager</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><span className="breadcrumb-root">Workspace</span><ChevronRight size={14} /><span className="breadcrumb-current">{pageTitles[activeView]}</span></div>
          <div className="topbar-right">
            <button className="global-search" onClick={() => document.querySelector<HTMLInputElement>(".global-search-input")?.focus()}><Search size={16} /><input className="global-search-input" placeholder="Search anything..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></button>
            <button className="topbar-icon" aria-label="Help center" onClick={() => notify("Help center opened.")}><CircleHelp size={18} /></button>
            <button className="topbar-icon notification-button" aria-label="Notifications" onClick={() => notify("You’re all caught up on notifications.")}><Bell size={18} /><i /></button>
            <span className="topbar-divider" />
            <button className="topbar-user" onClick={() => notify("Account menu opened.")}><span className="profile-avatar">SL</span><ChevronDown size={14} /></button>
          </div>
        </header>
        <div className="main-content">
          {activeView === "home" && renderDashboard()}
          {["leads", "all-leads", "Cold", "Warm", "Hot", "Client"].includes(activeView) && renderLeadPage()}
          {activeView === "opportunities" && renderOpportunities()}
          {activeView === "tasks" && renderTasks()}
          {activeView === "planner" && renderPlanner()}
          {activeView === "lead-generation" && renderLeadGeneration()}
          {activeView === "reports" && renderReports()}
          {activeView === "admin" && renderAdmin()}
          {["queued", "archive"].includes(activeView) && renderQueuedOrArchive()}
          <footer className="app-footer"><span>© 2026 SalesTrackPro</span><span><ShieldCheck size={13} /> Your workspace is secure</span><button onClick={() => notify("Help center opened.")}>Need help?</button></footer>
        </div>
      </main>

      {dialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className={`modal ${dialog === "lead-detail" ? "detail-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header"><div><span className="eyebrow">{dialog === "new-lead" ? "YOUR PIPELINE" : "LEAD OVERVIEW"}</span><h2 id="modal-title">{dialog === "new-lead" ? "Add a new lead" : activeLead?.name}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={18} /></button></div>
            {dialog === "new-lead" ? (
              <form className="lead-form" onSubmit={createLead}>
                <label className="field-wide">Client name <input name="name" required placeholder="Company or client name" autoFocus /></label>
                <label>Client executive <input name="contact" placeholder="Contact person" /></label>
                <label>Lead status <select name="status" defaultValue="Cold"><option>Cold</option><option>Warm</option><option>Hot</option><option>Client</option></select></label>
                <label>Lead type <select name="type" defaultValue="Cold Call"><option>Cold Call</option><option>Cold Email</option><option>Road Trip</option></select></label>
                <label>City <input name="city" placeholder="Toronto" /></label>
                <label>Industry <input name="industry" placeholder="e.g. Healthcare" /></label>
                <label>First contact date <input name="firstContact" type="date" /></label>
                <label>Follow-up date <input name="followUp" type="date" /></label>
                <div className="form-note"><ShieldCheck size={14} /> You’ll be set as the lead owner. Historical first-contact dates may need Admin approval.</div>
                <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="button button-primary"><Plus size={15} /> Save lead</button></div>
              </form>
            ) : activeLead && (
              <div className="lead-detail-content">
                <div className="detail-summary"><span className={`avatar avatar-${activeLead.color}`}>{activeLead.initials}</span><div><span className={`status-pill status-${activeLead.status.toLowerCase()}`}><i />{activeLead.status}</span><p>{activeLead.industry} <span>·</span> {activeLead.city}</p></div><button className="button button-outline button-small" onClick={() => notify("Lead ownership transfer opened.")}><UserRound size={14} /> Transfer</button></div>
                <div className="detail-grid"><div><small>CLIENT EXECUTIVE</small><strong>{activeLead.contact}</strong></div><div><small>LEAD OWNER</small><strong>{activeLead.owner === "You" ? "Sarah Lee" : activeLead.owner}</strong></div><div><small>LAST BD ACTION</small><strong>{activeLead.action}</strong></div><div><small>NEXT FOLLOW-UP</small><strong>{activeLead.followUp}</strong></div></div>
                <div className="detail-ai"><Sparkles size={16} /><div><strong>Interaction summary</strong><p>Recent {activeLead.action.toLowerCase()} with {activeLead.contact}. Keep the conversation moving with a timely follow-up.</p></div></div>
                <div className="detail-timeline"><h3>Recent activity</h3><div className="timeline-item"><span className="timeline-dot"><Phone size={13} /></span><div><strong>{activeLead.action}</strong><small>Sarah Lee · {activeLead.lastActivity}</small></div></div><div className="timeline-item"><span className="timeline-dot timeline-purple"><MessageSquare size={13} /></span><div><strong>Lead added to pipeline</strong><small>Sarah Lee · Oct 10, 2026</small></div></div></div>
                <div className="modal-actions"><button className="button button-outline" onClick={() => notify("Lead notes opened.")}><MessageSquare size={15} /> Add note</button><button className="button button-primary" onClick={() => notify("Follow-up task created.")}><CalendarCheck2 size={15} /> Create follow-up</button></div>
              </div>
            )}
          </section>
        </div>
      )}
      {toast && <div className="toast-message"><Check size={16} />{toast}</div>}
    </div>
  );
}

function MetricCard({ icon, label, value, change, comparison, series, tone, progress, onClick }: { icon: ReactNode; label: string; value: string; change: string; comparison: string; series: string; tone: string; progress?: number; onClick: () => void }) {
  return (
    <button className={`metric-card metric-${tone}`} onClick={onClick} aria-label={`View ${label} activity`}>
      <div className="metric-top"><span className={`metric-icon icon-${tone}`}>{icon}</span><span className="metric-change"><ArrowUpRight size={13} />{change}</span></div>
      <span className="metric-label">{label}</span><div className="metric-value-row"><strong>{value}</strong>{progress !== undefined && <span className="metric-progress-label">{comparison}</span>}</div>
      {progress !== undefined ? <div className="progress-track"><i style={{ width: `${progress}%` }} /></div> : <span className="metric-comparison">{comparison}</span>}
      {progress === undefined && <svg className="metric-sparkline" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><path d={series} /></svg>}
    </button>
  );
}

function SmallStat({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return <div className="small-stat"><div className="small-stat-top"><span>{label}</span><span className="small-stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>;
}

function TaskColumn({ title, count, tone, tasks, onComplete }: { title: string; count: string; tone: string; tasks: string[][]; onComplete: () => void }) {
  return <section className="panel task-column"><div className="task-column-heading"><h2><i className={`task-dot task-${tone}`} />{title}</h2><span>{count}</span></div>{tasks.map(([titleText, details, priority]) => <article className="task-card" key={titleText}><button className="task-checkbox" aria-label={`Complete ${titleText}`} onClick={onComplete}><Check size={13} /></button><div className="task-card-content"><strong>{titleText}</strong><small>{details}</small><span className={`priority priority-${priority.toLowerCase()}`}>{priority} priority</span></div><button className="row-more" aria-label="Task actions" onClick={() => onComplete()}><MoreHorizontal size={17} /></button></article>)}</section>;
}

function RouteStop({ time, company, address, status, color, lunch }: { time: string; company: string; address: string; status: string; color: string; lunch?: boolean }) {
  return <div className={`route-stop ${lunch ? "lunch-stop" : ""}`}><div className="route-time">{time}</div><div className={`route-point point-${color}`}>{lunch ? <span>☕</span> : <MapPin size={14} />}</div><div className="route-stop-info"><strong>{company}</strong><small>{address}</small></div><span className="route-status">{status}</span><button className="row-more" aria-label={`Options for ${company}`}><MoreHorizontal size={17} /></button></div>;
}

function SlidersHorizontalIcon() {
  return <Filter size={16} />;
}
