"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MapPinned, Search } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { fetchLeads } from "@/features/leads/client";
import type { LeadSummary } from "@/features/leads/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading, StatusPill } from "@/features/shell/components";
import { addVisitTripDeals, addVisitTripLeads, createVisitTrip, deleteVisitTrip, fetchVisitTrips, updateVisitTrip } from "./client";
import { fetchOpportunities } from "@/features/opportunities/client";
import { companiesSummary, type TripDealAction, type VisitTrip } from "./model";

/** The salespeople a trip can be given to (managers plan trips for others). */
function useTripOwners() {
  const { reference } = useApp();
  return reference.users.filter((item) => item.role !== "recruiter");
}

/** Plan a new sales trip (title, date and, for managers, who goes), or edit one. `leadIds` are the deals it starts with. */
export function TripFormDialog({ trip, leadIds = [], onClose, onSaved }: {
  trip?: VisitTrip; leadIds?: number[]; onClose: () => void; onSaved: (trip: VisitTrip) => void;
}) {
  const { user, can, reference } = useApp();
  const owners = useTripOwners();
  const [title, setTitle] = useState(trip?.title ?? "");
  const [tripDate, setTripDate] = useState(trip?.tripDate ?? reference.today);
  const [ownerId, setOwnerId] = useState(String(trip?.ownerId ?? user.id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) { setError("Give the sales trip a title."); return; }
    if (!tripDate) { setError("Choose the date of the sales trip."); return; }
    setBusy(true);
    setError("");
    try {
      const owner = can("reassign_leads") ? Number(ownerId) : undefined;
      const result = trip
        ? await updateVisitTrip(trip.id, { title: title.trim(), tripDate, ...(owner ? { ownerId: owner } : {}) })
        : await createVisitTrip({ title: title.trim(), tripDate, ownerId: owner ?? null, leadIds });
      onSaved(result.trip);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the sales trip."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={trip ? `Edit ${trip.title}` : "New Sales Trip"} eyebrow="SALES TRIP" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        {!trip && leadIds.length > 0 && <p className="dialog-description">The trip starts with the {leadIds.length === 1 ? "deal" : `${leadIds.length} deals`} you selected, which {leadIds.length === 1 ? "leaves" : "leave"} the To be visited list. You can add more from the trip&apos;s page.</p>}
        <Field label="Title" required><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Brampton & Mississauga visits" required autoFocus /></Field>
        <Field label="Trip Date" required><input type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} required /></Field>
        {can("reassign_leads") && (
          <Field label="Salesperson" hint="Who goes on the trip.">
            <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              {owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : trip ? "Save Changes" : "Plan Sales Trip"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * "Add to sales trip" for the deals selected on the To Do list: a new trip (title and date), or one already planned
 * from today on.
 */
export function AddToTripDialog({ leadIds, onClose, onDone }: { leadIds: number[]; onClose: () => void; onDone: (message: string, trip: VisitTrip) => void }) {
  const { user, can, reference } = useApp();
  const fetcher = useCallback(() => fetchVisitTrips({ from: reference.today, pageSize: 100, ...(can("reassign_leads") ? {} : { ownerId: user.id }) }), [reference.today, can, user.id]);
  const { data, error: loadError } = useAsyncData(fetcher);
  const upcoming = (data?.trips ?? []).filter((trip) => trip.kind === "visit");
  const [mode, setMode] = useState<"new" | "existing" | null>(null);
  const chosenMode = mode ?? (data && upcoming.length ? "existing" : "new");
  const [tripId, setTripId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const count = leadIds.length === 1 ? "1 deal" : `${leadIds.length} deals`;

  if (chosenMode === "new" && (mode === "new" || (data && !upcoming.length))) {
    return (
      <TripFormDialog
        leadIds={leadIds} onClose={onClose}
        onSaved={(trip) => onDone(`${count} added to the new sales trip ${trip.title}`, trip)}
      />
    );
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tripId) { setError("Choose the sales trip."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await addVisitTripDeals(Number(tripId), leadIds);
      const skipped = leadIds.length - result.added;
      onDone(`${result.added === 1 ? "1 deal" : `${result.added} deals`} added to ${result.trip.title}${skipped ? ` (${skipped} already on it)` : ""}`, result.trip);
    } catch (caught) {
      setError(errorMessage(caught, "Could not add the deals."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Add ${count} to a Sales Trip`} eyebrow="SALES TRIP" onClose={onClose} size="narrow">
      {!data && !loadError ? <Loading text="Loading the planned trips..." /> : (
        <form className="stack-form" onSubmit={submit}>
          <ErrorText message={loadError} />
          <Field label="Sales Trip" required hint="Trips planned from today on. The deals leave the To be visited list.">
            <select value={tripId} onChange={(event) => setTripId(event.target.value)} required autoFocus>
              <option value="">Choose a trip</option>
              {upcoming.map((trip) => <option key={trip.id} value={trip.id}>{formatDate(trip.tripDate)} · {trip.title} · {trip.ownerName} ({trip.dealCount})</option>)}
            </select>
          </Field>
          <button type="button" className="link-button trip-new-link" onClick={() => setMode("new")}><MapPinned size={14} /> Plan a new sales trip instead</button>
          <ErrorText message={error} />
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Adding..." : "Add to Trip"}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/**
 * From a trip's page: pick deals and leads to add to the trip (requests of November 20, 2026). Three lists: **To Be Visited**
 * (the default: the deals on the "To be visited" list, any To Do list when it does not exist), **Other Deals** (the active deals
 * not marked To be visited) and **Leads** (the Leads inbox of Leads and Lead Generation), the last two searched on the server as
 * you type. Ticks are kept when switching between them.
 */
export function AddDealsDialog({ trip, onTrip, onTripLeads = [], onClose, onDone }: { trip: VisitTrip; onTrip: number[]; onTripLeads?: number[]; onClose: () => void; onDone: (message: string) => void }) {
  const { reference } = useApp();
  const toBeVisited = reference.listValues.todo_list.find((item) => item.code === "to_be_visited") ?? null;
  // Deals or Leads first (request of November 20, 2026), then To Be Visited or the others of that kind.
  const [kind, setKind] = useState<"deals" | "leads">("deals");
  const [list, setList] = useState<"visit" | "other">("visit");
  const scope: "visit" | "all" | "leads" = kind === "leads" ? "leads" : list === "visit" ? "visit" : "all";
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setTerm(q.trim()), 300); return () => window.clearTimeout(timer); }, [q]);
  const dealFetcher = useCallback(
    () => scope === "leads" ? Promise.resolve(null)
      : scope === "visit"
        ? fetchLeads({ state: "active", pageSize: 200, sort: "client_name", direction: "asc", ...(toBeVisited ? { todoListId: toBeVisited.id } : { todo: true }) })
        : fetchLeads({ state: "active", pageSize: 50, sort: "client_name", direction: "asc", ...(term ? { q: term } : {}) }),
    [scope, term, toBeVisited],
  );
  const leadFetcher = useCallback(
    () => scope !== "leads" ? Promise.resolve(null)
      : list === "visit" && toBeVisited ? fetchOpportunities({ status: "new", pageSize: 200, todoListId: toBeVisited.id })
        : fetchOpportunities({ status: "new", pageSize: 50, ...(term ? { search: term } : {}) }),
    [scope, list, term, toBeVisited],
  );
  const { data, error: loadError } = useAsyncData(dealFetcher);
  const { data: leadData, error: leadError } = useAsyncData(leadFetcher);
  const [picked, setPicked] = useState<number[]>([]);
  const [pickedLeads, setPickedLeads] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.leads ?? [])
      .filter((lead) => !onTrip.includes(lead.id))
      // Other Deals leave out the deals marked To be visited: those are on the first list.
      .filter((lead) => scope === "visit" || !(toBeVisited ? lead.todoListId === toBeVisited.id : lead.todoListId !== null))
      .filter((lead) => scope !== "visit" || !words || [lead.clientName, lead.city ?? "", lead.ownerName, lead.address].some((text) => text.toLowerCase().includes(words)));
  }, [data, onTrip, q, scope, toBeVisited]);
  const leadChoices = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (leadData?.opportunities ?? [])
      .filter((lead) => !onTripLeads.includes(lead.id))
      // Other Leads leave out the leads marked To be visited: those are on the first list.
      .filter((lead) => list === "visit" || !toBeVisited || lead.todoListId !== toBeVisited.id)
      .filter((lead) => list !== "visit" || !words || [lead.companyName, lead.location, lead.latestTitle].some((text) => text.toLowerCase().includes(words)));
  }, [leadData, onTripLeads, list, q, toBeVisited]);
  const toggle = (lead: LeadSummary) => setPicked((current) => (current.includes(lead.id) ? current.filter((item) => item !== lead.id) : [...current, lead.id]));
  const toggleLead = (id: number) => setPickedLeads((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const total = picked.length + pickedLeads.length;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const deals = picked.length ? (await addVisitTripDeals(trip.id, picked)).added : 0;
      const leads = pickedLeads.length ? (await addVisitTripLeads(trip.id, pickedLeads)).added : 0;
      const parts = [deals ? `${deals} ${deals === 1 ? "deal" : "deals"}` : "", leads ? `${leads} ${leads === 1 ? "lead" : "leads"}` : ""].filter(Boolean);
      onDone(`${parts.join(" and ") || "Nothing"} added to ${trip.title}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not add them to the trip."));
      setBusy(false);
    }
  };
  const listName = toBeVisited ? toBeVisited.value : "To Do";
  const empty = scope === "visit"
    ? (q ? "No deal on the list matches the search." : `Every deal marked ${listName} is already on this trip, or none is marked.`)
    : scope === "all"
      ? (term ? "No other deal matches the search." : `No other deal: every active deal is marked ${listName} or already on this trip.`)
      : list === "visit"
        ? (q ? "No lead on the list matches the search." : `Every lead marked ${listName} is already on this trip, or none is marked.`)
        : (term ? "No other lead matches the search." : "No other lead in the Leads inbox, or every one is already on this trip.");
  const loading = scope === "leads" ? !leadData && !leadError : !data && !loadError;
  return (
    <Dialog title={`Add Deals and Leads to ${trip.title}`} eyebrow="SALES TRIP" onClose={onClose}>
      <div className="trip-add">
        <div className="trip-add-bar">
          <div className="trip-add-kind" role="radiogroup" aria-label="Deals or leads">
            {(["deals", "leads"] as const).map((value) => (
              <label key={value} className={kind === value ? "is-active" : ""}>
                <input type="radio" name="trip-add-kind" value={value} checked={kind === value} onChange={() => { setKind(value); setList("visit"); }} />
                {value === "deals" ? "Deals" : "Leads"}
              </label>
            ))}
          </div>
          {total > 0 && <span className="trip-add-count">{total} selected</span>}
        </div>
        <div className="scope-toggle" role="group" aria-label={kind === "deals" ? "Which deals" : "Which leads"}>
          <button type="button" className={list === "visit" ? "is-active" : ""} aria-pressed={list === "visit"} onClick={() => setList("visit")}>{toBeVisited ? "To Be Visited" : listName}</button>
          <button type="button" className={list === "other" ? "is-active" : ""} aria-pressed={list === "other"} onClick={() => setList("other")}>{kind === "deals" ? "Other Deals" : "Other Leads"}</button>
        </div>
        <label className="trip-add-search">
          <Search size={15} />
          <input aria-label="Search the deals" placeholder={scope === "visit" ? "Search company, city, owner..." : scope === "all" ? "Search the other deals: company, contact, city..." : list === "visit" ? "Search company, role, location..." : "Search the other leads: company, role, location..."} value={q} onChange={(event) => setQ(event.target.value)} autoFocus />
        </label>
        <p className="field-hint">{scope === "visit" ? `The deals marked ${listName} that are not on this trip yet.` : scope === "all" ? `The active deals not marked ${listName} and not on this trip yet; the first 50 by name, or the ones matching the search.` : list === "visit" ? `The leads marked ${listName} that are not on this trip yet.` : `The leads in the inbox of Leads and Lead Generation not marked ${listName} and not on this trip yet; the first 50, or the ones matching the search.`}</p>
        <ErrorText message={scope === "leads" ? leadError : loadError} />
        {loading ? <Loading text={scope === "leads" ? "Loading the leads..." : "Loading the deals..."} /> : scope === "leads" ? (
          <ul className="trip-pick-list">
            {leadChoices.map((lead) => (
              <li key={lead.id}>
                <label className={pickedLeads.includes(lead.id) ? "is-picked" : ""}>
                  <input type="checkbox" checked={pickedLeads.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
                  <span className="trip-pick-text"><strong>{lead.companyName}</strong><small>{[lead.location, lead.latestTitle, lead.addedByName ? `Added by ${lead.addedByName}` : ""].filter(Boolean).join(" · ")}</small></span>
                  <span className="trip-pick-tags"><span className="trip-stage-lead">Lead</span></span>
                </label>
              </li>
            ))}
            {!leadChoices.length && <li className="trip-pick-empty">{empty}</li>}
          </ul>
        ) : (
          <ul className="trip-pick-list">
            {choices.map((lead) => (
              <li key={lead.id}>
                <label className={picked.includes(lead.id) ? "is-picked" : ""}>
                  <input type="checkbox" checked={picked.includes(lead.id)} onChange={() => toggle(lead)} />
                  <span className="trip-pick-text"><strong>{lead.clientName}</strong><small>{[lead.city, lead.address, lead.ownerName].filter(Boolean).join(" · ")}</small></span>
                  <span className="trip-pick-tags">
                    <StatusPill status={lead.statusLabel} code={lead.statusCode} />
                  </span>
                </label>
              </li>
            ))}
            {!choices.length && <li className="trip-pick-empty">{empty}</li>}
          </ul>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-primary" disabled={busy || !total} onClick={() => void submit()}>{busy ? "Adding..." : total ? `Add ${total} to the Trip` : "Add to the Trip"}</button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Deleting a trip asks what happens to its deals (review of November 18, 2026): back on the To Do list each came from
 * (they stay in the Pipeline), in the Pipeline only, or archived with an Archival reason and notes.
 */
export function DeleteTripDialog({ trip, onClose, onDeleted }: { trip: VisitTrip; onClose: () => void; onDeleted: (message: string) => void }) {
  const { can, reference } = useApp();
  const reasons = reference.listValues.archival_reason.filter((item) => item.active);
  const count = trip.dealCount;
  const [deals, setDeals] = useState<TripDealAction>("todo");
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const them = count === 1 ? "it" : "them";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action: TripDealAction = count ? deals : "pipeline";
    if (action === "archive" && !reasonId) { setError("Choose the archival reason."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await deleteVisitTrip(trip.id, { deals: action, archiveReasonId: reasonId ? Number(reasonId) : null, notes: notes.trim() });
      const what = action === "archive" ? `${result.changed === 1 ? "1 deal" : `${result.changed} deals`} archived`
        : action === "todo" ? `${result.changed === 1 ? "1 deal" : `${result.changed} deals`} back on To Do`
        : count ? "its deals stay in the Pipeline" : "";
      onDeleted(`Sales trip ${trip.title} deleted${what ? ` · ${what}` : ""}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not delete the sales trip."));
      setBusy(false);
    }
  };
  const option = (value: TripDealAction, title: string, text: string) => (
    <label className={`trip-delete-option ${deals === value ? "is-active" : ""}`}>
      <input type="radio" name="trip-deals" value={value} checked={deals === value} onChange={() => { setDeals(value); setError(""); }} />
      <span><strong>{title}</strong><small>{text}</small></span>
    </label>
  );
  return (
    <Dialog title={`Delete ${trip.title}?`} eyebrow="SALES TRIP" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">
          {formatDate(trip.tripDate)} · {trip.ownerName}. {count ? <>The trip has {count === 1 ? "1 deal" : `${count} deals`}: {companiesSummary(trip.companies)}. What should happen to {them}?</> : "The trip has no deals."}
        </p>
        {count > 0 && (
          <fieldset className="trip-delete-options">
            <legend className="sr-only">What happens to the deals</legend>
            {option("todo", "Move back to To Do", `Each deal goes back on the To Do list it came from (usually To be visited). ${count === 1 ? "It stays" : "They stay"} in the Pipeline.`)}
            {option("pipeline", "Keep in the Pipeline only", `${count === 1 ? "The deal stays" : "The deals stay"} on the board, on no To Do list.`)}
            {can("archive_leads") && option("archive", "Archive the deals", `${count === 1 ? "The deal leaves" : "The deals leave"} the board. ${count === 1 ? "It" : "They"} can be restored from the archive.`)}
          </fieldset>
        )}
        {count > 0 && deals === "archive" && (
          <>
            <Field label="Archival Reason" required>
              <select value={reasonId} onChange={(event) => setReasonId(event.target.value)} required>
                <option value="">Choose a reason</option>
                {reasons.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
              </select>
            </Field>
            <Field label="Archival Notes (Optional)">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={500} placeholder="Shown with each archived deal" />
            </Field>
          </>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-danger" disabled={busy}>{busy ? "Deleting..." : count && deals === "archive" ? "Delete Trip and Archive" : "Delete Trip"}</button>
        </div>
      </form>
    </Dialog>
  );
}
