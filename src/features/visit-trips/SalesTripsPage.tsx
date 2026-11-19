"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinned, Plus, Search, UserRound, X } from "lucide-react";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import DateRangePicker from "@/features/shell/DateRangePicker";
import { EmptyState, ErrorText, Loading, Pagination } from "@/features/shell/components";
import { fetchVisitTrips, type VisitTripQuery } from "./client";
import type { VisitTrip, VisitTripPage } from "./model";
import TripTable from "./TripTable";
import { DeleteTripDialog, TripFormDialog } from "./TripDialogs";

type Filters = { q: string; ownerId: string; from: string; to: string };
const noFilters: Filters = { q: "", ownerId: "", from: "", to: "" };

/**
 * Sales Trips (review of November 18, 2026): the trips planned to visit the deals on the "To be visited" list. Filters:
 * keyword (trip title, or a deal's organization, contact, city or address), salesperson, and By Period: one day or a range
 * picked on the calendar.
 */
export default function SalesTripsPage() {
  const { user, reference, can, navigate, notify, dataVersion, bumpData } = useApp();
  // My Trips or Everyone, as on the Pipeline page: administrators start with everyone's, salespeople with their own.
  const [scope, setScope] = useState<"mine" | "everyone">(user.role === "admin" ? "everyone" : "mine");
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<VisitTrip | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);
  const update = (changes: Partial<Filters>) => { setFilters((current) => ({ ...current, ...changes })); setPage(1); };

  const query = useMemo<VisitTripQuery>(() => ({
    q: debouncedQ || undefined, ownerId: scope === "mine" ? user.id : filters.ownerId ? Number(filters.ownerId) : undefined,
    from: filters.from || undefined, to: filters.to || undefined, page, pageSize: 50,
  }), [debouncedQ, scope, user.id, filters.ownerId, filters.from, filters.to, page]);
  const fetcher = useCallback(() => fetchVisitTrips(query), [query]);
  const { data, error, loading } = useAsyncData<VisitTripPage>(fetcher, dataVersion);
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const filtered = Boolean(filters.q || (scope === "everyone" && filters.ownerId) || filters.from || filters.to);
  const today = reference.today;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VISITS <span className="eyebrow-dot">·</span> {data ? `${data.total} ${data.total === 1 ? "TRIP" : "TRIPS"}` : "LOADING"}</div>
          <h1>Sales Trips</h1>
          <p>Every trip: those planned for the deals on the To be visited list (plan one here, or select deals under To Do → To be visited and choose Add to sales trip) and those made in the Sales Trip Planner.</p>
        </div>
        {can("plan_trips") && <button className="button button-primary" onClick={() => setCreating(true)}><Plus size={17} /> Sales Trip</button>}
      </div>

      <section className="panel leads-panel">
        <div className="lead-list-wrap">
          <div className="lead-toolbar trip-toolbar">
            <div className="scope-toggle" role="group" aria-label="Whose trips">
              <button className={scope === "mine" ? "is-active" : ""} aria-pressed={scope === "mine"} onClick={() => { setScope("mine"); setPage(1); }}>My Trips</button>
              <button className={scope === "everyone" ? "is-active" : ""} aria-pressed={scope === "everyone"} onClick={() => { setScope("everyone"); setPage(1); }}>Everyone</button>
            </div>
            <div className="search-field lead-search">
              <Search size={16} />
              <input aria-label="Search sales trips" placeholder="Search trip, organization, contact, city..." value={filters.q} onChange={(event) => update({ q: event.target.value })} />
              {filters.q && <button className="clear-search" aria-label="Clear search" onClick={() => update({ q: "" })}><X size={13} /></button>}
            </div>
            {scope === "everyone" && <label className="select-filter">
              <UserRound size={15} />
              <select aria-label="Salesperson" value={filters.ownerId} onChange={(event) => update({ ownerId: event.target.value })}>
                <option value="">All users</option>
                {owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>}
            <DateRangePicker from={filters.from} to={filters.to} today={today} onChange={(from, to) => update({ from, to })} />
            {filtered && <button className="text-button" onClick={() => { setFilters(noFilters); setPage(1); }}>Clear filters</button>}
          </div>

          <ErrorText message={error} />
          {loading && !data ? <Loading text="Loading sales trips..." /> : data && (
            data.trips.length === 0 ? (
              <EmptyState
                icon={<MapPinned size={22} />}
                title={filtered ? "No sales trip matches these filters" : scope === "mine" ? "No sales trips of yours yet" : "No sales trips yet"}
                text={filtered ? "Change the filters to see more trips." : scope === "mine" ? "Plan one for the deals on the To be visited list, or look at Everyone's trips." : "Put deals on the To be visited list, then plan a trip for them."}
              />
            ) : (
              // Planner trips open on the planner's page. The server lets the owner, the creator and managers delete.
              <TripTable
                trips={data.trips} today={today}
                onOpen={(trip) => navigate(trip.kind === "planner" ? "trips" : "sales-trips", trip.id)}
                onDelete={can("plan_trips") ? setDeleting : undefined}
              />
            )
          )}
          {data && data.total > 0 && (
            <div className="table-footer">
              <span>Showing <strong>{data.trips.length}</strong> of <strong>{data.total}</strong> sales trips{loading ? " · refreshing" : ""}</span>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          )}
        </div>
      </section>

      {deleting && <DeleteTripDialog trip={deleting} onClose={() => setDeleting(null)} onDeleted={(message) => { setDeleting(null); bumpData(); notify(message); }} />}
      {creating && (
        <TripFormDialog
          onClose={() => setCreating(false)}
          onSaved={(trip) => { setCreating(false); bumpData(); notify(`Sales trip ${trip.title} planned`); navigate("sales-trips", trip.id); }}
        />
      )}
    </>
  );
}
