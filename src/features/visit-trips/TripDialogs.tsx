"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { MapPinned, Search } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { fetchLeads } from "@/features/leads/client";
import type { LeadSummary } from "@/features/leads/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading } from "@/features/shell/components";
import { addVisitTripDeals, createVisitTrip, deleteVisitTrip, fetchVisitTrips, updateVisitTrip } from "./client";
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
    <Dialog title={trip ? `Edit ${trip.title}` : "New sales trip"} eyebrow="SALES TRIP" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        {!trip && leadIds.length > 0 && <p className="dialog-description">The trip starts with the {leadIds.length === 1 ? "deal" : `${leadIds.length} deals`} you selected, which {leadIds.length === 1 ? "leaves" : "leave"} the To be visited list. You can add more from the trip&apos;s page.</p>}
        <Field label="Title" required><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Brampton & Mississauga visits" required autoFocus /></Field>
        <Field label="Date" required><input type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} required /></Field>
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
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : trip ? "Save changes" : "Plan sales trip"}</button>
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
    <Dialog title={`Add ${count} to a sales trip`} eyebrow="SALES TRIP" onClose={onClose} size="narrow">
      {!data && !loadError ? <Loading text="Loading the planned trips..." /> : (
        <form className="stack-form" onSubmit={submit}>
          <ErrorText message={loadError} />
          <Field label="Sales trip" required hint="Trips planned from today on. The deals leave the To be visited list.">
            <select value={tripId} onChange={(event) => setTripId(event.target.value)} required autoFocus>
              <option value="">Choose a trip</option>
              {upcoming.map((trip) => <option key={trip.id} value={trip.id}>{formatDate(trip.tripDate)} · {trip.title} · {trip.ownerName} ({trip.dealCount})</option>)}
            </select>
          </Field>
          <button type="button" className="link-button trip-new-link" onClick={() => setMode("new")}><MapPinned size={14} /> Plan a new sales trip instead</button>
          <ErrorText message={error} />
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Adding..." : "Add to trip"}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** From a trip's page: pick deals on the "To be visited" list (any To Do list when it does not exist) to add to the trip. */
export function AddDealsDialog({ trip, onTrip, onClose, onDone }: { trip: VisitTrip; onTrip: number[]; onClose: () => void; onDone: (message: string) => void }) {
  const { reference } = useApp();
  const toBeVisited = reference.listValues.todo_list.find((item) => item.code === "to_be_visited") ?? null;
  const fetcher = useCallback(
    () => fetchLeads({ state: "active", pageSize: 200, sort: "client_name", direction: "asc", ...(toBeVisited ? { todoListId: toBeVisited.id } : { todo: true }) }),
    [toBeVisited],
  );
  const { data, error: loadError } = useAsyncData(fetcher);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.leads ?? [])
      .filter((lead) => !onTrip.includes(lead.id))
      .filter((lead) => !term || [lead.clientName, lead.city ?? "", lead.ownerName, lead.address].some((text) => text.toLowerCase().includes(term)));
  }, [data, onTrip, q]);
  const toggle = (lead: LeadSummary) => setPicked((current) => (current.includes(lead.id) ? current.filter((item) => item !== lead.id) : [...current, lead.id]));
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await addVisitTripDeals(trip.id, picked);
      onDone(`${result.added === 1 ? "1 deal" : `${result.added} deals`} added to ${trip.title}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not add the deals."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Add deals to ${trip.title}`} eyebrow={toBeVisited ? toBeVisited.value.toUpperCase() : "TO DO"} onClose={onClose}>
      <div className="stack-form">
        <p className="dialog-description">The deals on the {toBeVisited ? `“${toBeVisited.value}”` : "To Do"} list that are not on this trip yet.</p>
        <div className="search-field"><Search size={15} /><input aria-label="Search the deals" placeholder="Search company, city, owner..." value={q} onChange={(event) => setQ(event.target.value)} autoFocus /></div>
        <ErrorText message={loadError} />
        {!data && !loadError ? <Loading text="Loading the deals..." /> : (
          <ul className="trip-pick-list">
            {choices.map((lead) => (
              <li key={lead.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(lead.id)} onChange={() => toggle(lead)} />
                  <span><strong>{lead.clientName}</strong><small>{[lead.city, lead.address, lead.ownerName].filter(Boolean).join(" · ")}</small></span>
                </label>
              </li>
            ))}
            {!choices.length && <li className="trip-pick-empty">{q ? "No deal matches the search." : "Every deal on the list is already on this trip, or the list is empty."}</li>}
          </ul>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-primary" disabled={busy || !picked.length} onClick={() => void submit()}>{busy ? "Adding..." : `Add ${picked.length || ""} ${picked.length === 1 ? "deal" : "deals"}`.replace("  ", " ")}</button>
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
            <Field label="Archival reason" required>
              <select value={reasonId} onChange={(event) => setReasonId(event.target.value)} required>
                <option value="">Choose a reason</option>
                {reasons.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
              </select>
            </Field>
            <Field label="Archival notes (optional)">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={500} placeholder="Shown with each archived deal" />
            </Field>
          </>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-danger" disabled={busy}>{busy ? "Deleting..." : count && deals === "archive" ? "Delete trip and archive" : "Delete trip"}</button>
        </div>
      </form>
    </Dialog>
  );
}
