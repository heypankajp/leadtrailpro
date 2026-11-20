"use client";

import { Compass, MapPinned, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { companiesSummary, type VisitTrip } from "./model";

/**
 * The trips of Sales Trips and of the planner's Recent Planned Trips (review of November 18, 2026): trips planned for To
 * Do deals and trips made in the Sales Trip Planner, in one table. A planner trip opens on the planner's page; only a
 * To Do trip can be deleted here (the planner keeps its own trips).
 */
export default function TripTable({ trips, today, onOpen, onDelete }: {
  trips: VisitTrip[]; today: string; onOpen: (trip: VisitTrip) => void; onDelete?: (trip: VisitTrip) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="lead-table trip-table">
        <thead>
          <tr><th>TRIP DATE</th><th>SALES TRIP</th><th>SALESPERSON</th><th>COMPANIES</th><th title="Deals on a To Do trip; companies on a planner trip (its shortlist, or every company found)">STOPS</th>{onDelete && <th><span className="sr-only">Delete</span></th>}</tr>
        </thead>
        <tbody>
          {trips.map((trip) => (
            <tr key={`${trip.kind}-${trip.id}`} className={trip.tripDate < today ? "trip-past" : trip.tripDate === today ? "trip-today" : ""}>
              <td><span className="trip-date">{formatDate(trip.tripDate)}</span>{trip.tripDate === today ? <small className="trip-when">Today</small> : trip.tripDate < today ? <small className="trip-when">Past</small> : null}</td>
              <td>
                <button className="link-button trip-title" onClick={() => onOpen(trip)}>{trip.title}</button>
                <small className={`trip-kind trip-kind-${trip.kind}`} title={trip.kind === "planner" ? `Made in the Sales Trip Planner${trip.address ? ` around ${trip.address}` : ""}` : "Planned for deals on the To Do list"}>
                  {trip.kind === "planner" ? <><Compass size={11} /> Planner{trip.address ? ` · ${trip.address}` : ""}</> : <><MapPinned size={11} /> To Do deals</>}
                </small>
              </td>
              <td><span className="owner-cell"><span className="mini-avatar">{trip.ownerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>{trip.ownerName}</span></td>
              <td><span className="muted-cell">{companiesSummary(trip.companies)}</span></td>
              <td><span className="todo-count">{trip.dealCount}</span></td>
              {onDelete && <td>{trip.kind === "visit" && <button className="icon-button" aria-label={`Delete ${trip.title}`} title="Delete the trip" onClick={() => onDelete(trip)}><Trash2 size={14} /></button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
