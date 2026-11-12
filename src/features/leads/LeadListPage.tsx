"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { ChevronDown, Filter, Kanban, ListChecks, Plus, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { reasonListFor } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading, Pagination, PromptDialog } from "@/features/shell/components";
import { entryStageCode } from "@/features/list-values/model";
import UserDirectoryDialog from "@/features/users/UserDirectoryDialog";
import type { UserSummary } from "@/features/users/model";
import { bulkLeads, fetchLeads, fetchTodoCounts, reviewLead, setLeadState, type LeadQuery } from "./client";
import { todoTabs, type TodoCounts, type TodoScope } from "./todo-model";
import LeadTable from "./LeadTable";
import { leadSortKeys, type LeadPage, type LeadSortKey, type LeadSummary } from "./model";

export const leadListViews = ["leads", "todo", "all-leads", "cold", "warm", "hot", "client", "queued", "archive"] as const;
export type LeadListView = (typeof leadListViews)[number];

const titles: Record<LeadListView, { title: string; eyebrow: string; blurb: string }> = {
  leads: { title: "My leads", eyebrow: "YOUR PIPELINE", blurb: "Leads you own, most recently active first." },
  todo: { title: "To Do", eyebrow: "LEADS PUT ASIDE", blurb: "Leads moved to a To Do list to come back to, longest waiting first. Move a lead here from its page or from any lead list, and take it off when it is done." },
  "all-leads": { title: "All leads", eyebrow: "TEAM PIPELINE", blurb: "Every active lead across the team." },
  cold: { title: "Cold leads", eyebrow: "BY STATUS", blurb: "Prospects that still need a first conversation." },
  warm: { title: "Warm leads", eyebrow: "BY STATUS", blurb: "Conversations that are moving." },
  hot: { title: "Hot leads", eyebrow: "BY STATUS", blurb: "Close to signing. Keep the momentum." },
  client: { title: "Clients", eyebrow: "BY STATUS", blurb: "Signed clients and ongoing accounts." },
  queued: { title: "Queued leads", eyebrow: "ADMIN REVIEW", blurb: "Historical first-contact dates waiting for approval before they enter the pipeline." },
  archive: { title: "Archive", eyebrow: "LEAD HISTORY", blurb: "Archived and rejected leads. Search and filter independently, restore any time." },
};

const sortLabels: Record<LeadSortKey, string> = {
  last_activity: "Most recent activity", first_contact: "First contact date", follow_up: "Follow-up date", client_name: "Client name", owner: "Owner", created: "Date created", client_reply: "Client's last email", todo_since: "Time on the To Do list",
};

type Filters = {
  q: string; statusId: string; statusReasonId: string; leadTypeId: string; leadCategoryId: string; companySizeId: string; cityId: string; ownerId: string; clientResponseId: string; bdActionId: string; stageId: string; todoListId: string;
  firstContactFrom: string; firstContactTo: string; followUpFrom: string; followUpTo: string; contractSignedFrom: string; contractSignedTo: string; sort: LeadSortKey; direction: "asc" | "desc";
};

const emptyFilters: Filters = {
  q: "", statusId: "", statusReasonId: "", leadTypeId: "", leadCategoryId: "", companySizeId: "", cityId: "", ownerId: "", clientResponseId: "", bdActionId: "", stageId: "", todoListId: "",
  firstContactFrom: "", firstContactTo: "", followUpFrom: "", followUpTo: "", contractSignedFrom: "", contractSignedTo: "", sort: "last_activity", direction: "desc",
};

export default function LeadListPage({ view }: { view: LeadListView }) {
  const { reference, can, route, openLead, openNewLead, notify, dataVersion, bumpData } = useApp();
  // The shell keys this page by view and URL query, so initial filters come straight from the route.
  const [filters, setFilters] = useState<Filters>(() => {
    const sort = route.query.get("sort");
    const direction = route.query.get("direction");
    // The To Do page opens with the leads that have waited longest on top.
    const fallbackSort: LeadSortKey = view === "todo" ? "todo_since" : "last_activity";
    return { ...emptyFilters, q: route.query.get("q") ?? "", sort: leadSortKeys.includes(sort as LeadSortKey) ? (sort as LeadSortKey) : fallbackSort, direction: direction === "asc" || (!direction && view === "todo") ? "asc" : "desc" };
  });
  // TODO-04: the To Do page shows the person's own leads or everyone's, one list or all of them.
  const [todoScope, setTodoScope] = useState<TodoScope>("mine");
  const [todoTab, setTodoTab] = useState<number | null>(null);
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
    | null
  >(null);
  // TODO-03: bulk move to a To Do list; "" takes the leads off their list.
  const [bulkTodoId, setBulkTodoId] = useState("");
  // PIPE-11: bulk move to a stage; the entry stage is pre-selected.
  const [bulkStageId, setBulkStageId] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const query = useMemo<LeadQuery>(() => {
    const base: LeadQuery = { state: view === "queued" ? "queued" : view === "archive" ? "archived" : "active", page, pageSize: 50, sort: filters.sort, direction: filters.direction, q: debouncedQ };
    if (view === "leads") base.mine = true;
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
    };
  }, [view, page, filters, debouncedQ, todoScope, todoTab]);

  const fetcher = useCallback(() => fetchLeads(query), [query]);
  const { data, error, loading } = useAsyncData<LeadPage>(fetcher, dataVersion);
  const todoCountsFetcher = useCallback((): Promise<TodoCounts | null> => (view === "todo" ? fetchTodoCounts() : Promise.resolve(null)), [view]);
  const todoCounts = useAsyncData<TodoCounts | null>(todoCountsFetcher, dataVersion).data ?? null;
  const todoLists = reference.listValues.todo_list;

  // Changing the status filter resets the reason filter, which only applies to Lost Lead and Disqualified (LEAD-07).
  const update = (changes: Partial<Filters>) => { setFilters((current) => ({ ...current, ...(changes.statusId !== undefined ? { statusReasonId: "" } : {}), ...changes })); setPage(1); setSelected([]); };
  const reasonKey = reasonListFor(reference.listValues.status.find((item) => String(item.id) === filters.statusId)?.code);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => !["q", "sort", "direction"].includes(key) && value).length;
  const statusViews = ["cold", "warm", "hot", "client"];
  const owners = reference.users.filter((user) => user.role !== "recruiter");
  const canSelect = view === "queued" ? false : can("archive_leads") || can("reassign_leads") || can("edit_leads");
  const title = titles[view];

  const runBulk = async (ids: number[], action: "archive" | "restore" | "reassign" | "stage" | "todo", options: { ownerId?: number; reason?: string; stageId?: number; todoListId?: number | null }) => {
    const result = await bulkLeads(ids, action, options);
    setDialog(null);
    setSelected([]);
    bumpData();
    const stageName = options.stageId ? reference.listValues.stage.find((stage) => stage.id === options.stageId)?.value ?? "the stage" : "";
    const todoName = options.todoListId ? todoLists.find((list) => list.id === options.todoListId)?.value ?? "the list" : "";
    notify(`${result.count} ${result.count === 1 ? "lead" : "leads"} ${action === "archive" ? "archived" : action === "restore" ? "restored" : action === "stage" ? `moved to ${stageName}` : action === "todo" ? (options.todoListId ? `moved to To Do: ${todoName}` : "taken off To Do") : "reassigned"}`);
  };

  const options = (list: { id: number; value: string }[], placeholder: string, value: string, key: keyof Filters) => (
    <select value={value} onChange={(event) => update({ [key]: event.target.value } as Partial<Filters>)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {list.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
    </select>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{title.eyebrow} <span className="eyebrow-dot">·</span> {data ? `${data.total} RECORDS` : "LOADING"}</div>
          <h1>{title.title}</h1>
          <p>{title.blurb}</p>
        </div>
        {can("create_leads") && view !== "archive" && view !== "queued" && <button className="button button-primary" onClick={openNewLead}><Plus size={17} /> Add a lead</button>}
      </div>

      <section className="panel leads-panel">
        <div className="lead-list-wrap">
          {view === "todo" && (
            <div className="todo-bar">
              <div className="todo-tabs" role="tablist" aria-label="To Do lists">
                {todoTabs(todoLists, todoCounts, todoScope).map((tab) => (
                  <button key={tab.id ?? "all"} role="tab" aria-selected={todoTab === tab.id} className={todoTab === tab.id ? "is-active" : ""} onClick={() => { setTodoTab(tab.id); setPage(1); setSelected([]); }}>
                    {tab.label} <span className="todo-count">{tab.count}</span>
                  </button>
                ))}
              </div>
              <div className="scope-toggle" role="group" aria-label="Whose leads">
                <button className={todoScope === "mine" ? "is-active" : ""} onClick={() => { setTodoScope("mine"); setPage(1); setSelected([]); }}>My leads</button>
                <button className={todoScope === "everyone" ? "is-active" : ""} onClick={() => { setTodoScope("everyone"); setPage(1); setSelected([]); }}>Everyone</button>
              </div>
            </div>
          )}
          <div className="lead-toolbar">
            <div className="search-field lead-search">
              <Search size={16} />
              <input aria-label="Search leads" placeholder="Search client, contact, address, notes..." value={filters.q} onChange={(event) => update({ q: event.target.value })} />
              {filters.q && <button className="clear-search" aria-label="Clear search" onClick={() => update({ q: "" })}><X size={13} /></button>}
            </div>
            {!statusViews.includes(view) && (
              <label className="select-filter"><Filter size={15} />{options(reference.listValues.status, "All statuses", filters.statusId, "statusId")}<ChevronDown size={14} /></label>
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
          </div>

          {showFilters && (
            <div className="filters-panel">
              <div className="filter-grid">
                {options(reference.listValues.lead_type, "Any lead type", filters.leadTypeId, "leadTypeId")}
                {options(reference.listValues.lead_category, "Any category", filters.leadCategoryId, "leadCategoryId")}
                {options(reference.listValues.company_size, "Any company size", filters.companySizeId, "companySizeId")}
                {options(reference.listValues.city, "Any city", filters.cityId, "cityId")}
                {view !== "leads" && (
                  <select value={filters.ownerId} onChange={(event) => update({ ownerId: event.target.value })} aria-label="Owner">
                    <option value="">Any owner</option>
                    {owners.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                )}
                {options(reference.listValues.client_response, "Any client response", filters.clientResponseId, "clientResponseId")}
                {options(reference.listValues.bd_action, "Any BD action", filters.bdActionId, "bdActionId")}
                {options(reference.listValues.stage, "Any stage", filters.stageId, "stageId")}
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
                <button className="text-button" onClick={() => { setFilters((current) => ({ ...emptyFilters, q: current.q, sort: current.sort, direction: current.direction })); setPage(1); }}>Clear filters</button>
              </div>
            </div>
          )}

          {selected.length > 0 && (
            <div className="bulk-bar">
              <span>{selected.length} selected</span>
              {view === "archive" && can("archive_leads") && <button onClick={() => setDialog({ kind: "restore", ids: selected })}>Restore selected</button>}
              {view !== "archive" && can("archive_leads") && <button onClick={() => setDialog({ kind: "archive", ids: selected })}>Archive selected</button>}
              {can("reassign_leads") && <button onClick={() => setDialog({ kind: "reassign-pick", ids: selected })}><UserRound size={13} /> Reassign owner</button>}
              {view !== "archive" && can("edit_leads") && <button onClick={() => { setBulkStageId(String(reference.listValues.stage.find((stage) => stage.code === entryStageCode)?.id ?? reference.listValues.stage[0]?.id ?? "")); setDialog({ kind: "stage", ids: selected }); }}><Kanban size={13} /> Move to stage</button>}
              {view !== "archive" && can("edit_leads") && <button onClick={() => { setBulkTodoId(String(todoTab ?? todoLists.find((list) => list.active)?.id ?? "")); setDialog({ kind: "todo", ids: selected }); }}><ListChecks size={13} /> Move to To Do</button>}
              {view === "todo" && can("edit_leads") && <button onClick={() => void runBulk(selected, "todo", { todoListId: null }).catch((caught: unknown) => notify(errorMessage(caught), "error"))}>Take off To Do</button>}
              <button className="bulk-clear" onClick={() => setSelected([])}>Clear selection</button>
            </div>
          )}

          <ErrorText message={error} />
          {loading && !data ? <Loading text="Loading leads..." /> : data && (
            <LeadTable
              leads={data.leads}
              selected={selected}
              today={reference.today}
              view={view}
              canSelect={canSelect}
              canReview={can("review_queued")}
              canRestore={can("archive_leads")}
              onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
              onToggleAll={(checked) => setSelected(checked ? data.leads.map((lead) => lead.id) : [])}
              onOpen={(lead) => openLead(lead.id)}
              onReview={(lead, approve) => setDialog({ kind: "review", lead, approve })}
              onRestore={(lead) => setDialog({ kind: "restore", ids: [lead.id] })}
            />
          )}
          {data && (
            <div className="table-footer">
              <span>Showing <strong>{data.leads.length}</strong> of <strong>{data.total}</strong> leads{loading ? " · refreshing" : ""}</span>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          )}
        </div>
      </section>

      {dialog?.kind === "review" && (
        <PromptDialog
          title={dialog.approve ? `Approve ${dialog.lead.clientName}` : `Reject ${dialog.lead.clientName}`}
          eyebrow="QUEUED LEAD"
          description={dialog.approve ? "The lead moves into the active pipeline with its historical first-contact date." : "The lead is archived with your reason and stays in the audit history."}
          label={dialog.approve ? "Comment (optional)" : "Reason"}
          required={!dialog.approve}
          danger={!dialog.approve}
          confirmLabel={dialog.approve ? "Approve lead" : "Reject lead"}
          onClose={() => setDialog(null)}
          onConfirm={async (comment) => {
            await reviewLead(dialog.lead.id, dialog.approve, comment);
            setDialog(null);
            bumpData();
            notify(dialog.approve ? `${dialog.lead.clientName} approved and added to the pipeline` : `${dialog.lead.clientName} rejected`);
          }}
        />
      )}
      {dialog?.kind === "archive" && (
        <PromptDialog title={`Archive ${dialog.ids.length === 1 ? "lead" : `${dialog.ids.length} leads`}`} eyebrow="ARCHIVE" label="Reason (optional)" confirmLabel="Archive" onClose={() => setDialog(null)} onConfirm={(reason) => runBulk(dialog.ids, "archive", { reason })} />
      )}
      {dialog?.kind === "restore" && (
        <PromptDialog
          title={`Restore ${dialog.ids.length === 1 ? "lead" : `${dialog.ids.length} leads`}`} eyebrow="ARCHIVE" label="Note (optional)" confirmLabel="Restore" onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            if (dialog.ids.length === 1) { await setLeadState(dialog.ids[0], "active", reason); setDialog(null); bumpData(); notify("Lead restored to the pipeline"); }
            else await runBulk(dialog.ids, "restore", { reason });
          }}
        />
      )}
      {dialog?.kind === "reassign-pick" && (
        <UserDirectoryDialog
          title="Reassign leads"
          description={`Choose who will own the ${dialog.ids.length === 1 ? "selected lead" : `${dialog.ids.length} selected leads`}.`}
          users={owners}
          confirmLabel="Assign"
          onClose={() => setDialog(null)}
          onPick={(user) => setDialog({ kind: "reassign-reason", ids: dialog.ids, user })}
        />
      )}
      {dialog?.kind === "stage" && (
        <Dialog title={`Move ${dialog.ids.length === 1 ? "lead" : `${dialog.ids.length} leads`} to a stage`} eyebrow="PIPELINE STAGE" size="narrow" onClose={() => setDialog(null)}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void runBulk(dialog.ids, "stage", { stageId: Number(bulkStageId) }).catch((caught: unknown) => notify(errorMessage(caught), "error")); }}>
            <p className="dialog-description">Each lead you may edit moves to the chosen stage with a timeline entry; leads already there, queued, or closed are skipped.</p>
            <Field label="Target stage" required>
              <select value={bulkStageId} onChange={(event) => setBulkStageId(event.target.value)} required>
                {reference.listValues.stage.map((stage) => <option key={stage.id} value={stage.id}>{stage.value}</option>)}
              </select>
            </Field>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" className="button button-primary">Move leads</button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog?.kind === "todo" && (
        <Dialog title={`Move ${dialog.ids.length === 1 ? "lead" : `${dialog.ids.length} leads`} to a To Do list`} eyebrow="TO DO" size="narrow" onClose={() => setDialog(null)}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void runBulk(dialog.ids, "todo", { todoListId: bulkTodoId ? Number(bulkTodoId) : null }).catch((caught: unknown) => notify(errorMessage(caught), "error")); }}>
            <p className="dialog-description">Each lead you may edit goes on the chosen list, with a timeline entry. A lead is on one list at a time, so it leaves the list it was on.</p>
            <Field label="To Do list" required>
              <select aria-label="To Do list" value={bulkTodoId} onChange={(event) => setBulkTodoId(event.target.value)}>
                {todoLists.filter((list) => list.active).map((list) => <option key={list.id} value={list.id}>{list.value}</option>)}
                <option value="">Not on a list (take off)</option>
              </select>
            </Field>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" className="button button-primary">Move leads</button>
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
