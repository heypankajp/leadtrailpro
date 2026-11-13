"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle, BellRing, Building2, CalendarCheck2, Check, ChevronDown, CircleDollarSign, Compass, Contact, FileSpreadsheet, KeyRound, LayoutDashboard, ListChecks, LogOut, Map, Menu,
  PanelLeftClose, PanelLeftOpen, Plus, Radar, Search, Settings2, ShieldCheck, SlidersHorizontal, Target, TrendingUp, UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAsyncData } from "@/lib/useAsyncData";
import ActionCenter from "@/features/dashboard/ActionCenter";
import ChangePasswordDialog from "@/features/auth/ChangePasswordDialog";
import { fetchLeads, fetchTodoCounts } from "@/features/leads/client";
import ContactPage from "@/features/contacts/ContactPage";
import ContactsPage from "@/features/contacts/ContactsPage";
import DealPage from "@/features/leads/DealPage";
import DealsPage from "@/features/leads/DealsPage";
import LeadFormDialog from "@/features/leads/LeadFormDialog";
import type { LeadInput } from "@/features/leads/model";
import LeadListPage from "@/features/leads/LeadListPage";
import NotificationsMenu from "@/features/notifications/NotificationsMenu";
import OpportunitiesPage from "@/features/opportunities/OpportunitiesPage";
import { fetchOpportunities } from "@/features/opportunities/client";
import PreferencesDialog from "@/features/notifications/PreferencesDialog";
import AdminPage, { adminTabs, type AdminTab } from "@/features/admin/AdminPage";
import LeadGenerationPage from "@/features/preview/LeadGenerationPage";
import PlannerPage from "@/features/preview/PlannerPage";
import ReportsPage from "@/features/reports/ReportsPage";
import { fetchTasks } from "@/features/tasks/client";
import TaskFormDialog from "@/features/tasks/TaskFormDialog";
import TasksPage from "@/features/tasks/TasksPage";
import TripResultsPage from "@/features/trips/TripResultsPage";
import TripsPage from "@/features/trips/TripsPage";
import type { SystemRole, UserAccount, UserPrivilege } from "@/features/users/model";
import { hasPrivilege } from "@/features/users/model";
import { AppContext, useHashRoute, type AppContextValue, type Route, type ToastTone } from "./AppContext";
import { fetchReference } from "./client";

type NavItem = { id: string; label: string; icon: LucideIcon; privilege?: UserPrivilege; count?: "queued" | "tasks" | "leads" | "todo"; preview?: boolean; hideForRecruiter?: boolean };

// The first group follows Pipedrive's menu (Deals, Leads, Contacts, Activities, Insights); our own tools come after it.
const navigation: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [
      { id: "home", label: "Action center", icon: LayoutDashboard },
      { id: "deals", label: "Deals", icon: CircleDollarSign, privilege: "view_leads", count: "queued" },
      { id: "leads", label: "Leads", icon: Radar, privilege: "view_leads", count: "leads", hideForRecruiter: true },
      { id: "contacts", label: "Contacts", icon: Contact, privilege: "view_leads" },
      { id: "activities", label: "Activities", icon: CalendarCheck2, count: "tasks" },
      { id: "insights", label: "Insights", icon: TrendingUp, privilege: "view_reports" },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { id: "todo", label: "To Do", icon: ListChecks, privilege: "view_leads", count: "todo", hideForRecruiter: true },
      { id: "trips", label: "Sales trip planner", icon: Compass, privilege: "plan_trips" },
      { id: "lead-generation", label: "Lead generation", icon: Building2, privilege: "create_leads", preview: true },
      { id: "planner", label: "Road visit planner", icon: Map, privilege: "create_leads", preview: true },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { id: "targets", label: "Targets & templates", icon: Target, privilege: "manage_targets" },
      { id: "admin", label: "User management", icon: UsersRound, privilege: "manage_users" },
      { id: "values", label: "List of values", icon: Settings2, privilege: "manage_values" },
      { id: "devices", label: "Device authorization", icon: ShieldCheck, privilege: "manage_settings" },
      { id: "settings", label: "Settings", icon: SlidersHorizontal, privilege: "manage_settings" },
      { id: "import", label: "Tracker import", icon: FileSpreadsheet, privilege: "manage_settings" },
      { id: "api", label: "API access", icon: KeyRound, privilege: "manage_settings" },
    ],
  },
];

const pageTitles: Record<string, string> = {
  home: "Action center", deals: "Deals", leads: "Leads", contacts: "Contacts", activities: "Activities", insights: "Insights", todo: "To Do",
  "lead-generation": "Lead generation", trips: "Sales trip planner", planner: "Road visit planner",
  targets: "Targets & templates", admin: "User management", values: "List of values", devices: "Device authorization", settings: "Settings",
  import: "Tracker import", api: "API access",
};

// Addresses from before the Pipedrive naming (bookmarks, old emails) keep working.
const routeAliases: Record<string, { view: string; param?: string }> = {
  pipeline: { view: "deals", param: "board" }, "all-leads": { view: "deals", param: "list" }, cold: { view: "deals", param: "cold" }, warm: { view: "deals", param: "warm" },
  hot: { view: "deals", param: "hot" }, client: { view: "deals", param: "client" }, queued: { view: "deals", param: "queued" }, archive: { view: "deals", param: "archive" },
  opportunities: { view: "leads" }, tasks: { view: "activities" }, reports: { view: "insights" }, lead: { view: "deal" },
};
const canonicalRoute = (route: Route): Route => {
  const alias = routeAliases[route.view];
  return alias ? { view: alias.view, param: alias.param ?? route.param, query: route.query } : route;
};
// How the open deal page was reached, kept outside React: there is one shell per browser tab, and only event handlers
// and effects read it. `openedInApp` says "Back" may use the browser history; `scrollBefore` is where the page underneath was.
const dealNavigation: { openedInApp: boolean; scrollBefore: number | null } = { openedInApp: false, scrollBefore: null };
const recordViews = ["deal", "organization", "person"];
const sameRoute = (a: Route, b: Route) => a.view === b.view && a.param === b.param && a.query.toString() === b.query.toString();

export default function AppShell({ user, setUser, signOut, passwordSignIn }: { user: UserAccount; setUser: (user: UserAccount) => void; signOut: () => Promise<void>; passwordSignIn: boolean }) {
  const [route, navigate] = useHashRoute();
  const referenceFetcher = useCallback(() => fetchReference(), []);
  const { data: reference, error: referenceError, reload: reloadReference } = useAsyncData(referenceFetcher);
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const [newDeal, setNewDeal] = useState<{ stageId?: number; prefill?: Partial<LeadInput>; organizationId?: number | null; personId?: number | null } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState("");

  const can = useCallback((privilege: UserPrivilege) => hasPrivilege(user, privilege), [user]);
  const refreshReference = useCallback(async () => { reloadReference(); }, [reloadReference]);

  // The deal page (#/deal/12) opens over the page the person was on: that page stays mounted underneath, so its filters,
  // page number, and scroll position are still there when the deal is closed.
  const current = canonicalRoute(route);
  // A record page: a deal, an organization or a person (SPEC §10.13, §10.14).
  const recordId = recordViews.includes(current.view) && current.param && /^\d+$/.test(current.param) ? Number(current.param) : null;
  const dealId = recordId !== null && current.view === "deal" ? recordId : null;
  const contact = recordId !== null && current.view !== "deal" ? { kind: current.view as "organization" | "person", id: recordId } : null;
  const [base, setBase] = useState<Route>(current);
  if (recordId === null && !recordViews.includes(current.view) && !sameRoute(base, current)) setBase(current);
  const recordKey = recordId === null ? null : `${current.view}:${recordId}`;
  useEffect(() => {
    if (recordKey !== null) window.scrollTo(0, 0);
    else if (dealNavigation.scrollBefore !== null) { window.scrollTo(0, dealNavigation.scrollBefore); dealNavigation.scrollBefore = null; }
  }, [recordKey]);

  const countsFetcher = useCallback(async () => {
    const [queued, tasks, leads, todo] = await Promise.all([
      can("review_queued") ? fetchLeads({ state: "queued", pageSize: 1 }).then((page) => page.total).catch(() => 0) : Promise.resolve(0),
      fetchTasks({ status: "open" }).then((result) => result.tasks.length).catch(() => 0),
      can("create_leads") ? fetchOpportunities({ status: "new", pageSize: 1 }).then((page) => page.counts.new).catch(() => 0) : Promise.resolve(0),
      // TODO-04: the person's own leads waiting on a To Do list.
      can("view_leads") ? fetchTodoCounts().then((result) => result.mine).catch(() => 0) : Promise.resolve(0),
    ]);
    return { queued, tasks, leads, todo };
  }, [can]);
  const counts = useAsyncData(countsFetcher, dataVersion).data ?? { queued: 0, tasks: 0, leads: 0, todo: 0 };

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "error" ? 5000 : 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // The Gmail OAuth callback lands on /?gmail=<status>; show the outcome once and clean the URL. The ref keeps the
  // outcome across StrictMode's double effect run, and the toast is raised from a timer callback, not the effect body.
  const gmailOutcome = useRef<string | null>(null);
  useEffect(() => {
    if (gmailOutcome.current === null) {
      const params = new URLSearchParams(window.location.search);
      gmailOutcome.current = params.get("gmail") ?? "";
      if (gmailOutcome.current) {
        params.delete("gmail");
        const search = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
      }
    }
    const outcome = gmailOutcome.current;
    if (!outcome) return;
    const outcomes: Record<string, [string, ToastTone]> = {
      connected: ["Gmail connected. Open a deal's Emails tab to see messages.", "success"],
      declined: ["Signed in without Gmail access. Connect it from a deal's Emails tab when you need it.", "info"],
      denied: ["Gmail connection was cancelled.", "error"],
      failed: ["Gmail could not be connected. Try again.", "error"],
      not_configured: ["Gmail is not configured on this server.", "error"],
    };
    const [message, tone] = outcomes[outcome] ?? ["Gmail status updated.", "info"];
    const timer = window.setTimeout(() => notify(message, tone), 0);
    return () => window.clearTimeout(timer);
  }, [notify]);

  const openLead = useCallback((id: number) => {
    dealNavigation.openedInApp = true;
    if (dealNavigation.scrollBefore === null) dealNavigation.scrollBefore = window.scrollY;
    navigate("deal", id);
  }, [navigate]);
  const openContact = useCallback((kind: "organization" | "person", id: number) => {
    dealNavigation.openedInApp = true;
    if (dealNavigation.scrollBefore === null) dealNavigation.scrollBefore = window.scrollY;
    navigate(kind, id);
  }, [navigate]);
  const openNewLeadFor = useCallback((start: { prefill: Partial<LeadInput>; organizationId?: number | null; personId?: number | null }) => setNewDeal(start), []);
  const openNewLead = useCallback(() => setNewDeal({}), []);
  const openNewLeadIn = useCallback((stageId: number) => setNewDeal({ stageId }), []);
  const openNewActivity = useCallback(() => setActivityOpen(true), []);
  /** Back to the page underneath: one step back in the browser history when the deal was opened from inside the app. */
  const closeDeal = useCallback(() => {
    if (dealNavigation.openedInApp && window.history.length > 1) window.history.back();
    else navigate(base.view === "home" ? "deals" : base.view, base.param, Object.fromEntries(base.query));
  }, [navigate, base]);
  const bumpData = useCallback(() => setDataVersion((value) => value + 1), []);
  const roleLabel = useCallback((role: SystemRole) => reference?.roleLabels[role] ?? role, [reference]);

  const go = useCallback((view: string) => {
    navigate(view);
    setMobileNavOpen(false);
    setMenuOpen(false);
    setAddOpen(false);
  }, [navigate]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate("deals", "list", { q: search.trim() });
    setSearch("");
  };

  const contextValue = useMemo<AppContextValue | null>(() => reference ? ({
    user, setUser, reference, refreshReference, notify, route: base, navigate, openLead, openNewLead, openNewLeadIn, openNewLeadFor, openContact, openNewActivity, signOut, can, roleLabel, dataVersion, bumpData,
  }) : null, [user, setUser, reference, refreshReference, notify, base, navigate, openLead, openNewLead, openNewLeadIn, openNewLeadFor, openContact, openNewActivity, signOut, can, roleLabel, dataVersion, bumpData]);

  const visibleNavigation = navigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => (!item.privilege || can(item.privilege)) && !(item.hideForRecruiter && user.role === "recruiter")),
  })).filter((group) => group.items.length);

  const view = base.view in pageTitles ? base.view : "home";

  if (!contextValue) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <span className="eyebrow">SALES WORKSPACE</span>
          <h1>{referenceError ? "Could not load the workspace" : "Loading your workspace"}</h1>
          <p>{referenceError || "Fetching dropdown values, your team, and settings."}</p>
          {referenceError && <div className="login-form"><button className="button button-primary" onClick={reloadReference}>Try again</button><button className="button button-outline" onClick={() => void signOut()}>Sign out</button></div>}
        </section>
      </main>
    );
  }

  const renderContent = () => {
    if (view === "deals") return can("view_leads") ? <DealsPage key={base.query.toString()} mode={base.param} /> : <NoAccess />;
    if (view === "todo") return <LeadListPage view="todo" />;
    if (view === "leads") return can("view_leads") ? <OpportunitiesPage /> : <NoAccess />;
    if (view === "contacts") return can("view_leads") ? <ContactsPage key={base.param ?? "people"} tab={base.param === "organizations" || base.param === "timeline" ? base.param : "people"} /> : <NoAccess />;
    if (view === "activities") return <TasksPage />;
    if (view === "insights") return can("view_reports") ? <ReportsPage /> : <NoAccess />;
    if (adminTabs.includes(view as AdminTab)) return <AdminPage tab={view as AdminTab} />;
    if (view === "lead-generation") return <LeadGenerationPage />;
    if (view === "trips") return can("plan_trips") ? (base.param && /^\d+$/.test(base.param) ? <TripResultsPage key={base.param} tripId={Number(base.param)} /> : <TripsPage />) : <NoAccess />;
    if (view === "planner") return <PlannerPage />;
    return <ActionCenter />;
  };
  const canAddDeal = can("create_leads");
  const canAddActivity = can("manage_tasks");

  return (
    <AppContext.Provider value={contextValue}>
      <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
        <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
          <button className="brand-lockup" onClick={() => go("home")} aria-label="LeadTrailPro home">
            <span className="brand-mark"><span /><span /><span /></span>
            <span className="brand-name">leadtrail<span>pro</span></span>
          </button>
          <nav className="side-nav" aria-label="Main navigation">
            {visibleNavigation.map((group) => (
              <div className="nav-group" key={group.title || "main"}>
                {group.title && <span className="nav-label">{group.title}</span>}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = dealId !== null ? item.id === "deals" : contact ? item.id === "contacts" : view === item.id;
                  const count = item.count ? counts[item.count] : 0;
                  return (
                    <button
                      key={item.id}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-label={sidebarCollapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => go(item.id)}
                      className={`nav-item ${isActive ? "nav-active" : ""}`}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span>{item.label}</span>
                      {item.preview && <span className="nav-count nav-preview">preview</span>}
                      {item.count && count > 0 && <span className={`nav-count ${item.count === "queued" ? "count-highlight" : ""}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button className="profile-button" onClick={() => void signOut()} title="Sign out">
              <span className="profile-avatar">{user.firstName[0]}{user.lastName[0]}</span>
              <span><strong>{user.name}</strong><small>{roleLabel(user.role)} · Sign out</small></span>
              <LogOut size={16} />
            </button>
          </div>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div className="topbar-left">
              <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
              <button className="sidebar-toggle" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
                <span className="sidebar-toggle-expanded"><PanelLeftClose size={18} /></span>
                <span className="sidebar-toggle-collapsed"><PanelLeftOpen size={18} /></span>
              </button>
              <span className="topbar-title">{dealId !== null ? "Deals" : contact ? "Contacts" : pageTitles[view]}</span>
            </div>
            <div className="topbar-center">
              <form className="global-search" role="search" onSubmit={submitSearch}>
                <Search size={16} />
                <input className="global-search-input" aria-label="Search all deals" placeholder="Search deals..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </form>
              {(canAddDeal || canAddActivity) && (
                <div className="menu-anchor">
                  <button className="quick-add" aria-label="Quick add" title="Quick add" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)}><Plus size={18} /></button>
                  {addOpen && (
                    <div className="menu-dropdown quick-add-menu" role="menu">
                      {canAddDeal && <button role="menuitem" onClick={() => { setAddOpen(false); setNewDeal({}); }}><CircleDollarSign size={14} /> Deal</button>}
                      {canAddActivity && <button role="menuitem" onClick={() => { setAddOpen(false); setActivityOpen(true); }}><CalendarCheck2 size={14} /> Activity</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-right">
              <NotificationsMenu />
              <div className="menu-anchor">
                <button className="topbar-user" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                  <span className="profile-avatar">{user.firstName[0]}{user.lastName[0]}</span><ChevronDown size={14} />
                </button>
                {menuOpen && (
                  <div className="menu-dropdown" role="menu">
                    <div className="menu-heading"><strong>{user.name}</strong><small>{roleLabel(user.role)}</small><small className="menu-email">{user.email}</small></div>
                    {passwordSignIn && (<button role="menuitem" onClick={() => { setMenuOpen(false); setPasswordOpen(true); }}><KeyRound size={14} /> Change password</button>)}
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setPrefsOpen(true); }}><BellRing size={14} /> Notification preferences</button>
                    <button role="menuitem" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div className="main-content" onClick={() => { if (menuOpen) setMenuOpen(false); if (addOpen) setAddOpen(false); }}>
            <div hidden={recordId !== null}>{renderContent()}</div>
            {dealId !== null && <DealPage key={dealId} leadId={dealId} backLabel={pageTitles[view]} onClose={closeDeal} />}
            {contact && (can("view_leads") ? <ContactPage key={`${contact.kind}:${contact.id}`} kind={contact.kind} id={contact.id} backLabel={pageTitles[view]} onClose={closeDeal} /> : <NoAccess />)}
            <footer className="app-footer"><span>© 2026 LeadTrailPro</span><span><ShieldCheck size={13} /> Times shown in your local timezone · business day in {contextValue.reference.timeZone}</span></footer>
          </div>
        </main>

        {newDeal && (
          <LeadFormDialog
            prefill={newDeal.stageId ? { ...newDeal.prefill, stageId: newDeal.stageId } : newDeal.prefill}
            contact={newDeal.organizationId || newDeal.personId ? { organizationId: newDeal.organizationId, personId: newDeal.personId } : undefined}
            onClose={() => setNewDeal(null)}
            onSaved={(lead) => {
              setNewDeal(null);
              bumpData();
              notify(lead.recordState === "queued" ? `${lead.clientName} saved and queued for Admin approval` : `${lead.clientName} added to the pipeline`);
              if (lead.recordState === "queued" && can("review_queued")) navigate("deals", "queued");
              else openLead(lead.id);
            }}
          />
        )}
        {activityOpen && <TaskFormDialog onClose={() => setActivityOpen(false)} onSaved={() => { setActivityOpen(false); bumpData(); notify("Task created"); }} />}
        {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}
        {prefsOpen && <PreferencesDialog onClose={() => setPrefsOpen(false)} />}
        {toast && (
          <div className={`toast-message ${toast.tone === "error" ? "toast-error" : ""}`} role="status">
            {toast.tone === "error" ? <AlertCircle size={16} /> : <Check size={16} />}{toast.message}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}

function NoAccess() {
  return (
    <div className="panel no-access">
      <ShieldCheck size={22} />
      <strong>You do not have access to this area.</strong>
      <span>Ask an administrator if you need it.</span>
    </div>
  );
}
