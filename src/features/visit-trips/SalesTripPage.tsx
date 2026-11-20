"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Building2, CalendarDays, ChevronDown, ExternalLink, FileDown, Mail, MapPin, MoreHorizontal, Printer, Pencil, Phone, Plus, Trash2, UserRound, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, EmptyState, ErrorText, Loading } from "@/features/shell/components";
import { fetchVisitTrip, removeVisitTripDeal, removeVisitTripLead, type VisitTripDetail } from "./client";
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
  // Deals and leads in one visiting order (request of November 20, 2026).
  const stops = tripStops(data);
  // The trip summary (request of November 20, 2026): how many companies are planned and in which cities, most visits first.
  const companies = new Set(stops.map((stop) => stop.name.trim().toLowerCase())).size;
  const cityCounts = [...stops.reduce((map, stop) => { const city = stop.city || "No city"; map.set(city, (map.get(city) ?? 0) + 1); return map; }, new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || (a[0] === "No city" ? 1 : b[0] === "No city" ? -1 : a[0].localeCompare(b[0])));

  const remove = async (stop: TripStop) => {
    try {
      if (stop.kind === "lead") await removeVisitTripLead(trip.id, stop.id);
      else await removeVisitTripDeal(trip.id, stop.id);
      bumpData();
      notify(stop.kind === "lead" ? `${stop.name} taken off ${trip.title}` : `${stop.name} taken off ${trip.title}, back on the To Do list it came from`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  return (
    <div className="sales-trip-page">
      {/* Print and PDF (request of November 20, 2026): a heading that only shows on paper; the screen heading is hidden there. */}
      <header className="sales-trip-print-head">
        <div className="sales-trip-print-brand">LeadTrailPro · Sales trip</div>
        <h1>{trip.title}</h1>
        <p>{formatDate(trip.tripDate)} · {trip.ownerName}{stops.length ? ` · ${companies} ${companies === 1 ? "company" : "companies"} planned` : ""}{cityCounts.length ? ` · ${cityCounts.map(([city, count]) => (count > 1 ? `${city} (${count})` : city)).join(", ")}` : ""}</p>
      </header>
      <div className="page-heading trip-heading">
        <div>
          <button className="link-button trip-back" onClick={() => navigate("sales-trips")}><ArrowLeft size={14} /> Sales Trips</button>
          <div className="eyebrow">SALES TRIP <span className="eyebrow-dot">·</span> {stops.length} {stops.length === 1 ? "STOP" : "STOPS"}</div>
          <h1>{trip.title}</h1>
          <p className="trip-meta"><span><CalendarDays size={14} /> {formatDate(trip.tripDate)}</span><span><UserRound size={14} /> {trip.ownerName}</span></p>
        </div>
        <section className={`trip-summary ${stops.length ? "" : "is-empty"}`} aria-label="Trip summary">
          {stops.length === 0 ? (
            // An empty trip (request of November 20, 2026): a placeholder instead of "0 companies planned".
            <span className="trip-summary-empty">Summary of Sales Trip will be shown here</span>
          ) : (
            <>
              <div className="trip-summary-count">
                <Building2 size={18} />
                <span><strong>{companies}</strong> {companies === 1 ? "company" : "companies"} planned</span>
              </div>
              <div className="trip-summary-cities">
                {cityCounts.map(([city, count]) => <span key={city} className={`trip-city ${city === "No city" ? "is-none" : ""}`}><MapPin size={12} /> {city}{count > 1 && <b>{count}</b>}</span>)}
              </div>
            </>
          )}
        </section>
        <div className="trip-actions">
          {canEdit && <button className="button button-primary" onClick={() => setDialog("add")}><Plus size={16} /> Add Deals</button>}
          {/* Request of November 20, 2026: Print, Download PDF, Edit and Delete in one Actions menu. */}
          <TripActions
            items={[
              { tone: "edit", label: "Print", icon: <Printer size={14} />, run: () => window.print() },
              { tone: "restore", label: "Download PDF", icon: <FileDown size={14} />, run: () => { const link = document.createElement("a"); link.href = `/api/visit-trips/${trip.id}/pdf`; link.download = ""; link.click(); } },
              ...(canEdit ? [
                { tone: "edit" as const, label: "Edit", icon: <Pencil size={14} />, run: () => setDialog("edit") },
                { tone: "dismiss" as const, label: "Delete", icon: <Trash2 size={14} />, run: () => setDialog("delete") },
              ] : []),
            ]}
          />
        </div>
      </div>

      <section className="panel leads-panel">
        <div className="lead-list-wrap">
          {stops.length === 0 ? (
            <EmptyState icon={<MapPin size={22} />} title="No deals on this trip yet" text={canEdit ? "Add deals from the To be visited list." : "Deals added to the trip appear here."} />
          ) : (
            <div className="table-scroll">
              <table className="lead-table trip-table">
                <thead><tr><th>#</th><th>COMPANY</th><th>PERSON</th><th>ADDRESS</th><th>POSITIONS</th><th>STAGE</th><th>OWNER</th><th className="trip-print-col">VISIT NOTES</th>{canEdit && <th className="trip-remove-col"><span className="sr-only">Remove</span></th>}</tr></thead>
                <tbody>
                  {stops.map((stop, index) => (
                    <tr key={stop.key} className={stop.kind === "lead" ? "trip-lead-row" : ""}>
                      <td><span className="trip-stop">{index + 1}</span></td>
                      <td>
                        {stop.kind === "deal" ? (
                          <button className="client-cell" onClick={() => openLead(stop.id)}>
                            <Avatar name={stop.name} seed={stop.id} />
                            <span><strong>{stop.name}</strong><small>{stop.sub || "—"}</small></span>
                          </button>
                        ) : (
                          <span className="client-cell trip-lead-cell">
                            <Avatar name={stop.name} seed={stop.id + 100000} />
                            <span>
                              <strong>{stop.website ? <a className="opp-name-link" href={stop.website} target="_blank" rel="noopener noreferrer" title={`Open ${stop.website}`}>{stop.name}{"\u00a0"}<ExternalLink size={12} aria-hidden="true" /></a> : stop.name}</strong>
                              <small>{stop.sub}</small>
                            </span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="trip-contact">
                          {stop.person?.name || <span className="muted-cell">No contact yet</span>}
                          {stop.person?.phone && <small><Phone size={11} /> {stop.person.phone}</small>}
                          {stop.person && stop.person.emails.length > 0 && <small><Mail size={11} /> {stop.person.emails.map((email) => <a key={email} href={`mailto:${email}`}>{email}</a>)}</small>}
                        </span>
                      </td>
                      <td><span className="muted-cell">{stop.address || "—"}</span></td>
                      <td>{stop.positions.length ? <ul className="trip-positions">{stop.positions.map((position) => <li key={position}>{position}</li>)}</ul> : <span className="muted-cell">—</span>}</td>
                      {/* The stage of a deal, or Lead for a lead (request of November 20, 2026). */}
                      <td>{stop.kind === "lead" ? <span className="trip-stage-lead">{stop.stage}</span> : <span className="muted-cell stage-cell">{stop.stage}</span>}</td>
                      <td><span className="muted-cell">{stop.owner}</span></td>
                      <td className="trip-print-col" />
                      {canEdit && <td className="trip-remove-col"><button className="icon-button" aria-label={`Take ${stop.name} off the trip`} title={stop.kind === "lead" ? "Take off the trip" : "Take off the trip (back to its To Do list)"} onClick={() => void remove(stop)}><X size={14} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {dialog === "edit" && <TripFormDialog trip={trip} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); bumpData(); notify("Sales trip updated"); }} />}
      {dialog === "add" && <AddDealsDialog trip={trip} onTrip={deals.map((deal) => deal.id)} onTripLeads={data.leads.map((lead) => lead.id)} onClose={() => setDialog(null)} onDone={(message) => { setDialog(null); bumpData(); notify(message); }} />}
      {dialog === "delete" && <DeleteTripDialog trip={trip} onClose={() => setDialog(null)} onDeleted={(message) => { setDialog(null); bumpData(); notify(message); navigate("sales-trips"); }} />}
    </div>
  );
}

/** One stop on a trip: a deal or a lead, with what the table, the summary and the print show. */
type TripStop = {
  key: string; kind: "deal" | "lead"; id: number; name: string; sub: string; website: string; person: { name: string; phone: string; emails: string[] } | null;
  address: string; city: string; positions: string[]; stage: string; owner: string;
};

/** The trip's deals and leads in their visiting order. A lead's town is the first part of its location ("Milton, ON"). */
function tripStops(data: VisitTripDetail): TripStop[] {
  const deals = new Map(data.deals.map((deal) => [deal.id, deal]));
  const leads = new Map(data.leads.map((lead) => [lead.id, lead]));
  const stops: TripStop[] = [];
  for (const item of data.order) {
    if (item.kind === "deal") {
      const deal = deals.get(item.id);
      if (!deal) continue;
      stops.push({
        key: `deal-${deal.id}`, kind: "deal", id: deal.id, name: deal.clientName, sub: deal.industry, website: deal.companyUrl,
        person: deal.clientExecutive || deal.contactPhone || deal.clientEmails.length ? { name: deal.clientExecutive, phone: [deal.contactPhone, deal.contactAltPhone].filter(Boolean).join(" · "), emails: deal.clientEmails } : null,
        address: [deal.address, deal.city].filter(Boolean).join(", "), city: deal.city?.trim() || (deal.address.includes(",") ? deal.address.split(",").slice(-2)[0].trim() : ""), positions: positionsOf(deal.positions),
        stage: deal.statusCode === "client" ? "Client" : deal.stage ?? "—", owner: deal.ownerName,
      });
    } else {
      const lead = leads.get(item.id);
      if (!lead) continue;
      stops.push({
        key: `lead-${lead.id}`, kind: "lead", id: lead.id, name: lead.companyName, website: lead.website,
        sub: `Lead${lead.archived ? " · Archived" : lead.status === "not_relevant" ? " · Not Relevant" : ""}`,
        person: lead.person, address: lead.location, city: lead.location.split(",")[0]?.trim() ?? "", positions: lead.positions,
        stage: lead.archived ? "Lead · Archived" : lead.status === "not_relevant" ? "Lead · Not Relevant" : "Lead", owner: lead.addedByName ?? "—",
      });
    }
  }
  return stops;
}

/** The positions a deal lists, one per line or separated by commas or semicolons, without repeats. */
const positionsOf = (text: string): string[] => [...new Set(text.split(/[\n;,]+/).map((item) => item.trim()).filter(Boolean))];

/** The trip's Actions menu (request of November 20, 2026), coloured as the Leads menu: print blue, PDF teal, edit blue, delete red. */
function TripActions({ items }: { items: { tone: "edit" | "restore" | "dismiss"; label: string; icon: ReactNode; run: () => void }[] }) {
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
  return (
    <div className="menu-anchor" ref={anchor}>
      <button type="button" className="button button-soft" aria-haspopup="menu" aria-expanded={open} aria-label="Trip actions" onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal size={15} /> Actions <ChevronDown size={13} />
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
