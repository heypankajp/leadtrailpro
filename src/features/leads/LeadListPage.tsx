"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAsyncData } from "@/lib/useAsyncData";
import { ChevronDown, Filter, Plus, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Loading, Pagination, PromptDialog } from "@/features/shell/components";
import UserDirectoryDialog from "@/features/users/UserDirectoryDialog";
import type { UserSummary } from "@/features/users/model";
import { bulkLeads, fetchLeads, reviewLead, setLeadState, type LeadQuery } from "./client";
import LeadTable from "./LeadTable";
import { leadSortKeys, type LeadPage, type LeadSortKey, type LeadSummary } from "./model";

export const leadListViews = ["leads", "all-leads", "cold", "warm", "hot", "client", "queued", "archive"] as const;
export type LeadListView = (typeof leadListViews)[number];

const titles: Record<LeadListView, { title: string; eyebrow: string; blurb: string }> = {
  leads: { title: "My leads", eyebrow: "YOUR PIPELINE", blurb: "Leads you own, most recently active first." },
  "all-leads": { title: "All leads", eyebrow: "TEAM PIPELINE", blurb: "Every active lead across the team." },
  cold: { title: "Cold leads", eyebrow: "BY STATUS", blurb: "Prospects that still need a first conversation." },
  warm: { title: "Warm leads", eyebrow: "BY STATUS", blurb: "Conversations that are moving." },
  hot: { title: "Hot leads", eyebrow: "BY STATUS", blurb: "Close to signing. Keep the momentum." },
  client: { title: "Clients", eyebrow: "BY STATUS", blurb: "Signed clients and ongoing accounts." },
  queued: { title: "Queued leads", eyebrow: "ADMIN REVIEW", blurb: "Historical first-contact dates waiting for approval before they enter the pipeline." },
  archive: { title: "Archive", eyebrow: "LEAD HISTORY", blurb: "Archived and rejected leads. Search and filter independently, restore any time." },
};

const sortLabels: Record<LeadSortKey, string> = {
  last_activity: "Most recent activity", first_contact: "First contact date", follow_up: "Follow-up date", client_name: "Client name", owner: "Owner", created: "Date created",
};

type Filters = {
  q: string; statusId: string; leadTypeId: string; leadCategoryId: string; companySizeId: string; cityId: string; ownerId: string; clientResponseId: string; bdActionId: string;
  firstContactFrom: string; firstContactTo: string; followUpFrom: string; followUpTo: string; contractSignedFrom: string; contractSignedTo: string; sort: LeadSortKey; direction: "asc" | "desc";
};

const emptyFilters: Filters = {
  q: "", statusId: "", leadTypeId: "", leadCategoryId: "", companySizeId: "", cityId: "", ownerId: "", clientResponseId: "", bdActionId: "",
  firstContactFrom: "", firstContactTo: "", followUpFrom: "", followUpTo: "", contractSignedFrom: "", contractSignedTo: "", sort: "last_activity", direction: "desc",
};

export default function LeadListPage({ view }: { view: LeadListView }) {
  const { reference, can, route, openLead, openNewLead, notify, dataVersion, bumpData } = useApp();
  // The shell keys this page by view and URL query, so initial filters come straight from the route.
  const [filters, setFilters] = useState<Filters>(() => {
    const sort = route.query.get("sort");
    const direction = route.query.get("direction");
    return { ...emptyFilters, q: route.query.get("q") ?? "", sort: leadSortKeys.includes(sort as LeadSortKey) ? (sort as LeadSortKey) : "last_activity", direction: direction === "asc" ? "asc" : "desc" };
  });
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
    | null
  >(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const query = useMemo<LeadQuery>(() => {
    const base: LeadQuery = { state: view === "queued" ? "queued" : view === "archive" ? "archived" : "active", page, pageSize: 50, sort: filters.sort, direction: filters.direction, q: debouncedQ };
    if (view === "leads") base.mine = true;
    if (["cold", "warm", "hot", "client"].includes(view)) base.statusCode = view;
    const numeric = (value: string) => (value ? Number(value) : undefined);
    return {
      ...base,
      statusId: numeric(filters.statusId), leadTypeId: numeric(filters.leadTypeId), leadCategoryId: numeric(filters.leadCategoryId), companySizeId: numeric(filters.companySizeId),
      cityId: numeric(filters.cityId), ownerId: numeric(filters.ownerId), clientResponseId: numeric(filters.clientResponseId), bdActionId: numeric(filters.bdActionId),
      firstContactFrom: filters.firstContactFrom || undefined, firstContactTo: filters.firstContactTo || undefined, followUpFrom: filters.followUpFrom || undefined, followUpTo: filters.followUpTo || undefined,
      contractSignedFrom: filters.contractSignedFrom || undefined, contractSignedTo: filters.contractSignedTo || undefined,
    };
  }, [view, page, filters, debouncedQ]);

  const fetcher = useCallback(() => fetchLeads(query), [query]);
  const { data, error, loading } = useAsyncData<LeadPage>(fetcher, dataVersion);

  const update = (changes: Partial<Filters>) => { setFilters((current) => ({ ...current, ...changes })); setPage(1); setSelected([]); };
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => !["q", "sort", "direction"].includes(key) && value).length;
  const statusViews = ["cold", "warm", "hot", "client"];
  const owners = reference.users.filter((user) => user.role !== "recruiter");
  const canSelect = view === "queued" ? false : can("archive_leads") || can("reassign_leads");
  const title = titles[view];

  const runBulk = async (ids: number[], action: "archive" | "restore" | "reassign", options: { ownerId?: number; reason?: string }) => {
    const result = await bulkLeads(ids, action, options);
    setDialog(null);
    setSelected([]);
    bumpData();
    notify(`${result.count} ${result.count === 1 ? "lead" : "leads"} ${action === "archive" ? "archived" : action === "restore" ? "restored" : "reassigned"}`);
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
          <div className="lead-toolbar">
            <div className="search-field lead-search">
              <Search size={16} />
              <input aria-label="Search leads" placeholder="Search client, contact, address, notes..." value={filters.q} onChange={(event) => update({ q: event.target.value })} />
              {filters.q && <button className="clear-search" aria-label="Clear search" onClick={() => update({ q: "" })}><X size={13} /></button>}
            </div>
            {!statusViews.includes(view) && (
              <label className="select-filter"><Filter size={15} />{options(reference.listValues.status, "All statuses", filters.statusId, "statusId")}<ChevronDown size={14} /></label>
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
      {dialog?.kind === "reassign-reason" && (
        <PromptDialog title={`Reassign to ${dialog.user.name}`} eyebrow="OWNERSHIP" label="Reason (optional)" confirmLabel="Reassign" onClose={() => setDialog(null)} onConfirm={(reason) => runBulk(dialog.ids, "reassign", { ownerId: dialog.user.id, reason })} />
      )}
    </>
  );
}
