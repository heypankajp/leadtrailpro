"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle, Activity, BriefcaseBusiness, Building2, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Compass, FileText, Flame, KeyRound,
  BellRing, LayoutDashboard, ListTodo, LogOut, Map, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings2, ShieldCheck, SlidersHorizontal, Target, TrendingUp, UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAsyncData } from "@/lib/useAsyncData";
import ActionCenter from "@/features/dashboard/ActionCenter";
import ChangePasswordDialog from "@/features/auth/ChangePasswordDialog";
import { fetchLeads } from "@/features/leads/client";
import LeadDetailDialog from "@/features/leads/LeadDetailDialog";
import LeadFormDialog from "@/features/leads/LeadFormDialog";
import LeadListPage, { leadListViews, type LeadListView } from "@/features/leads/LeadListPage";
import NotificationsMenu from "@/features/notifications/NotificationsMenu";
import PreferencesDialog from "@/features/notifications/PreferencesDialog";
import AdminPage, { adminTabs, type AdminTab } from "@/features/admin/AdminPage";
import LeadGenerationPage from "@/features/preview/LeadGenerationPage";
import PlannerPage from "@/features/preview/PlannerPage";
import ReportsPage from "@/features/reports/ReportsPage";
import { fetchTasks } from "@/features/tasks/client";
import TasksPage from "@/features/tasks/TasksPage";
import TripResultsPage from "@/features/trips/TripResultsPage";
import TripsPage from "@/features/trips/TripsPage";
import type { SystemRole, UserAccount, UserPrivilege } from "@/features/users/model";
import { hasPrivilege } from "@/features/users/model";
import { AppContext, useHashRoute, type AppContextValue, type ToastTone } from "./AppContext";
import { fetchReference } from "./client";

type NavItem = { id: string; label: string; icon: LucideIcon; privilege?: UserPrivilege; tone?: string; count?: "queued" | "tasks"; preview?: boolean; hideForRecruiter?: boolean };

const navigation: { title: string; items: NavItem[] }[] = [
  {
    title: "WORKSPACE",
    items: [
      { id: "home", label: "Action center", icon: LayoutDashboard },
      { id: "leads", label: "My leads", icon: UsersRound, privilege: "view_leads", hideForRecruiter: true },
      { id: "all-leads", label: "All leads", icon: BriefcaseBusiness, privilege: "view_leads" },
      { id: "cold", label: "Cold leads", icon: CircleHelp, tone: "cold", privilege: "view_leads" },
      { id: "warm", label: "Warm leads", icon: Activity, tone: "warm", privilege: "view_leads" },
      { id: "hot", label: "Hot leads", icon: Flame, tone: "hot", privilege: "view_leads" },
      { id: "client", label: "Clients", icon: CheckCheck, tone: "client", privilege: "view_leads" },
      { id: "queued", label: "Queued leads", icon: Clock3, privilege: "review_queued", count: "queued" },
      { id: "archive", label: "Archive", icon: FileText, privilege: "view_leads" },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { id: "lead-generation", label: "Lead generation", icon: Building2, privilege: "create_leads", preview: true },
      { id: "tasks", label: "Tasks & reminders", icon: ListTodo, count: "tasks" },
      { id: "trips", label: "Sales trip planner", icon: Compass, privilege: "plan_trips" },
      { id: "planner", label: "Road visit planner", icon: Map, privilege: "create_leads", preview: true },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { id: "reports", label: "Reports & dashboard", icon: TrendingUp, privilege: "view_reports" },
      { id: "targets", label: "Targets & templates", icon: Target, privilege: "manage_targets" },
      { id: "admin", label: "User management", icon: UsersRound, privilege: "manage_users" },
      { id: "values", label: "List of values", icon: Settings2, privilege: "manage_values" },
      { id: "devices", label: "Device authorization", icon: ShieldCheck, privilege: "manage_settings" },
      { id: "settings", label: "Settings", icon: SlidersHorizontal, privilege: "manage_settings" },
    ],
  },
];

const pageTitles: Record<string, string> = {
  home: "Action center", leads: "My leads", "all-leads": "All leads", cold: "Cold leads", warm: "Warm leads", hot: "Hot leads", client: "Clients",
  queued: "Queued leads", archive: "Archive", lead: "Lead", "lead-generation": "Lead generation", tasks: "Tasks & reminders", trips: "Sales trip planner", planner: "Road visit planner",
  reports: "Reports & dashboard", targets: "Targets & templates", admin: "User management", values: "List of values", devices: "Device authorization", settings: "Settings",
};

export default function AppShell({ user, setUser, signOut }: { user: UserAccount; setUser: (user: UserAccount) => void; signOut: () => Promise<void> }) {
  const [route, navigate] = useHashRoute();
  const referenceFetcher = useCallback(() => fetchReference(), []);
  const { data: reference, error: referenceError, reload: reloadReference } = useAsyncData(referenceFetcher);
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState("");

  const can = useCallback((privilege: UserPrivilege) => hasPrivilege(user, privilege), [user]);
  const refreshReference = useCallback(async () => { reloadReference(); }, [reloadReference]);

  // A lead opened by URL (#/lead/12) shows on top of the all-leads list.
  const routeLeadId = route.view === "lead" && route.param && /^\d+$/.test(route.param) ? Number(route.param) : null;
  const shownLeadId = activeLeadId ?? routeLeadId;

  const countsFetcher = useCallback(async () => {
    const [queued, tasks] = await Promise.all([
      can("review_queued") ? fetchLeads({ state: "queued", pageSize: 1 }).then((page) => page.total).catch(() => 0) : Promise.resolve(0),
      fetchTasks({ status: "open" }).then((result) => result.tasks.length).catch(() => 0),
    ]);
    return { queued, tasks };
  }, [can]);
  const counts = useAsyncData(countsFetcher, dataVersion).data ?? { queued: 0, tasks: 0 };

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
      connected: ["Gmail connected. Open a lead's Emails tab to see messages.", "success"],
      denied: ["Gmail connection was cancelled.", "error"],
      failed: ["Gmail could not be connected. Try again.", "error"],
      not_configured: ["Gmail is not configured on this server.", "error"],
    };
    const [message, tone] = outcomes[outcome] ?? ["Gmail status updated.", "info"];
    const timer = window.setTimeout(() => notify(message, tone), 0);
    return () => window.clearTimeout(timer);
  }, [notify]);

  const openLead = useCallback((id: number) => setActiveLeadId(id), []);
  const openNewLead = useCallback(() => setNewLeadOpen(true), []);
  const bumpData = useCallback(() => setDataVersion((value) => value + 1), []);
  const roleLabel = useCallback((role: SystemRole) => reference?.roleLabels[role] ?? role, [reference]);

  const go = useCallback((view: string) => {
    navigate(view);
    setMobileNavOpen(false);
    setMenuOpen(false);
  }, [navigate]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate("all-leads", null, { q: search.trim() });
    setSearch("");
  };

  const contextValue = useMemo<AppContextValue | null>(() => reference ? ({
    user, setUser, reference, refreshReference, notify, route, navigate, openLead, openNewLead, signOut, can, roleLabel, dataVersion, bumpData,
  }) : null, [user, setUser, reference, refreshReference, notify, route, navigate, openLead, openNewLead, signOut, can, roleLabel, dataVersion, bumpData]);

  const visibleNavigation = navigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => (!item.privilege || can(item.privilege)) && !(item.hideForRecruiter && user.role === "recruiter")),
  })).filter((group) => group.items.length);

  const view = route.view in pageTitles ? route.view : "home";

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
    const listKey = `${view}:${route.query.toString()}`;
    if (leadListViews.includes(view as LeadListView)) return <LeadListPage key={listKey} view={view as LeadListView} />;
    if (view === "lead") return <LeadListPage key={listKey} view="all-leads" />;
    if (view === "tasks") return <TasksPage />;
    if (view === "reports") return can("view_reports") ? <ReportsPage /> : <NoAccess />;
    if (adminTabs.includes(view as AdminTab)) return <AdminPage tab={view as AdminTab} />;
    if (view === "lead-generation") return <LeadGenerationPage />;
    if (view === "trips") return can("plan_trips") ? (route.param && /^\d+$/.test(route.param) ? <TripResultsPage key={route.param} tripId={Number(route.param)} /> : <TripsPage />) : <NoAccess />;
    if (view === "planner") return <PlannerPage />;
    return <ActionCenter />;
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
        <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
          <button className="brand-lockup" onClick={() => go("home")} aria-label="LeadTrailPro home">
            <span className="brand-mark"><span /><span /><span /></span>
            <span className="brand-name">leadtrail<span>pro</span></span>
          </button>
          <div className="workspace-switcher" title={sidebarCollapsed ? "Sales workspace" : undefined}>
            <span className="workspace-icon">{user.firstName[0]}</span>
            <span><strong>{roleLabel(user.role)}</strong><small>Sales workspace</small></span>
          </div>
          <nav className="side-nav" aria-label="Main navigation">
            {visibleNavigation.map((group) => (
              <div className="nav-group" key={group.title}>
                <span className="nav-label">{group.title}</span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = view === item.id || (item.id === "all-leads" && view === "lead");
                  const count = item.count ? counts[item.count] : 0;
                  return (
                    <button
                      key={item.id}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-label={sidebarCollapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => go(item.id)}
                      className={`nav-item ${isActive ? "nav-active" : ""} ${item.tone ? `nav-${item.tone}` : ""}`}
                    >
                      <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
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
            <div className="sidebar-tip"><div><ShieldCheck size={15} /><span>SIGNED IN</span></div><p>{user.email}</p><button onClick={() => setPasswordOpen(true)}>Change password <ChevronRight size={13} /></button></div>
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
              <span className="breadcrumb-root">Workspace</span><ChevronRight size={14} /><span className="breadcrumb-current">{pageTitles[view]}</span>
            </div>
            <div className="topbar-right">
              <form className="global-search" role="search" onSubmit={submitSearch}>
                <Search size={16} />
                <input className="global-search-input" aria-label="Search all leads" placeholder="Search leads..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </form>
              <span className="topbar-divider" />
              <NotificationsMenu />
              <div className="menu-anchor">
                <button className="topbar-user" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                  <span className="profile-avatar">{user.firstName[0]}{user.lastName[0]}</span><ChevronDown size={14} />
                </button>
                {menuOpen && (
                  <div className="menu-dropdown" role="menu">
                    <div className="menu-heading"><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></div>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setPasswordOpen(true); }}><KeyRound size={14} /> Change password</button>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setPrefsOpen(true); }}><BellRing size={14} /> Notification preferences</button>
                    <button role="menuitem" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div className="main-content" onClick={() => { if (menuOpen) setMenuOpen(false); }}>
            {renderContent()}
            <footer className="app-footer"><span>© 2026 LeadTrailPro</span><span><ShieldCheck size={13} /> Times shown in your local timezone · business day in {contextValue.reference.timeZone}</span></footer>
          </div>
        </main>

        {shownLeadId !== null && (
          <LeadDetailDialog
            leadId={shownLeadId}
            onClose={() => {
              setActiveLeadId(null);
              if (route.view === "lead") navigate("all-leads");
            }}
          />
        )}
        {newLeadOpen && (
          <LeadFormDialog
            onClose={() => setNewLeadOpen(false)}
            onSaved={(lead) => {
              setNewLeadOpen(false);
              bumpData();
              notify(lead.recordState === "queued" ? `${lead.clientName} saved and queued for Admin approval` : `${lead.clientName} added to the pipeline`);
              if (lead.recordState === "queued" && can("review_queued")) navigate("queued");
              else setActiveLeadId(lead.id);
            }}
          />
        )}
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
