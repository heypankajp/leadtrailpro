"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Briefcase, ChevronDown, ChevronRight, ExternalLink, Pencil, Play, Plus, RotateCcw, Search, Trash2, UserPlus, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import LeadFormDialog from "@/features/leads/LeadFormDialog";
import type { LeadInput } from "@/features/leads/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, EmptyState, ErrorText, Field, Loading, Pagination, Tabs, type TabOption } from "@/features/shell/components";
import { createSearch, deleteSearch, fetchOpportunities, fetchRuns, fetchSearches, markOpportunityNotRelevant, reopenOpportunity, restoreOpportunity, runSearchesNow, updateSearch } from "./client";
import { jobTypeOptions, maxMaxListings, minMaxListings, type Opportunity, type OpportunitySearch, type OpportunitySearchInput, type OpportunityStatus } from "./model";

type Tab = OpportunityStatus | "searches";
const pageSize = 50;

const statusLabels: Record<OpportunityStatus, string> = { new: "Pool", not_relevant: "Not relevant", converted: "Assigned as leads", attached: "Existing leads" };

/** What the lead form starts with when a card is assigned: the company, where it is, and the roles it advertises. */
function prefillFor(item: Opportunity): Partial<LeadInput> {
  const lines = item.listings.map((listing) => `${listing.title} (${listing.sourceLabel}${listing.postedAt ? `, posted ${formatDate(listing.postedAt)}` : ""}) ${listing.url}`);
  return {
    clientName: item.companyName, companyUrl: item.website, address: item.location,
    positions: item.listings.map((listing) => listing.title).join("\n").slice(0, 5000),
    comments: `From the opportunity pool (first seen ${formatDate(item.firstSeenAt.slice(0, 10))}):\n${lines.join("\n")}`.slice(0, 5000),
  };
}

/** The opportunity pool (OPP-02, OPP-11..13 as decided): one card per hiring company, assign or dismiss. */
export default function OpportunitiesPage() {
  const { can, notify, openLead, dataVersion, bumpData, reference } = useApp();
  const [tab, setTab] = useState<Tab>("new");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const status: OpportunityStatus = tab === "searches" ? "new" : tab;
  const fetcher = useCallback(() => fetchOpportunities({ status, page, pageSize, search: filter.trim() }), [status, page, filter]);
  const { data, error, reload } = useAsyncData(fetcher, dataVersion);
  const [assigning, setAssigning] = useState<Opportunity | null>(null);
  const [dismissing, setDismissing] = useState<Opportunity | null>(null);
  const [reopening, setReopening] = useState<Opportunity | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState(false);
  const counts = data?.counts;
  const tabs: TabOption<Tab>[] = [
    { id: "new", label: statusLabels.new, count: counts?.new },
    { id: "not_relevant", label: statusLabels.not_relevant, count: counts?.not_relevant },
    { id: "converted", label: statusLabels.converted, count: counts?.converted },
    { id: "attached", label: statusLabels.attached, count: counts?.attached },
    ...(can("manage_settings") ? [{ id: "searches" as Tab, label: "Searches & runs" }] : []),
  ];

  const runNow = async () => {
    setRunning(true);
    try {
      const { run } = await runSearchesNow();
      notify(`Search ${run.status}: ${run.listingsFound} listings, ${run.newCompanies} new ${run.newCompanies === 1 ? "company" : "companies"}, ${run.attached} attached to existing leads`, run.status === "failed" ? "error" : "success");
      bumpData();
    } catch (caught) {
      notify(errorMessage(caught, "The searches could not be run."), "error");
    } finally {
      setRunning(false);
    }
  };

  const restore = async (item: Opportunity) => {
    try { await restoreOpportunity(item.id); notify(`${item.companyName} is back in the pool`); bumpData(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPPORTUNITY POOL</div>
          <h1>Opportunities</h1>
          <p>Companies that are hiring, found by the scheduled job searches. Assign one to yourself or a colleague to create its lead, or mark it not relevant. A company that is already a lead or client never appears here: its new listings go to that lead.</p>
        </div>
        {can("manage_settings") && <button className="button button-outline" onClick={() => void runNow()} disabled={running}><Play size={14} /> {running ? "Running searches..." : "Run searches now"}</button>}
      </div>
      <Tabs tabs={tabs} active={tab} onChange={(id) => { setTab(id); setPage(1); setExpanded({}); }} />
      {tab === "searches" ? <SearchesPanel /> : (
        <div className="panel">
          <div className="opp-toolbar">
            <label className="opp-search"><Search size={13} /><input placeholder="Filter by company, role, or location" aria-label="Filter opportunities" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} /></label>
            {data && <small className="field-hint">{data.total} {data.total === 1 ? "company" : "companies"}</small>}
          </div>
          {error && <ErrorText message={error} />}
          {!data && !error ? <Loading /> : data && data.opportunities.length === 0 ? (
            <EmptyState icon={<Briefcase size={22} />} title={status === "new" ? "Nothing in the pool" : `No ${statusLabels[status].toLowerCase()} yet`} text={status === "new" ? (can("manage_settings") ? "Add a search under Searches & runs and run it, or wait for the next scheduled run." : "The next scheduled search run will add companies here.") : undefined} />
          ) : data && (
            <table className="opp-table">
              <thead><tr><th>Company</th><th>Roles</th><th>Location</th><th>Seen</th><th>{status === "new" ? "Notes" : "Outcome"}</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {data.opportunities.map((item) => {
                  const open = expanded[item.id] ?? false;
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.companyName}</strong>
                        <small className="muted-cell">{item.sources.join(", ")}{item.website && <> · <a href={item.website} target="_blank" rel="noreferrer">website</a></>}</small>
                      </td>
                      <td>
                        <button type="button" className="opp-expand" onClick={() => setExpanded((current) => ({ ...current, [item.id]: !open }))} aria-expanded={open}>
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {item.listingsCount} {item.listingsCount === 1 ? "role" : "roles"}
                        </button>
                        {!open && item.latestTitle && <small className="muted-cell">{item.latestTitle}</small>}
                        {open && (
                          <ul className="opp-roles">
                            {item.listings.map((listing) => (
                              <li key={listing.id}><a href={listing.url} target="_blank" rel="noreferrer">{listing.title} <ExternalLink size={10} /></a> <small>{listing.sourceLabel}{listing.postedAt ? ` · posted ${formatDate(listing.postedAt)}` : ""}{listing.employmentType ? ` · ${listing.employmentType}` : ""}</small></li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{item.location || "—"}</td>
                      <td><span title={formatDateTime(item.lastSeenAt)}>{relativeTime(item.lastSeenAt)}</span><small className="muted-cell">first {formatDate(item.firstSeenAt.slice(0, 10))}</small></td>
                      <td>
                        {item.history && <small className="opp-flag">Was a lead: {item.history.statusLabel}{item.history.recordState === "archived" ? " (archived)" : ""}, owner {item.history.ownerName}</small>}
                        {item.revived && item.status === "new" && <small className="opp-flag">Back in the pool with a new role</small>}
                        {item.status === "not_relevant" && <span>{item.reason}{item.reasonNote ? ` – ${item.reasonNote}` : ""}<small className="muted-cell">{item.decidedByName}{item.decidedAt ? ` · ${formatDateTime(item.decidedAt)}` : ""}</small></span>}
                        {(item.status === "converted" || item.status === "attached") && item.lead && (
                          <span>{item.status === "converted" ? "Lead" : "Existing lead"}: <button type="button" className="link-button" onClick={() => openLead(item.lead!.id)}>{item.lead.clientName}</button><small className="muted-cell">{item.lead.statusLabel} · {item.lead.ownerName}</small></span>
                        )}
                        {item.status === "new" && !item.history && !item.revived && <small className="muted-cell">New company</small>}
                      </td>
                      <td>
                        <div className="opp-actions">
                          {item.status === "new" && can("create_leads") && !item.history && <button type="button" className="button button-primary button-small" onClick={() => setAssigning(item)}><UserPlus size={13} /> Assign as lead</button>}
                          {item.status === "new" && can("create_leads") && item.history && <button type="button" className="button button-primary button-small" onClick={() => setReopening(item)}><RotateCcw size={13} /> Reopen lead</button>}
                          {item.status === "new" && can("create_leads") && <button type="button" className="button button-outline button-small" onClick={() => setDismissing(item)}><X size={13} /> Not relevant</button>}
                          {item.status === "not_relevant" && can("create_leads") && <button type="button" className="button button-outline button-small" onClick={() => void restore(item)}><RotateCcw size={13} /> Back to the pool</button>}
                          {(item.status === "converted" || item.status === "attached") && item.lead && <button type="button" className="button button-outline button-small" onClick={() => openLead(item.lead!.id)}>Open lead</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {data && data.total > pageSize && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
        </div>
      )}
      {assigning && (
        <LeadFormDialog
          prefill={prefillFor(assigning)}
          opportunityId={assigning.id}
          onClose={() => setAssigning(null)}
          onSaved={(lead) => { setAssigning(null); notify(`${lead.clientName} is now a lead owned by ${lead.ownerName}`); bumpData(); reload(); }}
        />
      )}
      {reopening && (
        <ReopenDialog
          opportunity={reopening}
          onClose={() => setReopening(null)}
          onDone={(lead) => { setReopening(null); notify(`${lead.clientName} reopened for ${lead.ownerName}`); bumpData(); reload(); }}
        />
      )}
      {dismissing && (
        <NotRelevantDialog
          opportunity={dismissing}
          reasons={reference.listValues.opportunity_reason ?? []}
          onClose={() => setDismissing(null)}
          onDone={(item) => { setDismissing(null); notify(`${item.companyName} marked not relevant`); bumpData(); reload(); }}
        />
      )}
    </>
  );
}

function ReopenDialog({ opportunity, onClose, onDone }: { opportunity: Opportunity; onClose: () => void; onDone: (lead: { id: number; clientName: string; ownerName: string }) => void }) {
  const { reference, user } = useApp();
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const [ownerId, setOwnerId] = useState(String(user.id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const history = opportunity.history!;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { lead } = await reopenOpportunity(opportunity.id, Number(ownerId));
      onDone(lead);
    } catch (caught) {
      setError(errorMessage(caught, "The lead could not be reopened."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Reopen ${history.clientName}`} eyebrow="OPPORTUNITY POOL" onClose={onClose} size="narrow">
      <form className="lead-form" onSubmit={submit}>
        <p className="field-hint">This company was a lead before: {history.statusLabel}{history.recordState === "archived" ? " (archived)" : ""}, owned by {history.ownerName}. Reopening keeps its notes and history; the status goes back to Cold and the new job listings are added to its timeline.</p>
        <Field label="Owner" required wide><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><RotateCcw size={14} /> {busy ? "Reopening..." : "Reopen lead"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function NotRelevantDialog({ opportunity, reasons, onClose, onDone }: { opportunity: Opportunity; reasons: { id: number; value: string; code: string; active: boolean }[]; onClose: () => void; onDone: (item: Opportunity) => void }) {
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reasonId) { setError("Choose a reason."); return; }
    setBusy(true);
    setError("");
    try {
      const { opportunity: updated } = await markOpportunityNotRelevant(opportunity.id, Number(reasonId), note);
      onDone(updated);
    } catch (caught) {
      setError(errorMessage(caught, "The card could not be updated."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Not relevant: ${opportunity.companyName}`} eyebrow="OPPORTUNITY POOL" onClose={onClose} size="narrow">
      <form className="lead-form" onSubmit={submit}>
        <Field label="Reason" required wide hint="A reason about the company keeps it hidden; “Role not relevant” lets it come back when a different role is advertised.">
          <select value={reasonId} onChange={(event) => setReasonId(event.target.value)} required>
            <option value="">Choose a reason</option>
            {reasons.filter((reason) => reason.active).map((reason) => <option key={reason.id} value={reason.id}>{reason.value}</option>)}
          </select>
        </Field>
        <Field label="Note" wide><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} placeholder="Optional" /></Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><X size={14} /> {busy ? "Saving..." : "Mark not relevant"}</button>
        </div>
      </form>
    </Dialog>
  );
}

const emptySearch: OpportunitySearchInput = { name: "", keyword: "", location: "", jobType: "", maxListings: null, active: true };

/** Administrators: the shared keyword searches and the recent runs. */
function SearchesPanel() {
  const { notify, dataVersion } = useApp();
  const fetcher = useCallback(async () => { const [searches, runs] = await Promise.all([fetchSearches(), fetchRuns()]); return { searches: searches.searches, runs: runs.runs }; }, []);
  const { data, error, reload } = useAsyncData(fetcher, dataVersion);
  const [editing, setEditing] = useState<{ id: number | null; input: OpportunitySearchInput } | null>(null);
  const remove = async (search: OpportunitySearch) => {
    if (!window.confirm(`Remove the search "${search.name}"? Companies already in the pool stay.`)) return;
    try { await deleteSearch(search.id); notify(`Search "${search.name}" removed`); reload(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };
  return (
    <>
      <div className="panel opp-panel">
        <div className="opp-toolbar">
          <div><strong>Searches</strong><small className="field-hint"> · each one is sent to every enabled job source on the schedule under Settings → Opportunity searches</small></div>
          <button type="button" className="button button-outline button-small" onClick={() => setEditing({ id: null, input: { ...emptySearch } })}><Plus size={13} /> Add search</button>
        </div>
        {error && <ErrorText message={error} />}
        {!data ? <Loading /> : data.searches.length === 0 ? <EmptyState title="No searches yet" text="Add a keyword and a location, for example “baker” in “Mississauga, ON”." /> : (
          <table className="opp-table">
            <thead><tr><th>Name</th><th>Keyword</th><th>Location</th><th>Job type</th><th>Cap</th><th>Last run</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {data.searches.map((search) => (
                <tr key={search.id} className={search.active ? "" : "opp-inactive"}>
                  <td><strong>{search.name}</strong>{!search.active && <small className="muted-cell">Paused</small>}</td>
                  <td>{search.keyword}</td>
                  <td>{search.location || "—"}</td>
                  <td>{jobTypeOptions.find((option) => option.code === search.jobType)?.label ?? "Any"}</td>
                  <td>{search.maxListings ?? "default"}</td>
                  <td>{search.lastRunAt ? <>{relativeTime(search.lastRunAt)}<small className="muted-cell">{search.lastFound} found · {search.lastNew} new</small></> : "never"}</td>
                  <td>
                    <div className="opp-actions">
                      <button type="button" className="button button-outline button-small" onClick={() => setEditing({ id: search.id, input: { name: search.name, keyword: search.keyword, location: search.location, jobType: search.jobType, maxListings: search.maxListings, active: search.active } })}><Pencil size={12} /> Edit</button>
                      <button type="button" className="button button-outline button-small" onClick={() => void remove(search)}><Trash2 size={12} /> Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel opp-panel opp-runs">
        <div className="opp-toolbar"><strong>Recent runs</strong></div>
        {data && data.runs.length === 0 && <EmptyState title="No run yet" />}
        {data && data.runs.length > 0 && (
          <table className="opp-table">
            <thead><tr><th>Started</th><th>How</th><th>Result</th><th>Listings</th><th>New companies</th><th>Attached to leads</th><th>Details</th></tr></thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatDateTime(run.startedAt)}</td>
                  <td>{run.trigger === "manual" ? `Run now${run.actorName ? ` by ${run.actorName}` : ""}` : "Scheduled"}</td>
                  <td><span className={`badge ${run.status === "success" ? "badge-success" : run.status === "failed" ? "badge-danger" : "badge-muted"}`}>{run.status}</span></td>
                  <td>{run.listingsFound}</td>
                  <td>{run.newCompanies}</td>
                  <td>{run.attached}</td>
                  <td className="opp-details">{run.details || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <SearchFormDialog
          initial={editing.input}
          title={editing.id === null ? "Add a search" : "Edit the search"}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = editing.id === null ? await createSearch(input) : await updateSearch(editing.id, input);
            notify(`Search "${saved.search.name}" saved`);
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function SearchFormDialog({ initial, title, onClose, onSave }: { initial: OpportunitySearchInput; title: string; onClose: () => void; onSave: (input: OpportunitySearchInput) => Promise<void> }) {
  const [form, setForm] = useState({ ...initial, maxListings: initial.maxListings === null ? "" : String(initial.maxListings) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ name: form.name, keyword: form.keyword, location: form.location, jobType: form.jobType, maxListings: form.maxListings === "" ? null : Number(form.maxListings), active: form.active });
    } catch (caught) {
      setError(errorMessage(caught, "The search could not be saved."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} eyebrow="OPPORTUNITY SEARCHES" onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Name" required wide><input value={form.name} onChange={set("name")} required maxLength={120} placeholder="e.g. Bakery staff in Peel" autoFocus /></Field>
        <Field label="Keyword" required hint="What the job sources search for, as a person would type it."><input value={form.keyword} onChange={set("keyword")} required maxLength={200} placeholder="e.g. baker" /></Field>
        <Field label="Location" hint="City or region; leave empty for the whole country."><input value={form.location} onChange={set("location")} maxLength={160} placeholder="e.g. Mississauga, ON" /></Field>
        <Field label="Job type"><select value={form.jobType} onChange={set("jobType")}>{jobTypeOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></Field>
        <Field label="Listings per source" hint={`${minMaxListings} to ${maxMaxListings}; empty uses the default from Settings.`}><input type="number" min={minMaxListings} max={maxMaxListings} value={form.maxListings} onChange={set("maxListings")} placeholder="default" /></Field>
        <label className="checklist-item"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active (runs on the schedule and with Run now)</label>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Save search"}</button>
        </div>
      </form>
    </Dialog>
  );
}
