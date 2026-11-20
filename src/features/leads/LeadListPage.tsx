"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relativeTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { ChevronDown, Filter, Kanban, ListChecks, MapPinned, Plus, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { reasonListFor } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading, Pagination, PromptDialog } from "@/features/shell/components";
import { entryStageCode } from "@/features/list-values/model";
import { stageChoices } from "@/features/pipeline/model";
import UserDirectoryDialog from "@/features/users/UserDirectoryDialog";
import { indexLetters } from "@/features/contacts/model";
import { AddToTripDialog } from "@/features/visit-trips/TripDialogs";
import type { UserSummary } from "@/features/users/model";
import ArchiveDialog from "./ArchiveDialog";
import { bulkLeads, fetchLeads, fetchTodoCounts, reviewLead, setLeadState, type LeadQuery } from "./client";
import { todoTabs, type TodoCounts, type TodoScope } from "./todo-model";
import LeadTable from "./LeadTable";
import { leadSortKeys, type LeadPage, type LeadSortKey, type LeadSummary } from "./model";
import QuickFilterMenu from "./QuickFilterMenu";
import StatusFilter from "@/features/shell/StatusFilter";
import { isQuickFilterKey, type QuickFilterKey } from "./quick-filters";
import { fetchLeadTodoCounts, fetchOpportunities, setOpportunityTodo } from "@/features/opportunities/client";
import type { Opportunity } from "@/features/opportunities/model";
import { LeadTodoDialog } from "@/features/opportunities/OpportunitiesPage";

export const leadListViews = ["leads", "todo", "all-leads", "cold", "warm", "hot", "client", "queued", "archive", "favorites"] as const;
export type LeadListView = (typeof leadListViews)[number];

const titles: Record<LeadListView, { title: string; eyebrow: string; blurb: string }> = {
  leads: { title: "My Deals", eyebrow: "YOUR PIPELINE", blurb: "Deals you own, most recently active first." },
  todo: { title: "To Do", eyebrow: "PUT ASIDE", blurb: "Deals and leads moved to a To Do list to come back to, longest waiting first. Move a deal here from any deal list, and a lead from its Actions menu on Leads or Lead Generation; take it off when it is done." },
  "all-leads": { title: "All Deals", eyebrow: "TEAM PIPELINE", blurb: "Every active deal across the team." },
  cold: { title: "Cold Deals", eyebrow: "BY STATUS", blurb: "Prospects that still need a first conversation." },
  warm: { title: "Warm Deals", eyebrow: "BY STATUS", blurb: "Conversations that are moving." },
  hot: { title: "Hot Deals", eyebrow: "BY STATUS", blurb: "Close to signing. Keep the momentum." },
  client: { title: "Clients", eyebrow: "SIGNED CLIENTS", blurb: "Deals converted to clients: signed clients and ongoing accounts." },
  queued: { title: "Queued Deals", eyebrow: "ADMIN REVIEW", blurb: "Historical first-contact dates waiting for approval before they enter the pipeline." },
  archive: { title: "Archive", eyebrow: "DEAL HISTORY", blurb: "Archived and rejected deals. Search and filter independently, restore any time." },
  favorites: { title: "My Favourites", eyebrow: "MARKED WITH THE HEART", blurb: "The deals you marked as favourite on the Pipeline board. Only you see them." },
};

const sortLabels: Record<LeadSortKey, string> = {
  last_activity: "Most recent activity", first_contact: "First contact date", follow_up: "Follow-up date", client_name: "Client name", owner: "Owner", created: "Date created", client_reply: "Client's last email", todo_since: "Time on the To Do list",
};

type Filters = {
  q: string; statusId: string; statusReasonId: string; leadTypeId: string; leadCategoryId: string; companySizeId: string; cityId: string; ownerId: string; clientResponseId: string; bdActionId: string; stageId: string; todoListId: string;
  firstContactFrom: string; firstContactTo: string; followUpFrom: string; followUpTo: string; contractSignedFrom: string; contractSignedTo: string; sort: LeadSortKey; direction: "asc" | "desc";
  /** PD-30: a ready-made or data cleanup filter. */
  quick: QuickFilterKey | null;
};

const emptyFilters: Filters = {
  q: "", statusId: "", statusReasonId: "", leadTypeId: "", leadCategoryId: "", companySizeId: "", cityId: "", ownerId: "", clientResponseId: "", bdActionId: "", stageId: "", todoListId: "",
  firstContactFrom: "", firstContactTo: "", followUpFrom: "", followUpTo: "", contractSignedFrom: "", contractSignedTo: "", sort: "last_activity", direction: "desc",
  quick: null,
};

/** A deal list. On the Deals page (`embedded`) the heading, the view switch and the "+ Deal" button come from DealsPage. */
export default function LeadListPage({ view, embedded = false }: { view: LeadListView; embedded?: boolean }) {
  const { user, reference, can, route, navigate, openLead, openNewLead, openNewLeadFor, notify, dataVersion, bumpData } = useApp();
  const clientStatusId = reference.listValues.status.find((item) => item.code === "client")?.id ?? null;
  // The shell keys this page by view and URL query, so initial filters come straight from the route.
  const [filters, setFilters] = useState<Filters>(() => {
    const sort = route.query.get("sort");
    const direction = route.query.get("direction");
    // The To Do page opens with the leads that have waited longest on top.
    const fallbackSort: LeadSortKey = view === "todo" ? "todo_since" : "last_activity";
    // PD-28 / PD-30: the board's column menu and its Filter menu open the list with a stage, a status or a filter.
    const numericParam = (key: string) => (/^\d+$/.test(route.query.get(key) ?? "") ? route.query.get(key)! : "");
    const quick = route.query.get("quick");
    return { ...emptyFilters, stageId: numericParam("stageId"), statusId: numericParam("statusId"), quick: isQuickFilterKey(quick) ? quick : null, q: route.query.get("q") ?? "", sort: leadSortKeys.includes(sort as LeadSortKey) ? (sort as LeadSortKey) : fallbackSort, direction: direction === "asc" || (!direction && view === "todo") ? "asc" : "desc" };
  });
  // TODO-04: the To Do page shows the person's own leads or everyone's, one list or all of them. It opens on everyone's
  // (review of November 18, 2026): a deal someone put on "To be visited" from the team board was owned by a colleague,
  // so "My deals" hid it and the list looked empty.
  const [todoScope, setTodoScope] = useState<TodoScope>("everyone");
  const [todoTab, setTodoTab] = useState<number | null>(null);
  // The To Do page lists deals or leads (request of November 20, 2026).
  // The lead Action Center links here with kind=leads (request of November 20, 2026).
  const [todoKind, setTodoKind] = useState<"deals" | "leads">(() => (route.query.get("kind") === "leads" ? "leads" : "deals"));
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "review"; lead: LeadSummary; approve: boolean }
    | { kind: "archive"; ids: number[] }
    | { kind: "restore"; ids: number[] }
    | { kind: "reassign-pick"; ids: number[] }
    | { kind: "reassign-reason"; ids: number[]; user: UserSummary }
    | { kind: "stage"; ids: number[] }
    | { kind: "todo"; ids: number[] }
    | { kind: "trip"; ids: number[] }
    | null
  >(null);
  // TODO-03: bulk move to a To Do list; "" takes the leads off their list.
  const [bulkTodoId, setBulkTodoId] = useState("");
  // PIPE-11: bulk move to a stage; the entry stage is pre-selected.
  const [bulkStageId, setBulkStageId] = useState("");
  // The A–Z index shows on the Pipeline page's list view only (My deals / Everyone), not on the other lists.
  const azIndex = embedded && (view === "leads" || view === "all-leads");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const query = useMemo<LeadQuery>(() => {
    const base: LeadQuery = { state: view === "queued" ? "queued" : view === "archive" ? "archived" : "active", page, pageSize: 50, sort: filters.sort, direction: filters.direction, q: debouncedQ };
    if (view === "leads") base.mine = true;
    if (view === "favorites") base.favorites = true;
    if (view === "todo") {
      if (todoScope === "mine") base.mine = true;
      if (todoTab) base.todoListId = todoTab; else base.todo = true;
    }
    if (["cold", "warm", "hot", "client"].includes(view)) base.statusCode = view;
    const numeric = (value: string) => (value ? Number(value) : undefined);
    return {
      ...base,
      statusId: numeric(filters.statusId), statusReasonId: numeric(filters.statusReasonId), leadTypeId: numeric(filters.leadTypeId), leadCategoryId: numeric(filters.leadCategoryId), companySizeId: numeric(filters.companySizeId),
      cityId: numeric(filters.cityId), ownerId: numeric(filters.ownerId), clientResponseId: numeric(filters.clientResponseId), bdActionId: numeric(filters.bdActionId), stageId: numeric(filters.stageId), ...(view === "todo" ? {} : { todoListId: numeric(filters.todoListId) }),
      firstContactFrom: filters.firstContactFrom || undefined, firstContactTo: filters.firstContactTo || undefined, followUpFrom: filters.followUpFrom || undefined, followUpTo: filters.followUpTo || undefined,
      contractSignedFrom: filters.contractSignedFrom || undefined, contractSignedTo: filters.contractSignedTo || undefined,
      quick: filters.quick ?? undefined,
      // The A–Z index on the Pipeline list (request of November 18, 2026).
      letters: azIndex || undefined,
    };
  }, [view, page, filters, debouncedQ, todoScope, todoTab, azIndex]);

  const fetcher = useCallback(() => fetchLeads(query), [query]);
  const { data, error, loading } = useAsyncData<LeadPage>(fetcher, dataVersion);
  // A–Z index: a letter sorts the list by client name A–Z, opens the page where that letter starts and scrolls to it.
  const nameSorted = filters.sort === "client_name";
  const letterPages = data?.letterPages ?? {};
  const jumpTo = useRef<string | null>(null);
  const scrollToLetter = (letter: string) => document.getElementById(`deals-letter-${letter === "#" ? "other" : letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const jump = (letter: string) => {
    const target = letterPages[letter];
    if (!target) return;
    if (nameSorted && filters.direction === "asc" && target === page) { scrollToLetter(letter); return; }
    jumpTo.current = letter;
    setFilters((current) => ({ ...current, sort: "client_name", direction: "asc" }));
    setSelected([]);
    setPage(target);
  };
  useEffect(() => {
    if (!jumpTo.current || !data || data.page !== page || !nameSorted) return;
    scrollToLetter(jumpTo.current);
    jumpTo.current = null;
  }, [data, page, nameSorted]);
  const todoCountsFetcher = useCallback((): Promise<TodoCounts | null> => (view === "todo" ? fetchTodoCounts() : Promise.resolve(null)), [view]);
  const dealTodoCounts = useAsyncData<TodoCounts | null>(todoCountsFetcher, dataVersion).data ?? null;
  const leadTodoCountsFetcher = useCallback((): Promise<TodoCounts | null> => (view === "todo" ? fetchLeadTodoCounts() : Promise.resolve(null)), [view]);
  const leadTodoCounts = useAsyncData<TodoCounts | null>(leadTodoCountsFetcher, dataVersion).data ?? null;
  const todoCounts = todoKind === "leads" ? leadTodoCounts : dealTodoCounts;
  const todoLists = reference.listValues.todo_list;

  // Changing the status filter resets the reason filter, which only applies to Lost Lead and Disqualified (LEAD-07).
  const update = (changes: Partial<Filters>) => { setFilters((current) => ({ ...current, ...(changes.statusId !== undefined ? { statusReasonId: "" } : {}), ...changes })); setPage(1); setSelected([]); };
  const reasonKey = reasonListFor(reference.listValues.status.find((item) => String(item.id) === filters.statusId)?.code);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => !["q", "sort", "direction", "quick"].includes(key) && value).length;
  const statusViews = ["cold", "warm", "hot", "client"];
  const owners = reference.users.filter((user) => user.role !== "recruiter");
  const canSelect = view === "queued" ? false : can("archive_leads") || can("reassign_leads") || can("edit_leads");
  const title = titles[view];

  const runBulk = async (ids: number[], action: "archive" | "restore" | "reassign" | "stage" | "todo", options: { ownerId?: number; reason?: string; stageId?: number; todoListId?: number | null; archiveReasonId?: number }) => {
    const result = await bulkLeads(ids, action, options);
    setDialog(null);
    setSelected([]);
    bumpData();
    const stageName = options.stageId ? reference.listValues.stage.find((stage) => stage.id === options.stageId)?.value ?? "the stage" : "";
    const todoName = options.todoListId ? todoLists.find((list) => list.id === options.todoListId)?.value ?? "the list" : "";
    notify(`${result.count} ${result.count === 1 ? "deal" : "deals"} ${action === "archive" ? "archived" : action === "restore" ? "restored" : action === "stage" ? `moved to ${stageName}` : action === "todo" ? (options.todoListId ? `moved to To Do: ${todoName}` : "taken off To Do") : "reassigned"}`);
  };

  const options = (list: { id: number; value: string }[], placeholder: string, value: string, key: keyof Filters) => (
    <select value={value} onChange={(event) => update({ [key]: event.target.value } as Partial<Filters>)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {list.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
    </select>
  );

  return (
    <>
      {embedded ? (
        <div className="list-subhead">
          <h2>{title.title}</h2>
          <span>{data ? `${data.total} ${data.total === 1 ? "record" : "records"}` : "Loading"} · {title.blurb}</span>
        </div>
      ) : (
        <div className="page-heading">
          <div>
            <div className="eyebrow">{title.eyebrow} <span className="eyebrow-dot">·</span> {data ? `${data.total} RECORDS` : "LOADING"}</div>
            <h1>{title.title}</h1>
            <p>{title.blurb}</p>
          </div>
          {/* The Clients page adds a client (request of November 19, 2026): no pipeline stage, Status Client, Closed Date today. */}
          {can("create_leads") && view === "client" && clientStatusId && <button className="button button-primary" onClick={() => openNewLeadFor({ prefill: { statusId: clientStatusId, expectedCloseDate: reference.today } })}><Plus size={17} /> Client</button>}
          {can("create_leads") && view !== "archive" && view !== "queued" && view !== "client" && <button className="button button-primary" onClick={openNewLead}><Plus size={17} /> Deal</button>}
        </div>
      )}

      <section className="panel leads-panel">
        <div className="lead-list-wrap">
          {view === "todo" && (
            <div className="todo-bar">
              <div className="scope-toggle todo-kind" role="group" aria-label="Deals or leads">
                <button type="button" className={todoKind === "deals" ? "is-active" : ""} aria-pressed={todoKind === "deals"} onClick={() => { setTodoKind("deals"); setPage(1); setSelected([]); }}>Deals <span className="todo-count">{dealTodoCounts ? dealTodoCounts[todoScope] : 0}</span></button>
                <button type="button" className={todoKind === "leads" ? "is-active" : ""} aria-pressed={todoKind === "leads"} onClick={() => { setTodoKind("leads"); setPage(1); setSelected([]); }}>Leads <span className="todo-count">{leadTodoCounts ? leadTodoCounts[todoScope] : 0}</span></button>
              </div>
              <div className="todo-tabs" role="tablist" aria-label="To Do lists">
                {todoTabs(todoLists, todoCounts, todoScope).map((tab) => (
                  <button key={tab.id ?? "all"} role="tab" aria-selected={todoTab === tab.id} className={todoTab === tab.id ? "is-active" : ""} onClick={() => { setTodoTab(tab.id); setPage(1); setSelected([]); }}>
                    {tab.label} <span className="todo-count">{tab.count}</span>
                  </button>
                ))}
              </div>
              <div className="scope-toggle" role="group" aria-label="Whose deals">
                <button className={todoScope === "mine" ? "is-active" : ""} onClick={() => { setTodoScope("mine"); setPage(1); setSelected([]); }}>{todoKind === "leads" ? "My Leads" : "My Deals"}</button>
                <button className={todoScope === "everyone" ? "is-active" : ""} onClick={() => { setTodoScope("everyone"); setPage(1); setSelected([]); }}>Everyone</button>
              </div>
            </div>
          )}
          {view === "todo" && todoKind === "leads" ? <LeadTodoList listId={todoTab} mine={todoScope === "mine"} /> : (<>
          <div className="lead-toolbar">
            <div className="search-field lead-search">
              <Search size={16} />
              <input aria-label="Search deals" placeholder="Search client, contact, address, notes..." value={filters.q} onChange={(event) => update({ q: event.target.value })} />
              {filters.q && <button className="clear-search" aria-label="Clear search" onClick={() => update({ q: "" })}><X size={13} /></button>}
            </div>
            {!statusViews.includes(view) && (
              <StatusFilter statuses={reference.listValues.status} value={filters.statusId} onChange={(statusId) => update({ statusId })} />
            )}
            {reasonKey && (
              <label className="select-filter">{options(reference.listValues[reasonKey], "Any reason", filters.statusReasonId, "statusReasonId")}<ChevronDown size={14} /></label>
            )}
            <label className="select-filter">
              <SlidersHorizontal size={15} />
              <select aria-label="Sort by" value={filters.sort} onChange={(event) => update({ sort: event.target.value as LeadSortKey })}>
                {leadSortKeys.map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <button className="icon-button filter-button" aria-label={filters.direction === "desc" ? "Sort ascending" : "Sort descending"} title={filters.direction === "desc" ? "Descending" : "Ascending"} onClick={() => update({ direction: filters.direction === "desc" ? "asc" : "desc" })}>
              {filters.direction === "desc" ? "↓" : "↑"}
            </button>
            <button className={`button button-outline button-small ${showFilters || activeFilterCount ? "is-active" : ""}`} onClick={() => setShowFilters((open) => !open)}>
              <Filter size={14} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
            {(view === "leads" || view === "all-leads") && <QuickFilterMenu value={filters.quick} onChange={(quick) => update({ quick })} followUp={{ from: filters.followUpFrom, to: filters.followUpTo, onChange: (followUpFrom, followUpTo) => update({ followUpFrom, followUpTo }) }} />}
          </div>

          {showFilters && (
            <div className="filters-panel">
              <div className="filter-grid">
                {options(reference.listValues.lead_type, "Any deal source", filters.leadTypeId, "leadTypeId")}
                {options(reference.listValues.lead_category, "Any category", filters.leadCategoryId, "leadCategoryId")}
                {options(reference.listValues.company_size, "Any company size", filters.companySizeId, "companySizeId")}
                {options(reference.listValues.city, "Any city", filters.cityId, "cityId")}
                {view !== "leads" && (
                  <select value={filters.ownerId} onChange={(event) => update({ ownerId: event.target.value })} aria-label="Owner">
                    <option value="">Any owner</option>
                    {owners.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                )}
                {options(stageChoices(reference.listValues.stage, reference.pipelines), "Any stage", filters.stageId, "stageId")}
                {view !== "todo" && options(todoLists, "Any To Do list", filters.todoListId, "todoListId")}
              </div>
              <div className="filter-grid date-filters">
                <label><span>First contact from</span><input type="date" value={filters.firstContactFrom} onChange={(event) => update({ firstContactFrom: event.target.value })} /></label>
                <label><span>to</span><input type="date" value={filters.firstContactTo} onChange={(event) => update({ firstContactTo: event.target.value })} /></label>
                <label><span>Follow-up from</span><input type="date" value={filters.followUpFrom} onChange={(event) => update({ followUpFrom: event.target.value })} /></label>
                <label><span>to</span><input type="date" value={filters.followUpTo} onChange={(event) => update({ followUpTo: event.target.value })} /></label>
                <label><span>Contract signed from</span><input type="date" value={filters.contractSignedFrom} onChange={(event) => update({ contractSignedFrom: event.target.value })} /></label>
                <label><span>to</span><input type="date" value={filters.contractSignedTo} onChange={(event) => update({ contractSignedTo: event.target.value })} /></label>
              </div>
              <div className="filter-actions">
                <button className="text-button" onClick={() => { setFilters((current) => ({ ...emptyFilters, q: current.q, sort: current.sort, direction: current.direction })); setPage(1); }}>Clear Filters</button>
              </div>
            </div>
          )}

          {selected.length > 0 && (
            <div className="bulk-bar">
              <span>{selected.length} selected</span>
              {view === "archive" && can("archive_leads") && <button onClick={() => setDialog({ kind: "restore", ids: selected })}>Restore Selected</button>}
              {view !== "archive" && can("archive_leads") && <button onClick={() => setDialog({ kind: "archive", ids: selected })}>Archive Selected</button>}
              {can("reassign_leads") && <button onClick={() => setDialog({ kind: "reassign-pick", ids: selected })}><UserRound size={13} /> Reassign Owner</button>}
              {view !== "archive" && can("edit_leads") && <button onClick={() => { setBulkStageId(String(reference.listValues.stage.find((stage) => stage.code === entryStageCode)?.id ?? reference.listValues.stage[0]?.id ?? "")); setDialog({ kind: "stage", ids: selected }); }}><Kanban size={13} /> Move to Stage</button>}
              {view !== "archive" && can("edit_leads") && <button onClick={() => { setBulkTodoId(String(todoTab ?? todoLists.find((list) => list.active)?.id ?? "")); setDialog({ kind: "todo", ids: selected }); }}><ListChecks size={13} /> Move to To Do</button>}
              {view === "todo" && can("edit_leads") && <button onClick={() => void runBulk(selected, "todo", { todoListId: null }).catch((caught: unknown) => notify(errorMessage(caught), "error"))}>Take off To Do</button>}
              {/* Review of November 18, 2026: plan a sales trip for the deals to visit. */}
              {view === "todo" && can("plan_trips") && <button onClick={() => setDialog({ kind: "trip", ids: selected })}><MapPinned size={13} /> Add to Sales Trip</button>}
              <button className="bulk-clear" onClick={() => setSelected([])}>Clear Selection</button>
            </div>
          )}

          <ErrorText message={error} />
          {loading && !data ? <Loading text="Loading deals..." /> : data && (
            <div className={azIndex ? "contacts-az" : undefined}>
            <LeadTable
              leads={data.leads}
              selected={selected}
              today={reference.today}
              view={view}
              canSelect={canSelect}
              canReview={can("review_queued") || can("edit_leads")}
              viewerId={user.id}
              canRestore={can("archive_leads")}
              onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
              onToggleAll={(checked) => setSelected(checked ? data.leads.map((lead) => lead.id) : [])}
              onOpen={(lead) => openLead(lead.id)}
              onReview={(lead, approve) => setDialog({ kind: "review", lead, approve })}
              onRestore={(lead) => setDialog({ kind: "restore", ids: [lead.id] })}
              letterAnchors={azIndex && nameSorted ? "deals-letter-" : undefined}
            />
            {azIndex && (
              <nav className="az-index" aria-label="Jump to deals by the first letter of the client">
                {indexLetters.map((letter) => (
                  <button key={letter} type="button" disabled={!letterPages[letter]} title={nameSorted ? undefined : "Sorts the list by client name"} aria-label={letter === "#" ? "Clients starting with another character" : `Clients starting with ${letter}`} onClick={() => jump(letter)}>{letter}</button>
                ))}
              </nav>
            )}
            </div>
          )}
          {data && (
            <div className="table-footer">
              <span>Showing <strong>{data.leads.length}</strong> of <strong>{data.total}</strong> {view === "client" ? "clients" : "deals"}{loading ? " · refreshing" : ""}</span>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          )}
          </>)}
        </div>
      </section>

      {dialog?.kind === "review" && (
        <PromptDialog
          title={dialog.approve ? `Approve ${dialog.lead.clientName}` : `Reject ${dialog.lead.clientName}`}
          eyebrow="QUEUED DEAL"
          description={dialog.approve ? "The deal moves into the active pipeline with its historical first-contact date." : "The deal is archived with your reason and stays in the audit history."}
          label={dialog.approve ? "Comment (optional)" : "Reason"}
          required={!dialog.approve}
          danger={!dialog.approve}
          confirmLabel={dialog.approve ? "Approve deal" : "Reject deal"}
          onClose={() => setDialog(null)}
          onConfirm={async (comment) => {
            await reviewLead(dialog.lead.id, dialog.approve, comment);
            setDialog(null);
            bumpData();
            notify(dialog.approve ? `${dialog.lead.clientName} approved and added to the pipeline` : `${dialog.lead.clientName} rejected`);
          }}
        />
      )}
      {dialog?.kind === "trip" && (
        <AddToTripDialog
          leadIds={dialog.ids} onClose={() => setDialog(null)}
          onDone={(message, trip) => { setDialog(null); setSelected([]); bumpData(); notify(message); navigate("sales-trips", trip.id); }}
        />
      )}
      {dialog?.kind === "archive" && (
        <ArchiveDialog
          title={`Archive ${dialog.ids.length === 1 ? "Deal" : `${dialog.ids.length} Deals`}`} confirmLabel="Archive"
          description={dialog.ids.length === 1 ? undefined : "The deals leave the board with this reason and these notes. They can be restored from the archive."}
          onClose={() => setDialog(null)} onConfirm={(archiveReasonId, notes) => runBulk(dialog.ids, "archive", { reason: notes, archiveReasonId })}
        />
      )}
      {dialog?.kind === "restore" && (
        <PromptDialog
          title={`Restore ${dialog.ids.length === 1 ? "deal" : `${dialog.ids.length} deals`}`} eyebrow="ARCHIVE" label="Note (optional)" confirmLabel="Restore" onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            if (dialog.ids.length === 1) { await setLeadState(dialog.ids[0], "active", reason); setDialog(null); bumpData(); notify("Deal restored to the pipeline"); }
            else await runBulk(dialog.ids, "restore", { reason });
          }}
        />
      )}
      {dialog?.kind === "reassign-pick" && (
        <UserDirectoryDialog
          title="Reassign Deals"
          description={`Choose who will own the ${dialog.ids.length === 1 ? "selected deal" : `${dialog.ids.length} selected deals`}.`}
          users={owners}
          confirmLabel="Assign"
          onClose={() => setDialog(null)}
          onPick={(user) => setDialog({ kind: "reassign-reason", ids: dialog.ids, user })}
        />
      )}
      {dialog?.kind === "stage" && (
        <Dialog title={`Move ${dialog.ids.length === 1 ? "Deal" : `${dialog.ids.length} Deals`} to a Stage`} eyebrow="PIPELINE STAGE" size="narrow" onClose={() => setDialog(null)}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void runBulk(dialog.ids, "stage", { stageId: Number(bulkStageId) }).catch((caught: unknown) => notify(errorMessage(caught), "error")); }}>
            <p className="dialog-description">Each deal you may edit moves to the chosen stage with a timeline entry; deals already there, queued, or closed are skipped.</p>
            <Field label="Target Stage" required>
              <select value={bulkStageId} onChange={(event) => setBulkStageId(event.target.value)} required>
                {stageChoices(reference.listValues.stage, reference.pipelines).map((stage) => <option key={stage.id} value={stage.id}>{stage.value}</option>)}
              </select>
            </Field>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" className="button button-primary">Move Deals</button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog?.kind === "todo" && (
        <Dialog title={`Move ${dialog.ids.length === 1 ? "Deal" : `${dialog.ids.length} Deals`} to a To Do List`} eyebrow="TO DO" size="narrow" onClose={() => setDialog(null)}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void runBulk(dialog.ids, "todo", { todoListId: bulkTodoId ? Number(bulkTodoId) : null }).catch((caught: unknown) => notify(errorMessage(caught), "error")); }}>
            <p className="dialog-description">Each deal you may edit goes on the chosen list, with a timeline entry. A deal is on one list at a time, so it leaves the list it was on.</p>
            <Field label="To Do List" required>
              <select aria-label="To Do list" value={bulkTodoId} onChange={(event) => setBulkTodoId(event.target.value)}>
                {todoLists.filter((list) => list.active).map((list) => <option key={list.id} value={list.id}>{list.value}</option>)}
                <option value="">Not on a list (take off)</option>
              </select>
            </Field>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" className="button button-primary">Move Deals</button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog?.kind === "reassign-reason" && (
        <PromptDialog title={`Reassign to ${dialog.user.name}`} eyebrow="OWNERSHIP" label="Reason (optional)" confirmLabel="Reassign" onClose={() => setDialog(null)} onConfirm={(reason) => runBulk(dialog.ids, "reassign", { ownerId: dialog.user.id, reason })} />
      )}
    </>
  );
}

/**
 * The To Do page's leads (request of November 20, 2026): the leads on one To Do list, or on any, longest waiting first, with
 * Move to another list and Take Off To Do.
 */
function LeadTodoList({ listId, mine }: { listId: number | null; mine: boolean }) {
  const { notify, dataVersion, bumpData } = useApp();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [moving, setMoving] = useState<Opportunity | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [q]);
  const fetcher = useCallback(() => fetchOpportunities({ status: "new", page, pageSize: 50, ...(listId ? { todoListId: listId } : { todo: "1" as const }), ...(mine ? { scope: "mine" as const } : {}), ...(term ? { search: term } : {}) }), [listId, mine, page, term]);
  const { data, error, loading } = useAsyncData(fetcher, dataVersion);
  const takeOff = async (lead: Opportunity) => {
    try { await setOpportunityTodo(lead.id, null); notify(`${lead.companyName} taken off To Do`); bumpData(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };
  return (
    <>
      <div className="lead-toolbar">
        <div className="search-field lead-search">
          <Search size={16} />
          <input aria-label="Search leads" placeholder="Search company, role, location..." value={q} onChange={(event) => setQ(event.target.value)} />
          {q && <button className="clear-search" aria-label="Clear search" onClick={() => setQ("")}><X size={13} /></button>}
        </div>
      </div>
      <ErrorText message={error} />
      {!data && !error ? <Loading /> : data && (data.opportunities.length === 0 ? (
        <div className="empty-block"><strong>No leads on {listId ? "this list" : "a To Do list"}</strong><span>Put a lead here from Leads or Lead Generation: Actions → Move to To Do.</span></div>
      ) : (
        <div className="table-scroll">
          <table className="lead-table todo-lead-table">
            <thead><tr><th>LEAD</th><th>LOCATION</th><th>ROLES</th><th>TO DO LIST</th><th>ON THE LIST</th><th>ADDED BY</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.opportunities.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <span className="todo-lead-name">
                      <strong>{lead.website ? <a className="opp-name-link" href={lead.website} target="_blank" rel="noopener noreferrer" title={`Open ${lead.website}`}>{lead.companyName}</a> : lead.companyName}</strong>
                      <small>{lead.status === "not_relevant" ? "Lead · Not Relevant" : "Lead"}{lead.leadSource ? ` · ${lead.leadSource}` : ""}</small>
                    </span>
                  </td>
                  <td><span className="muted-cell">{lead.location || "—"}</span></td>
                  <td><span className="muted-cell">{lead.latestTitle || "—"}</span></td>
                  <td>{lead.todoList ? <span className="opp-todo">{lead.todoList}</span> : "—"}</td>
                  <td><span className="muted-cell">{lead.todoSince ? relativeTime(lead.todoSince) : "—"}</span></td>
                  <td><span className="muted-cell">{lead.addedByName ?? "Lead Generation"}</span></td>
                  <td>
                    <span className="todo-lead-actions">
                      <button type="button" className="button button-outline button-small" onClick={() => setMoving(lead)}>Move</button>
                      <button type="button" className="button button-outline button-small" onClick={() => void takeOff(lead)}>Take Off To Do</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {data && (
        <div className="table-footer">
          <span>Showing <strong>{data.opportunities.length}</strong> of <strong>{data.total}</strong> leads{loading ? " · refreshing" : ""}</span>
          <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />
        </div>
      )}
      {moving && <LeadTodoDialog lead={moving} onClose={() => setMoving(null)} onDone={(message) => { setMoving(null); notify(message); bumpData(); }} />}
    </>
  );
}
