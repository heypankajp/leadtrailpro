"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, CalendarDays, MapPin, Pencil, Phone, Plus, Trash2, UserRound, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, EmptyState, ErrorText, Loading, StatusPill } from "@/features/shell/components";
import { fetchVisitTrip, removeVisitTripDeal, type VisitTripDetail } from "./client";
import { AddDealsDialog, DeleteTripDialog, TripFormDialog } from "./TripDialogs";

/** One sales trip: its date and salesperson, and the deals to visit in order, each opening its deal page. */
export default function SalesTripPage({ tripId }: { tripId: number }) {
  const { can, navigate, openLead, notify, dataVersion, bumpData } = useApp();
  const fetcher = useCallback(() => fetchVisitTrip(tripId), [tripId]);
  const { data, error, loading } = useAsyncData<VisitTripDetail>(fetcher, dataVersion);
  const [dialog, setDialog] = useState<"edit" | "add" | "delete" | null>(null);

  if (loading && !data) return <Loading text="Loading the sales trip..." />;
  if (!data) return <><button className="button button-outline button-small" onClick={() => navigate("sales-trips")}><ArrowLeft size={14} /> Sales Trips</button><ErrorText message={error || "Sales trip not found."} /></>;
  const { trip, deals } = data;
  const canEdit = data.permissions.edit && can("plan_trips");

  const remove = async (leadId: number, name: string) => {
    try {
      await removeVisitTripDeal(trip.id, leadId);
      bumpData();
      notify(`${name} taken off ${trip.title}, back on the To Do list it came from`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  return (
    <>
      <div className="page-heading trip-heading">
        <div>
          <button className="link-button trip-back" onClick={() => navigate("sales-trips")}><ArrowLeft size={14} /> Sales Trips</button>
          <div className="eyebrow">SALES TRIP <span className="eyebrow-dot">·</span> {deals.length} {deals.length === 1 ? "DEAL" : "DEALS"}</div>
          <h1>{trip.title}</h1>
          <p className="trip-meta"><span><CalendarDays size={14} /> {formatDate(trip.tripDate)}</span><span><UserRound size={14} /> {trip.ownerName}</span></p>
        </div>
        {canEdit && (
          <div className="trip-actions">
            <button className="button button-primary" onClick={() => setDialog("add")}><Plus size={16} /> Add deals</button>
            <button className="button button-outline" onClick={() => setDialog("edit")}><Pencil size={15} /> Edit</button>
            <button className="button button-outline" onClick={() => setDialog("delete")}><Trash2 size={15} /> Delete</button>
          </div>
        )}
      </div>

      <section className="panel leads-panel">
        <div className="lead-list-wrap">
          {deals.length === 0 ? (
            <EmptyState icon={<MapPin size={22} />} title="No deals on this trip yet" text={canEdit ? "Add deals from the To be visited list." : "Deals added to the trip appear here."} />
          ) : (
            <div className="table-scroll">
              <table className="lead-table trip-table">
                <thead><tr><th>#</th><th>COMPANY</th><th>CONTACT</th><th>ADDRESS</th><th>STATUS</th><th>STAGE</th><th>OWNER</th>{canEdit && <th><span className="sr-only">Remove</span></th>}</tr></thead>
                <tbody>
                  {deals.map((deal, index) => (
                    <tr key={deal.id}>
                      <td><span className="trip-stop">{index + 1}</span></td>
                      <td>
                        <button className="client-cell" onClick={() => openLead(deal.id)}>
                          <Avatar name={deal.clientName} seed={deal.id} />
                          <span><strong>{deal.clientName}</strong><small>{deal.industry || "—"}</small></span>
                        </button>
                      </td>
                      <td><span className="trip-contact">{deal.clientExecutive || "No contact yet"}{deal.contactPhone && <small><Phone size={11} /> {deal.contactPhone}</small>}</span></td>
                      <td><span className="muted-cell">{[deal.address, deal.city].filter(Boolean).join(", ") || "—"}</span></td>
                      <td><StatusPill status={deal.statusLabel} code={deal.statusCode} /></td>
                      <td><span className="muted-cell stage-cell">{deal.statusCode === "client" ? "—" : deal.stage ?? "—"}</span></td>
                      <td><span className="muted-cell">{deal.ownerName}</span></td>
                      {canEdit && <td><button className="icon-button" aria-label={`Take ${deal.clientName} off the trip`} title="Take off the trip (back to its To Do list)" onClick={() => void remove(deal.id, deal.clientName)}><X size={14} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {dialog === "edit" && <TripFormDialog trip={trip} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); bumpData(); notify("Sales trip updated"); }} />}
      {dialog === "add" && <AddDealsDialog trip={trip} onTrip={deals.map((deal) => deal.id)} onClose={() => setDialog(null)} onDone={(message) => { setDialog(null); bumpData(); notify(message); }} />}
      {dialog === "delete" && <DeleteTripDialog trip={trip} onClose={() => setDialog(null)} onDeleted={(message) => { setDialog(null); bumpData(); notify(message); navigate("sales-trips"); }} />}
    </>
  );
}
