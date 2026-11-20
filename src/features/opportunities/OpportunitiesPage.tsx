"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArrowRightCircle, Briefcase, ListChecks, MoreHorizontal, Gauge, Building2, ChevronDown, ChevronRight, ExternalLink, Pencil, Play, Plus, RotateCcw, Search, Trash2, UserRound, X } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { createOrganization, createPerson, fetchOrganization, fetchOrganizations } from "@/features/contacts/client";
import { contactKey, type OrganizationRow, type PersonRow } from "@/features/contacts/model";
import { OrganizationFormDialog, PersonFormDialog } from "@/features/contacts/ContactFormDialogs";
import JobsUsageCard from "@/features/jobs/JobsUsageCard";
import { createLead } from "@/features/leads/client";
import { offBoardStatusCodes, stageChoices } from "@/features/pipeline/model";
import { bdCommentLines, type LeadInput } from "@/features/leads/model";
import { leadGenToolSourceId, type ListValuesByKey } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import SuggestInput from "@/features/shell/SuggestInput";
import { Dialog, EmptyState, ErrorText, Field, Loading, Pagination, Tabs, type TabOption } from "@/features/shell/components";
import { archiveOpportunity, createOpportunity, createSearch, lookupLeadCompanyDetails, setOpportunityTodo, deleteSearch, editOpportunity, fetchOpportunities, fetchRuns, fetchSearches, markOpportunityNotRelevant, reopenOpportunity, restoreOpportunity, runSearchesNow, updateSearch } from "./client";
import { jobTypeOptions, maxMaxListings, maxPostedWithinDays, maxSearchTitles, minMaxListings, minPostedWithinDays, type Opportunity, type OpportunitySearch, type OpportunitySearchInput, type OpportunityStatus, type LeadEntryInput, type OpportunityOrigin } from "./model";

type Tab = OpportunityStatus | "searches";
const pageSize = 50;

const statusLabels: Record<OpportunityStatus, string> = { new: "Inbox", not_relevant: "Not Relevant", converted: "Converted to Deals", attached: "Existing Deals" };

/**
 * What the lead form starts with when a card is assigned: the company, where it is, and the roles it advertises; for a
 * card from the sales tracker (§10.9), everything the sheet knew, with the named list values resolved to ids.
 */
function prefillFor(item: Opportunity, values: ListValuesByKey): Partial<LeadInput> {
  const lines = item.listings.map((listing) => `${listing.title} (${listing.sourceLabel}${listing.postedAt ? `, posted ${formatDate(listing.postedAt)}` : ""}) ${listing.url}`);
  const poolNote = lines.length ? `From the leads inbox (first seen ${formatDate(item.firstSeenAt.slice(0, 10))}):\n${lines.join("\n")}` : "";
  const draft = item.tracker?.lead;
  // The deal takes the lead's Lead Source (request of November 19, 2026); a lead without one came from the lead generation tool.
  const leadSource = item.leadSourceId ?? leadGenToolSourceId(values.lead_type) ?? undefined;
  // BD action and Client response are fields of the lead, not of the deal: the deal keeps them in its Comments.
  // A deal has one contact: the lead's first; the others stay contacts of the company and are named in the comments.
  const others = item.contacts.slice(1).map((contact) => contact.name);
  const leadNotes = [item.note, bdCommentLines(item.bdAction, item.clientResponse), others.length ? `Other contacts: ${others.join(", ")}` : ""].filter(Boolean).join("\n");
  if (!draft) {
    return { leadTypeId: leadSource, clientExecutive: item.contacts[0]?.name ?? "", clientName: item.companyName, companyUrl: item.website, address: item.location, positions: item.listings.map((listing) => listing.title).join("\n").slice(0, 5000), comments: [leadNotes, poolNote].filter(Boolean).join("\n").slice(0, 5000) };
  }
  const byName = (key: keyof ListValuesByKey, name: string | null) => (name ? values[key]?.find((value) => value.value.toLowerCase() === name.toLowerCase())?.id ?? null : null);
  return {
    clientName: draft.name, companyUrl: item.website, address: draft.address || item.location, comments: [draft.comments, leadNotes, poolNote].filter(Boolean).join("\n").slice(0, 5000),
    clientExecutive: draft.executive, contactPhone: draft.phone, contactAltPhone: draft.altPhone, contactRemark: draft.contactRemark, clientEmails: draft.emails, industry: draft.industry,
    positions: [draft.positions, ...item.listings.map((listing) => listing.title)].filter(Boolean).join("\n").slice(0, 5000),
    leadTypeId: leadSource ?? byName("lead_type", draft.type) ?? undefined, statusId: values.status.find((value) => value.code === draft.status)?.id, cityId: byName("city", draft.city),
    firstContactDate: draft.firstContact || undefined, followUpDate: draft.followUp, contractSignedDate: draft.contract,
  };
}

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

/** The opportunity pool (OPP-02, OPP-11..13 as decided): one card per hiring company, assign or dismiss. */
/**
 * Two pages over the same cards (request of November 19, 2026): **Leads** (`origin="manual"`) lists the leads added by hand and
 * the tracker import's drafts, with Add lead; **Lead Generation** (`origin="found"`, under Tools) lists the companies the job
 * searches found, with Searches & runs, Execute (run the searches now) and Budget (the jobs usage).
 */
export default function OpportunitiesPage({ origin }: { origin: OpportunityOrigin }) {
  const { can, notify, openLead, dataVersion, bumpData, reference, route } = useApp();
  const found = origin === "found";
  const [tab, setTab] = useState<Tab>("new");
  const [page, setPage] = useState(1);
  // The lead Action Center opens a lead here by its name, and the lists with My Work or Whole Team (request of November 20, 2026).
  const [filter, setFilter] = useState(() => route.query.get("q") ?? "");
  // My Leads / Everyone on Leads, By Me / Everyone on Lead Generation (request of November 19, 2026).
  const [scope, setScope] = useState<"mine" | "everyone">(() => (route.query.get("scope") === "mine" ? "mine" : "everyone"));
  const status: OpportunityStatus = tab === "searches" ? "new" : tab;
  const fetcher = useCallback(() => fetchOpportunities({ status, page, pageSize, search: filter.trim(), origin, scope }), [status, page, filter, origin, scope]);
  const { data, error, reload } = useAsyncData(fetcher, dataVersion);
  // Leads: Move to Pipeline asks the stage and the status, like Move back to pipeline (request of November 19, 2026).
  const [moving, setMoving] = useState<Opportunity | null>(null);
  // To Do lists for leads (request of November 20, 2026).
  // To Be Visited (request of November 20, 2026): one click puts the lead on the "To be visited" list.
  const toBeVisitedId = reference.listValues.todo_list.find((list) => list.code === "to_be_visited" && list.active)?.id ?? null;
  const markToBeVisited = async (item: Opportunity) => {
    if (!toBeVisitedId) return;
    try { await setOpportunityTodo(item.id, toBeVisitedId); notify(`${item.companyName} marked To Be Visited`); bumpData(); reload(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };
  const takeOffTodo = async (item: Opportunity) => {
    try { await setOpportunityTodo(item.id, null); notify(`${item.companyName} removed from ${item.todoList ?? "To Do"}`); bumpData(); reload(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };
  const [dismissing, setDismissing] = useState<Opportunity | null>(null);
  // Add lead (null: closed; "new": a new lead; a card: that lead's fields).
  const [entry, setEntry] = useState<Opportunity | "new" | null>(null);
  const [reopening, setReopening] = useState<Opportunity | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState(false);
  // Request of November 19, 2026: the job sources' budgets open from a Budget button instead of filling the top of the page.
  const [budgetOpen, setBudgetOpen] = useState(false);
  const counts = data?.counts;
  const tabs: TabOption<Tab>[] = [
    { id: "new", label: statusLabels.new, count: counts?.new },
    { id: "not_relevant", label: statusLabels.not_relevant, count: counts?.not_relevant },
    // Requests of November 19 and 20, 2026: Leads and Lead Generation show only the inbox and the leads marked not relevant; a converted lead is a deal in the Pipeline, at the stage and status chosen.
    ...(found && can("manage_settings") ? [{ id: "searches" as Tab, label: "Searches & runs" }] : []),
  ];

  const runNow = async () => {
    setRunning(true);
    try {
      const { run } = await runSearchesNow();
      notify(`Search ${run.status}: ${run.listingsFound} listings, ${run.newCompanies} new ${run.newCompanies === 1 ? "company" : "companies"}, ${run.attached} attached to existing deals`, run.status === "failed" ? "error" : "success");
      bumpData();
    } catch (caught) {
      notify(errorMessage(caught, "The searches could not be run."), "error");
    } finally {
      setRunning(false);
    }
  };

  // Request of November 20, 2026: a lead moves to the Archive by hand; it is restored from the Archive page.
  const archive = async (item: Opportunity) => {
    try { await archiveOpportunity(item.id); notify(`${item.companyName} moved to the Archive`); bumpData(); reload(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };

  const restore = async (item: Opportunity) => {
    try { await restoreOpportunity(item.id); notify(`${item.companyName} is back in the inbox`); bumpData(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{found ? "TOOLS" : "LEADS INBOX"}</div>
          <h1>{found ? "Lead Generation" : "Leads"}</h1>
          <p>{found
            ? "Hiring companies found by the job searches: convert one to a deal or mark it not relevant."
            : "Leads added by hand and companies from the sales tracker with no Sales Manager. Convert one to a deal for yourself or a colleague, or mark it not relevant. The companies the job searches find are on Lead Generation."}</p>
        </div>
        <div className="page-heading-actions">
          {found && <button type="button" className="button button-soft" onClick={() => setBudgetOpen(true)}><Gauge size={14} /> Budget</button>}
          {found && can("manage_settings") && <button type="button" className="button button-primary" onClick={() => void runNow()} disabled={running} title="Run the searches now"><Play size={14} /> {running ? "Executing..." : "Execute"}</button>}
          {!found && can("create_leads") && <button className="button button-primary" onClick={() => setEntry("new")}><Plus size={14} /> Add Lead</button>}
        </div>
      </div>
      <div className="opp-tabs"><Tabs tabs={tabs} active={tab} onChange={(id) => { setTab(id); setPage(1); setExpanded({}); }} /></div>
      {tab === "searches" ? <SearchesPanel /> : (
        <div className="panel">
          <div className="opp-toolbar">
            <div className="opp-toolbar-left">
            <div className="scope-toggle" role="group" aria-label={found ? "Found by" : "Whose leads"}>
              <button type="button" className={scope === "mine" ? "is-active" : ""} aria-pressed={scope === "mine"} onClick={() => { setScope("mine"); setPage(1); }}>{found ? "By Me" : "My Leads"}</button>
              <button type="button" className={scope === "everyone" ? "is-active" : ""} aria-pressed={scope === "everyone"} onClick={() => { setScope("everyone"); setPage(1); }}>Everyone</button>
            </div>
            <label className="opp-search"><Search size={13} /><input placeholder="Filter by company, role, or location" aria-label="Filter leads" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} /></label>
            </div>
            {data && <small className="field-hint">{data.total} {data.total === 1 ? "company" : "companies"}</small>}
          </div>
          {error && <ErrorText message={error} />}
          {!data && !error ? <Loading /> : data && data.opportunities.length === 0 ? (
            <EmptyState icon={<Briefcase size={22} />} title={status === "new" ? "Nothing in the inbox" : `No ${statusLabels[status].toLowerCase()} yet`} text={status === "new" ? (!found ? (can("create_leads") ? "Add a lead by hand with Add lead." : undefined) : can("manage_settings") ? "Add a search under Searches & runs and run it, or wait for the next scheduled run." : "The next scheduled search run will add companies here.") : undefined} />
          ) : data && (
            <table className="opp-table">
              <thead><tr><th>Company</th><th>Roles / history</th><th>Location</th><th>Seen</th><th>{status === "new" ? "Notes" : "Outcome"}</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {data.opportunities.map((item) => {
                  const open = expanded[item.id] ?? false;
                  return (
                    <tr key={item.id}>
                      <td>
                        {/* Request of November 20, 2026: with a website, the lead's name opens it. */}
                        <strong>{item.website ? <a className="opp-name-link" href={item.website} target="_blank" rel="noopener noreferrer" title={`Open ${item.website}`}>{item.companyName}{" "}<ExternalLink size={12} aria-hidden="true" /></a> : item.companyName}</strong>
                        <small className="muted-cell">{[...(item.addedByName ? [`Added by ${item.addedByName}`] : []), ...item.sources, ...(item.tracker ? ["Sales tracker"] : [])].join(", ")}</small>
                        {item.leadSource && <small className="opp-source">Lead source: {item.leadSource}</small>}
                        {item.todoList && <small className="opp-todo"><ListChecks size={11} /> To Do: {item.todoList}</small>}
                        {item.contacts.length > 0 && <small className="opp-contacts"><UserRound size={11} /> {item.contacts.map((contact) => contact.name).join(", ")}</small>}
                      </td>
                      <td>
                        {item.listingsCount === 0 && !item.tracker ? <span className="muted-cell">—</span> : <>
                        <button type="button" className="opp-expand" onClick={() => setExpanded((current) => ({ ...current, [item.id]: !open }))} aria-expanded={open}>
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {[
                            item.listingsCount > 0 || !item.tracker ? `${item.listingsCount} ${item.listingsCount === 1 ? "role" : "roles"}` : "",
                            item.tracker ? `${item.tracker.rows} tracker ${item.tracker.rows === 1 ? "entry" : "entries"}` : "",
                          ].filter(Boolean).join(" · ")}
                        </button>
                        {!open && item.latestTitle && <small className="muted-cell">{item.latestTitle}</small>}
                        {!open && !item.latestTitle && item.tracker && <small className="muted-cell">{capitalize(item.tracker.lead.status)} · last contact {formatDate(item.tracker.lead.lastActivity)}</small>}
                        {open && (
                          <ul className="opp-roles">
                            {item.listings.map((listing) => (
                              <li key={listing.id}><a href={listing.url} target="_blank" rel="noreferrer">{listing.title} <ExternalLink size={10} /></a> <small>{listing.sourceLabel}{listing.postedAt ? ` · posted ${formatDate(listing.postedAt)}` : ""}{listing.employmentType ? ` · ${listing.employmentType}` : ""}</small></li>
                            ))}
                            {item.tracker?.entries.map((entry, index) => (
                              <li key={`tracker-${index}`}>{entry.summary} <small>sales tracker · {formatDate(entry.date)}</small></li>
                            ))}
                          </ul>
                        )}
                        </>}
                      </td>
                      <td>{item.location || "—"}</td>
                      <td><span title={formatDateTime(item.lastSeenAt)}>{relativeTime(item.lastSeenAt)}</span><small className="muted-cell">first {formatDate(item.firstSeenAt.slice(0, 10))}</small></td>
                      <td>
                        {item.history && <small className="opp-flag">Was a deal: {item.history.statusLabel}{item.history.recordState === "archived" ? " (archived)" : ""}, owner {item.history.ownerName}</small>}
                        {item.revived && item.status === "new" && <small className="opp-flag">Back in the inbox with a new role</small>}
                        {item.tracker && item.status === "new" && (
                          <small className="opp-flag">From the sales tracker, no Sales Manager: {reference.listValues.status.find((value) => value.code === item.tracker!.lead.status)?.value ?? capitalize(item.tracker.lead.status)}{item.tracker.lead.executive ? ` · ${item.tracker.lead.executive}` : ""}{item.tracker.lead.phone ? ` · ${item.tracker.lead.phone}` : ""}</small>
                        )}
                        {item.status === "not_relevant" && <span>{item.reason}{item.reasonNote ? ` – ${item.reasonNote}` : ""}<small className="muted-cell">{item.decidedByName}{item.decidedAt ? ` · ${formatDateTime(item.decidedAt)}` : ""}</small></span>}
                        {(item.status === "converted" || item.status === "attached") && item.lead && (
                          <span>{item.status === "converted" ? "Deal" : "Existing deal"}: <button type="button" className="link-button" onClick={() => openLead(item.lead!.id)}>{item.lead.clientName}</button><small className="muted-cell">{item.lead.statusLabel} · {item.lead.ownerName}</small></span>
                        )}
                        {(item.bdAction || item.clientResponse) && (
                          <span className="opp-lead-fields">
                            {item.bdAction && <small><b>BD action</b> {item.bdAction}</small>}
                            {item.clientResponse && <small><b>Client response</b> {item.clientResponse}</small>}
                          </span>
                        )}
                        {item.note && <small className="opp-note">{item.note}</small>}
                        {item.status === "new" && !item.history && !item.revived && !item.tracker && !item.addedByName && !item.bdAction && !item.clientResponse && !item.note && <small className="muted-cell">New company</small>}
                      </td>
                      <td>
                        {/* Request of November 20, 2026: one Actions menu per lead. Convert to Deal asks only the stage, the status and the owner. */}
                        <RowActions
                          name={item.companyName}
                          items={[
                            ...(item.status === "new" && can("create_leads") && !item.history ? [{ tone: "convert" as const, label: "Convert to Deal", icon: <ArrowRightCircle size={14} />, run: () => setMoving(item) }] : []),
                            ...(item.status === "new" && can("create_leads") && item.history ? [{ tone: "convert" as const, label: "Reopen Deal", icon: <RotateCcw size={14} />, run: () => setReopening(item) }] : []),
                            ...((item.status === "new" || item.status === "not_relevant") && can("create_leads") ? [{ tone: "edit" as const, label: "Edit", icon: <Pencil size={14} />, run: () => setEntry(item) }] : []),
                            ...(item.status === "new" && can("create_leads") ? [{ tone: "dismiss" as const, label: "Not Relevant", icon: <X size={14} />, run: () => setDismissing(item) }] : []),
                            ...(item.status === "not_relevant" && can("create_leads") ? [{ tone: "restore" as const, label: "Back to the Inbox", icon: <RotateCcw size={14} />, run: () => void restore(item) }] : []),
                            ...((item.status === "new" || item.status === "not_relevant") && can("create_leads") && toBeVisitedId && item.todoListId !== toBeVisitedId ? [{ tone: "restore" as const, label: "To Be Visited", icon: <ListChecks size={14} />, run: () => void markToBeVisited(item) }] : []),
                            ...((item.status === "new" || item.status === "not_relevant") && can("create_leads") && item.todoList ? [{ tone: "edit" as const, label: item.todoListId === toBeVisitedId ? "Remove From To Be Visited" : "Remove From To Do", icon: <X size={14} />, run: () => void takeOffTodo(item) }] : []),
                            ...((item.status === "new" || item.status === "not_relevant") && can("create_leads") ? [{ tone: "archive" as const, label: "Archive", icon: <Archive size={14} />, run: () => void archive(item) }] : []),
                            ...((item.status === "converted" || item.status === "attached") && item.lead ? [{ tone: "edit" as const, label: "Open Deal", icon: <ExternalLink size={14} />, run: () => openLead(item.lead!.id) }] : []),
                          ]}
                        />
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
      {budgetOpen && (
        <Dialog title="Job Listing Sources This Month" eyebrow="LEAD GENERATION" size="wide" onClose={() => setBudgetOpen(false)}>
          <JobsUsageCard inDialog refreshKey={running} empty={<p className="dialog-description">No live job source is set up: the searches use the sample listings, so there is no budget to show.</p>} />
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setBudgetOpen(false)}>Close</button></div>
        </Dialog>
      )}
      {moving && (
        <MoveToPipelineDialog
          opportunity={moving}
          onClose={() => setMoving(null)}
          onDone={(lead) => { setMoving(null); notify(`${lead.clientName} converted to a deal: ${lead.stage}, ${lead.statusLabel}, owner ${lead.ownerName}`); bumpData(); reload(); }}
        />
      )}
      {reopening && (
        <ReopenDialog
          opportunity={reopening}
          onClose={() => setReopening(null)}
          onDone={(lead) => { setReopening(null); notify(`${lead.clientName} reopened for ${lead.ownerName}`); bumpData(); reload(); }}
        />
      )}
      {entry && (
        <LeadEntryDialog
          lead={entry === "new" ? null : entry}
          onClose={() => setEntry(null)}
          onSaved={(item, created) => { setEntry(null); notify(created ? `${item.companyName} added to the leads inbox` : `${item.companyName} saved`); if (created) { setTab("new"); setPage(1); } bumpData(); reload(); }}
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

/**
 * Add lead / Edit lead (request of November 19, 2026): the company, its website and location, the Lead Source (the Deal Source
 * values; the deal takes it when the lead is converted), BD action and Client response (fields of the lead, no longer of the
 * deal), and a note. A new lead starts with the Lead Gen Tool source.
 */
export function LeadEntryDialog({ lead, onClose, onSaved }: { lead: Opportunity | null; onClose: () => void; onSaved: (item: Opportunity, created: boolean) => void }) {
  const { reference } = useApp();
  const values = reference.listValues;
  const usable = <T extends { id: number; active: boolean }>(list: T[], current: number | null) => list.filter((item) => item.active || item.id === current);
  const [form, setForm] = useState({
    companyName: lead?.companyName ?? "", website: lead?.website ?? "", location: lead?.location ?? "",
    leadSourceId: String(lead ? lead.leadSourceId ?? "" : leadGenToolSourceId(values.lead_type) ?? ""),
    bdActionId: lead?.bdActionId ? String(lead.bdActionId) : "", clientResponseId: lead?.clientResponseId ? String(lead.clientResponseId) : "", note: lead?.note ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  // Company and contacts as in Add deal (request of November 19, 2026): the company is picked from Contacts → Companies or
  // added as new (NEW badge); contacts are looked up inside it, several of them, each picked or added as new.
  const [org, setOrg] = useState<{ id: number | null; isNew: boolean }>({ id: lead?.organizationId ?? null, isNew: false });
  const [orgRows, setOrgRows] = useState<{ q: string; rows: OrganizationRow[] } | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [chosen, setChosen] = useState<{ id: number | null; name: string }[]>(lead?.contacts ?? []);
  const [personName, setPersonName] = useState("");
  const typedOrg = org.id || org.isNew ? "" : form.companyName.trim();
  useEffect(() => {
    if (typedOrg.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { fetchOrganizations(typedOrg, 1).then((page) => { if (!cancelled) setOrgRows({ q: typedOrg, rows: page.rows.slice(0, 8) }); }).catch(() => undefined); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typedOrg]);
  useEffect(() => {
    if (!org.id) return;
    let cancelled = false;
    fetchOrganization(org.id).then((detail) => {
      if (cancelled) return;
      setPeople(detail.people);
      // A company picked brings its website and city when the lead has none yet.
      setForm((current) => ({ ...current, website: current.website || detail.organization.website || "", location: current.location || detail.organization.city || detail.organization.address || "" }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [org.id]);
  const changeOrgName = (value: string) => { setForm((current) => ({ ...current, companyName: value })); setOrg({ id: null, isNew: false }); setPeople([]); setChosen([]); setPersonName(""); };
  const orgExact = orgRows && orgRows.q === typedOrg ? orgRows.rows.find((row) => contactKey(row.name) === contactKey(typedOrg)) ?? null : null;
  // "+ Add ... as new company / contact" opens Add company / Add contact with the name (request of November 19, 2026).
  const [addingOrg, setAddingOrg] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState<string | null>(null);
  const linkOrg = (id: number, name: string) => { setForm((current) => ({ ...current, companyName: name })); setOrg({ id, isNew: false }); setChosen([]); setPersonName(""); };
  const orgCreate = typedOrg.length >= 2 && orgRows?.q === typedOrg && !orgExact ? { label: `Add '${typedOrg}' as new company`, onCreate: () => setAddingOrg(typedOrg) } : null;
  const orgChosen = Boolean(org.id || org.isNew);
  const typedPerson = personName.trim();
  const isChosen = (name: string) => chosen.some((item) => contactKey(item.name) === contactKey(name));
  const personExact = (org.id ? people : []).find((item) => contactKey(item.name) === contactKey(typedPerson)) ?? null;
  const addPerson = (item: { id: number | null; name: string }) => { if (!isChosen(item.name)) setChosen((current) => [...current, item]); setPersonName(""); };
  const linkPerson = (id: number, name: string) => {
    addPerson({ id, name });
    if (org.id) fetchOrganization(org.id).then((detail) => setPeople(detail.people)).catch(() => undefined);
  };
  const personCreate = orgChosen && typedPerson.length >= 2 && !personExact && !isChosen(typedPerson) ? { label: `Add '${typedPerson}' as new contact`, onCreate: () => setAddingPerson(typedPerson) } : null;
  /** A comma after a name adds it, so the next one can be typed: a contact of the company, or a new one through Add contact. */
  const typePerson = (value: string) => {
    if (!value.includes(",")) { setPersonName(value); return; }
    const [name, ...rest] = value.split(",");
    const typed = name.trim();
    setPersonName(rest.join(",").trimStart());
    if (!typed || isChosen(typed)) return;
    const known = (org.id ? people : []).find((item) => contactKey(item.name) === contactKey(typed));
    if (known) addPerson({ id: known.id, name: known.name });
    else if (orgChosen) setAddingPerson(typed);
  };

  /** The company and contact records to save: picked, an exact name typed, or created now (the company first, then its contacts). */
  const resolveLinks = async (): Promise<{ organizationId: number | null; personIds: number[] }> => {
    const name = form.companyName.trim();
    let organizationId = org.id ?? orgExact?.id ?? null;
    if (!organizationId) {
      if (!org.isNew) throw new Error(`Pick “${name}” from the list, or add it as a new company.`);
      organizationId = (await createOrganization({ name, website: "", address: form.location.trim(), cityId: null, industry: "", companySizeId: null })).organization.id;
      setOrg({ id: organizationId, isNew: false });
    }
    if (typedPerson) throw new Error(`Pick “${typedPerson}” from the list, or add them as a new contact.`);
    const personIds: number[] = [];
    const saved: { id: number; name: string }[] = [];
    for (const item of chosen) {
      const id = item.id ?? (await createPerson({ name: item.name, organizationName: name, emails: [], phone: "", altPhone: "", remark: "" })).person.id;
      personIds.push(id);
      saved.push({ id, name: item.name });
    }
    setChosen(saved);
    return { organizationId, personIds };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const website = form.website.trim() && !/^https?:\/\//i.test(form.website.trim()) ? `https://${form.website.trim()}` : form.website.trim();
    try {
      const links = await resolveLinks();
      const input: LeadEntryInput = {
        companyName: form.companyName.trim(), website, location: form.location, leadSourceId: form.leadSourceId ? Number(form.leadSourceId) : null,
        bdActionId: form.bdActionId ? Number(form.bdActionId) : null, clientResponseId: form.clientResponseId ? Number(form.clientResponseId) : null, note: form.note,
        organizationId: links.organizationId, personIds: links.personIds,
      };
      const { opportunity } = lead ? await editOpportunity(lead.id, input) : await createOpportunity(input);
      onSaved(opportunity, !lead);
    } catch (caught) {
      setError(errorMessage(caught, "The lead could not be saved."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={lead ? `Edit ${lead.companyName}` : "Add Lead"} eyebrow="LEADS INBOX" onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Company" required wide hint={org.isNew ? "A new company: it is added under Contacts → Companies when the lead is saved." : "Start typing the company's name: pick one of the companies that match, or add it as a new one."}>
          <SuggestInput
            value={form.companyName} onChange={changeOrgName}
            suggestions={orgRows && orgRows.q === typedOrg ? orgRows.rows.map((row) => ({ key: String(row.id), label: row.name, icon: <Building2 size={14} />, detail: [row.city, row.industry, row.openDeals ? `${row.openDeals} open ${row.openDeals === 1 ? "deal" : "deals"}` : null, row.people ? `${row.people} ${row.people === 1 ? "contact" : "contacts"}` : null].filter(Boolean).join(" · ") || undefined })) : []}
            onPick={(suggestion) => { setForm((current) => ({ ...current, companyName: suggestion.label })); setOrg({ id: Number(suggestion.key), isNew: false }); setChosen([]); setPersonName(""); }}
            loading={typedOrg.length >= 2 && orgRows?.q !== typedOrg}
            icon={<Building2 size={16} />} create={orgCreate} isNew={org.isNew} onClear={() => changeOrgName("")}
            required maxLength={200} placeholder="Company" autoFocus
          />
        </Field>
        <Field label="Contacts" wide hint={orgChosen ? "Several contacts can be added: pick them from the company's contacts, or add a new one." : "Choose the company first: contacts are looked up inside it."}>
          <div className="lead-contacts">
            {chosen.length > 0 && (
              <ul className="activity-people" aria-label="Contacts">
                {chosen.map((item) => (
                  <li key={`${item.id ?? "new"}-${item.name}`}>
                    <UserRound size={13} /> <span>{item.name}</span>{!item.id && <span className="suggest-new-badge">NEW</span>}
                    <button type="button" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => setChosen((current) => current.filter((other) => other !== item))}><X size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
            <SuggestInput
              aria-label="Contact" value={personName} onChange={typePerson}
              suggestions={(org.id ? people : []).filter((item) => !isChosen(item.name) && (!typedPerson || contactKey(item.name).includes(contactKey(typedPerson)))).map((item) => ({ key: String(item.id), label: item.name, detail: [item.email, item.phone].filter(Boolean).join(" · ") || undefined, icon: <UserRound size={14} /> }))}
              onPick={(suggestion) => addPerson({ id: Number(suggestion.key), name: suggestion.label })}
              minChars={0} disabled={!orgChosen}
              icon={<UserRound size={16} />} create={personCreate}
              maxLength={160} placeholder={!orgChosen ? "Choose the company first" : chosen.length ? "Add another contact" : "Contact"}
            />
          </div>
        </Field>
        <Field label="Website"><input value={form.website} onChange={set("website")} maxLength={500} inputMode="url" placeholder="https://company.com" /></Field>
        <Field label="Location"><input value={form.location} onChange={set("location")} maxLength={160} placeholder="City or address" /></Field>
        <Field label="Lead Source" required hint="The deal takes this source when the lead is converted.">
          <select value={form.leadSourceId} onChange={set("leadSourceId")} required>
            <option value="">Choose...</option>
            {usable(values.lead_type, lead?.leadSourceId ?? null).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <Field label="BD Action">
          <select value={form.bdActionId} onChange={set("bdActionId")}>
            <option value="">Not set</option>
            {usable(values.bd_action, lead?.bdActionId ?? null).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <Field label="Client Response">
          <select value={form.clientResponseId} onChange={set("clientResponseId")}>
            <option value="">Not set</option>
            {usable(values.client_response, lead?.clientResponseId ?? null).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <Field label="Note" wide><textarea rows={3} value={form.note} onChange={set("note")} maxLength={5000} placeholder="What you know about the company, who to call..." /></Field>
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{lead ? <Pencil size={14} /> : <Plus size={14} />} {busy ? "Saving..." : lead ? "Save Lead" : "Add Lead"}</button>
        </div>
      </form>
      {addingOrg !== null && (
        <OrganizationFormDialog
          initialName={addingOrg}
          onUseExisting={(found) => { setAddingOrg(null); linkOrg(found.id, found.name); }}
          onClose={() => setAddingOrg(null)}
          onSaved={(saved) => { setAddingOrg(null); linkOrg(saved.id, saved.name); }}
        />
      )}
      {addingPerson !== null && (
        <PersonFormDialog
          organizationName={form.companyName.trim()}
          initialName={addingPerson}
          onUseExisting={(found) => { setAddingPerson(null); linkPerson(found.id, found.name); }}
          onClose={() => setAddingPerson(null)}
          onSaved={(saved) => { setAddingPerson(null); linkPerson(saved.id, saved.name); }}
        />
      )}
    </Dialog>
  );
}

/**
 * Move to Pipeline (request of November 19, 2026): a lead becomes a deal with what the lead already holds (company, contact,
 * Lead source, notes, BD action and Client response in the comments); the dialog asks only the pipeline stage, the status
 * and, for someone who may assign deals, the owner. A near-duplicate deal is shown, with Move anyway when it may be overridden.
 */
/** Puts a lead on a To Do list (request of November 20, 2026): To be visited first, as for deals. */
export function LeadTodoDialog({ lead, onClose, onDone }: { lead: { id: number; companyName: string; todoListId: number | null }; onClose: () => void; onDone: (message: string) => void }) {
  const { reference } = useApp();
  const lists = reference.listValues.todo_list.filter((item) => item.active);
  const [listId, setListId] = useState(String(lead.todoListId ?? lists.find((item) => item.code === "to_be_visited")?.id ?? lists[0]?.id ?? ""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!listId) { setError("Choose a To Do list."); return; }
    setBusy(true);
    setError("");
    try {
      const { opportunity } = await setOpportunityTodo(lead.id, Number(listId));
      onDone(`${opportunity.companyName} moved to To Do: ${opportunity.todoList ?? "the list"}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not move the lead to the To Do list."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Move ${lead.companyName} to a To Do List`} eyebrow="TO DO" size="narrow" onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="To Do List" required wide>
          <select value={listId} onChange={(event) => setListId(event.target.value)} required autoFocus aria-label="To Do list">
            {lists.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><ListChecks size={14} /> {busy ? "Moving..." : "Move to To Do"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** The Actions menu of a lead's row (request of November 20, 2026): every action on the lead in one drop-down. */
/** Each action has its colour (request of November 20, 2026): convert green, edit blue, not relevant red, back to the inbox teal, archive amber. */
type ActionTone = "convert" | "edit" | "dismiss" | "restore" | "archive";

function RowActions({ name, items }: { name: string; items: { tone: ActionTone; label: string; icon: ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="menu-anchor opp-row-actions" ref={anchor}>
      <button type="button" className="button button-soft button-small" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${name}`} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal size={14} /> Actions <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu-dropdown opp-actions-menu" role="menu">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={`is-${item.tone}`} onClick={() => { setOpen(false); item.run(); }}>{item.icon} {item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function MoveToPipelineDialog({ opportunity, onClose, onDone }: { opportunity: Opportunity; onClose: () => void; onDone: (lead: { clientName: string; ownerName: string; statusLabel: string; stage: string }) => void }) {
  const { reference, can, user } = useApp();
  const values = reference.listValues;
  const stages = stageChoices(values.stage, reference.pipelines).filter((item) => item.active);
  const statuses = values.status.filter((item) => item.active && !offBoardStatusCodes.includes(item.code));
  const prefill = prefillFor(opportunity, values);
  const owners = reference.users.filter((item) => item.role !== "recruiter" && item.active !== false);
  const [stageId, setStageId] = useState(String(stages[0]?.id ?? ""));
  const [statusId, setStatusId] = useState(String(statuses.find((item) => item.id === prefill.statusId)?.id ?? statuses.find((item) => item.code === "cold")?.id ?? statuses[0]?.id ?? ""));
  const [ownerId, setOwnerId] = useState(String(user.id));
  const [error, setError] = useState("");
  const [similar, setSimilar] = useState<{ message: string; canOverride: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // The company's details (request of November 20, 2026): looked up on Google Maps and the website for a lead with no company
  // yet; the person checks them; the deal, and through it the new company and contact, takes them.
  const lookupWanted = !opportunity.organizationId;
  const [company, setCompany] = useState({ website: prefill.companyUrl ?? "", address: prefill.address ?? "", phone: prefill.contactPhone ?? "", industry: prefill.industry ?? "" });
  const [cityName, setCityName] = useState("");
  const [lookup, setLookup] = useState<"idle" | "busy" | "done" | "none" | "failed">(lookupWanted ? "busy" : "idle");
  const [foundIn, setFoundIn] = useState<string[]>([]);
  useEffect(() => {
    if (!lookupWanted) return;
    let alive = true;
    lookupLeadCompanyDetails(opportunity.id)
      .then(({ details }) => {
        if (!alive) return;
        setCompany((current) => ({
          website: current.website || details.website, address: details.address && (!current.address || current.address === opportunity.location) ? details.address : current.address,
          phone: current.phone || details.phone, industry: current.industry || details.industry,
        }));
        setCityName(details.city);
        setFoundIn(details.sources);
        setLookup(details.sources.length ? "done" : "none");
      })
      .catch(() => { if (alive) setLookup("failed"); });
    return () => { alive = false; };
  }, [lookupWanted, opportunity.id, opportunity.location]);
  const website = company.website.trim();
  const move = async (allowSimilar: boolean) => {
    if (!stageId) { setError("Choose the pipeline stage."); return; }
    if (!prefill.leadTypeId) { setError("The lead has no Lead source: edit the lead and choose one."); return; }
    setBusy(true);
    setError("");
    setSimilar(null);
    try {
      const { lead } = await createLead({
        clientName: prefill.clientName ?? opportunity.companyName, companyUrl: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
        address: company.address.trim(), comments: prefill.comments ?? "", clientExecutive: prefill.clientExecutive ?? "", contactPhone: company.phone.trim(),
        contactAltPhone: prefill.contactAltPhone ?? "", contactRemark: prefill.contactRemark ?? "", clientEmails: prefill.clientEmails ?? [], industry: company.industry.trim(),
        positions: prefill.positions ?? "", leadTypeId: prefill.leadTypeId, statusId: Number(statusId), statusReasonId: null, leadCategoryId: null, companySizeId: null,
        cityId: prefill.cityId ?? values.city.find((item) => item.active && cityName && item.value.toLowerCase() === cityName.toLowerCase())?.id ?? null, firstContactDate: prefill.firstContactDate || reference.today, followUpDate: prefill.followUpDate ?? null,
        contractSignedDate: prefill.contractSignedDate ?? null, stageId: Number(stageId),
        ownerId: can("reassign_leads") ? Number(ownerId) : null, opportunityId: opportunity.id,
        organizationId: opportunity.organizationId ?? null, personId: opportunity.contacts[0]?.id ?? null,
        allowSimilar, createOrganization: true, createContact: true,
      });
      onDone({ clientName: lead.clientName, ownerName: lead.ownerName, statusLabel: lead.statusLabel, stage: stages.find((item) => item.id === Number(stageId))?.value ?? "" });
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 409 && apiError.data.duplicate) setSimilar({ message: apiError.message, canOverride: apiError.data.canOverride === true });
      else setError(errorMessage(caught, "Could not convert the lead to a deal."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Convert ${opportunity.companyName} to a Deal`} eyebrow={opportunity.addedByName || opportunity.tracker ? "LEADS INBOX" : "LEAD GENERATION"} size="narrow" onClose={onClose}>
      <form className="lead-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void move(false); }}>
        <p className="dialog-description field-wide">The lead becomes a deal with its company, contacts, Lead source, notes and advertised roles. Choose where it starts in the pipeline.</p>
        <Field label="Pipeline Stage" required wide>
          <select value={stageId} onChange={(event) => setStageId(event.target.value)} required autoFocus>
            <option value="">Choose a stage...</option>
            {stages.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <Field label="Status" required wide>
          <select value={statusId} onChange={(event) => setStatusId(event.target.value)} required>
            {statuses.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        {lookupWanted && (
          <fieldset className="convert-company field-wide">
            <legend>Company Details</legend>
            <p className="field-hint">{lookup === "busy" ? "Looking up the company on Google Maps and its website..." : lookup === "done" ? `Found on ${foundIn.join(" and ")}: check them. The new company and contact take them.` : lookup === "failed" ? "The company could not be looked up: fill in what you know." : "Nothing found: fill in what you know. The new company and contact take these details."}</p>
            <div className="convert-company-grid">
              <label><span className="field-label">Website</span><input type="url" value={company.website} onChange={(event) => setCompany({ ...company, website: event.target.value })} placeholder="https://company.com" /></label>
              <label><span className="field-label">Phone</span><input value={company.phone} onChange={(event) => setCompany({ ...company, phone: event.target.value })} maxLength={40} placeholder="Company phone" /></label>
              <label className="convert-company-wide"><span className="field-label">Address</span><input value={company.address} onChange={(event) => setCompany({ ...company, address: event.target.value })} maxLength={500} placeholder="Street, town" /></label>
              <label className="convert-company-wide"><span className="field-label">Industry</span><input value={company.industry} onChange={(event) => setCompany({ ...company, industry: event.target.value })} maxLength={120} placeholder="e.g. Food Manufacturing" /></label>
            </div>
          </fieldset>
        )}
        {can("reassign_leads") && (
          <Field label="Owner" wide hint="The deal is created in their name.">
            <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </Field>
        )}
        {similar && <div className="field-wide"><ErrorText message={similar.message} /></div>}
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          {similar?.canOverride && <button type="button" className="button button-outline" disabled={busy} onClick={() => void move(true)}>Convert Anyway</button>}
          <button type="submit" className="button button-primary" disabled={busy}><ArrowRightCircle size={14} /> {busy ? "Converting..." : "Convert to Deal"}</button>
        </div>
      </form>
    </Dialog>
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
      setError(errorMessage(caught, "The deal could not be reopened."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Reopen ${history.clientName}`} eyebrow="LEADS INBOX" onClose={onClose} size="narrow">
      <form className="lead-form" onSubmit={submit}>
        <p className="field-hint">This company was a deal before: {history.statusLabel}{history.recordState === "archived" ? " (archived)" : ""}, owned by {history.ownerName}. Reopening keeps its notes and history; the status goes back to Cold and the new job listings are added to its timeline.</p>
        <Field label="Owner" required wide><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><RotateCcw size={14} /> {busy ? "Reopening..." : "Reopen Deal"}</button>
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
    <Dialog title={`Not Relevant: ${opportunity.companyName}`} eyebrow="LEADS INBOX" onClose={onClose} size="narrow">
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
          <button type="submit" className="button button-primary" disabled={busy}><X size={14} /> {busy ? "Saving..." : "Mark Not Relevant"}</button>
        </div>
      </form>
    </Dialog>
  );
}

const emptySearch: OpportunitySearchInput = { name: "", titles: [], location: "", postedWithinDays: 30, jobType: "", maxListings: null, active: true };

/** Administrators: the shared keyword searches and the recent runs. */
function SearchesPanel() {
  const { notify, dataVersion } = useApp();
  const fetcher = useCallback(async () => { const [searches, runs] = await Promise.all([fetchSearches(), fetchRuns()]); return { searches: searches.searches, defaults: searches.defaults, runs: runs.runs }; }, []);
  const { data, error, reload } = useAsyncData(fetcher, dataVersion);
  const [editing, setEditing] = useState<{ id: number | null; input: OpportunitySearchInput } | null>(null);
  const remove = async (search: OpportunitySearch) => {
    if (!window.confirm(`Remove the search "${search.name}"? Companies already in the inbox stay.`)) return;
    try { await deleteSearch(search.id); notify(`Search "${search.name}" removed`); reload(); } catch (caught) { notify(errorMessage(caught), "error"); }
  };
  return (
    <>
      <div className="panel opp-panel">
        <div className="opp-toolbar">
          <div><strong>Searches</strong><small className="field-hint"> · each one is sent to every enabled job source on the schedule under Settings → Lead searches</small></div>
          <button type="button" className="button button-outline button-small" onClick={() => setEditing({ id: null, input: { ...emptySearch, titles: data?.defaults.titles ?? [], location: data?.defaults.location ?? "", postedWithinDays: data?.defaults.postedWithinDays ?? 30 } })}><Plus size={13} /> Add Search</button>
        </div>
        {error && <ErrorText message={error} />}
        {!data ? <Loading /> : data.searches.length === 0 ? <EmptyState title="No searches yet" text="Add a group of job titles and one location, for example “baker” and “pastry chef” in “Mississauga, ON”." /> : (
          <table className="opp-table">
            <thead><tr><th>Name</th><th>Job titles</th><th>Location</th><th>Posted within</th><th>Job type</th><th>Cap</th><th>Last run</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {data.searches.map((search) => (
                <tr key={search.id} className={search.active ? "" : "opp-inactive"}>
                  <td><strong>{search.name}</strong>{!search.active && <small className="muted-cell">Paused</small>}</td>
                  <td>{search.titles.join(", ")}</td>
                  <td>{search.location || "—"}</td>
                  <td>{search.postedWithinDays} days</td>
                  <td>{jobTypeOptions.find((option) => option.code === search.jobType)?.label ?? "Any"}</td>
                  <td>{search.maxListings ?? "default"}</td>
                  <td>{search.lastRunAt ? <>{relativeTime(search.lastRunAt)}<small className="muted-cell">{search.lastFound} found · {search.lastNew} new</small></> : "never"}</td>
                  <td>
                    <div className="opp-actions">
                      <button type="button" className="button button-outline button-small" onClick={() => setEditing({ id: search.id, input: { name: search.name, titles: search.titles, location: search.location, postedWithinDays: search.postedWithinDays, jobType: search.jobType, maxListings: search.maxListings, active: search.active } })}><Pencil size={12} /> Edit</button>
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
            <thead><tr><th>Started</th><th>How</th><th>Result</th><th>Listings</th><th>New companies</th><th>Attached to deals</th><th>Details</th></tr></thead>
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
          title={editing.id === null ? "Add a Search" : "Edit the Search"}
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
  const [form, setForm] = useState({ ...initial, titles: initial.titles.join("\n"), postedWithinDays: String(initial.postedWithinDays), maxListings: initial.maxListings === null ? "" : String(initial.maxListings) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ name: form.name, titles: form.titles.split("\n").map((title) => title.trim()).filter(Boolean), location: form.location, postedWithinDays: Number(form.postedWithinDays) || 30, jobType: form.jobType, maxListings: form.maxListings === "" ? null : Number(form.maxListings), active: form.active });
    } catch (caught) {
      setError(errorMessage(caught, "The search could not be saved."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} eyebrow="LEAD SEARCHES" onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Name" required wide><input value={form.name} onChange={set("name")} required maxLength={120} placeholder="e.g. Bakery staff in Peel" autoFocus /></Field>
        <Field label="Job Titles" required wide hint={`One per line, up to ${maxSearchTitles}. Indeed receives them as one query, so one search covers the whole group.`}><textarea value={form.titles} onChange={set("titles")} required rows={4} placeholder={"e.g. baker\npastry chef"} /></Field>
        <Field label="Location" hint="One city, region, or province; leave empty for the whole country."><input value={form.location} onChange={set("location")} maxLength={160} placeholder="e.g. Mississauga, ON" /></Field>
        <Field label="Posted Within (Days)" hint={`${minPostedWithinDays} to ${maxPostedWithinDays}; Indeed via HasData looks back at most 14 days.`}><input type="number" min={minPostedWithinDays} max={maxPostedWithinDays} value={form.postedWithinDays} onChange={set("postedWithinDays")} required /></Field>
        <Field label="Job Type"><select value={form.jobType} onChange={set("jobType")}>{jobTypeOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></Field>
        <Field label="Listings per Source" hint={`${minMaxListings} to ${maxMaxListings}; empty uses the default from Settings.`}><input type="number" min={minMaxListings} max={maxMaxListings} value={form.maxListings} onChange={set("maxListings")} placeholder="default" /></Field>
        <label className="checklist-item"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active (runs on the schedule and with Run now)</label>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Save Search"}</button>
        </div>
      </form>
    </Dialog>
  );
}
