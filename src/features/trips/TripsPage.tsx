"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Compass, MapPinned, Search, ShieldCheck } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import JobsUsageCard from "@/features/jobs/JobsUsageCard";
import MapsUsageCard from "@/features/maps/MapsUsageCard";
import { EmptyState, ErrorText, Field, Loading, Pagination } from "@/features/shell/components";
import { fetchVisitTrips } from "@/features/visit-trips/client";
import type { VisitTripPage } from "@/features/visit-trips/model";
import TripTable from "@/features/visit-trips/TripTable";
import { createTrip, fetchTrips } from "./client";
import { listNumber } from "@/features/list-values/model";
import { maxRadiusFor, type RadiusType, type SalesTrip, type TripProviderStatus } from "./model";

type FormState = { title: string; address: string; radiusType: RadiusType; radius: string; businessTypeId: string; maxResults: string };

/** Sales Trip Planner (TRIP-01..03): define a trip's search and keep the trips already planned. */
export default function TripsPage() {
  const { reference, navigate, notify, dataVersion, can } = useApp();
  const fetcher = useCallback(() => fetchTrips(), []);
  const { data } = useAsyncData<{ trips: SalesTrip[]; provider: TripProviderStatus }>(fetcher, dataVersion);
  // Recent Planned Trips: ten to a page.
  const [recentPage, setRecentPage] = useState(1);
  const recentFetcher = useCallback(() => fetchVisitTrips({ recent: true, page: recentPage, pageSize: 10 }), [recentPage]);
  const recent = useAsyncData<VisitTripPage>(recentFetcher, dataVersion);
  const businessTypes = reference.listValues.business_type;
  // List of Values → Sales Trip Planner: the largest radius in km and the most results a search may ask for.
  const limits = { radiusKm: listNumber("trip_max_radius_km", reference.listValues.trip_max_radius_km), results: listNumber("trip_max_results", reference.listValues.trip_max_results) };
  const [form, setForm] = useState<FormState>(() => ({
    title: "", address: "", radiusType: "km", radius: "15", businessTypeId: String(businessTypes.find((type) => type.code === "any")?.id ?? ""), maxResults: "25",
  }));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const result = await createTrip({
        title: form.title, address: form.address, radiusType: form.radiusType, radius: Number(form.radius),
        businessTypeId: form.businessTypeId ? Number(form.businessTypeId) : null, maxResults: Number(form.maxResults),
      });
      notify(`${result.results.length} ${result.results.length === 1 ? "company" : "companies"} found for "${result.trip.title}"`);
      navigate("trips", result.trip.id);
    } catch (caught) {
      setFormError(errorMessage(caught, "The search could not be run."));
    } finally {
      setBusy(false);
    }
  };

  const provider = data?.provider;
  const teamWide = can("view_team_reports");

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">PLAN A SALES TRIP</div><h1>Sales trip planner</h1><p>Find companies around an address, see who is hiring and who is already in the CRM, then shortlist the ones to visit.</p></div></div>
      {provider && !provider.configured && <div className="integration-note"><ShieldCheck size={16} /><span><strong>Not configured.</strong> {provider.message}</span></div>}
      {provider && provider.configured && provider.message && <div className="integration-note"><ShieldCheck size={16} /><span>{provider.message}</span></div>}
      {provider?.name === "google" && <MapsUsageCard />}
      {provider?.name === "google" && <JobsUsageCard compact />}

      <section className="panel trip-panel">
        <div className="panel-heading"><div><h2>New trip</h2><p>Up to {limits.results} companies within {limits.radiusKm} km or a driving time of the address.</p></div></div>
        <form className="lead-form trip-form" onSubmit={submit}>
          <Field label="Trip title" required><input value={form.title} onChange={set("title")} required maxLength={120} placeholder="e.g. Mississauga industrial park, Thursday" autoFocus /></Field>
          <Field label="Address" required wide><input value={form.address} onChange={set("address")} required maxLength={500} placeholder="Starting or target address or neighbourhood" /></Field>
          <Field label="Radius type" required>
            <select value={form.radiusType} onChange={(event) => setForm((current) => ({ ...current, radiusType: event.target.value === "minutes" ? "minutes" : "km", radius: event.target.value === "minutes" ? "20" : "15" }))}>
              <option value="km">Kilometres</option>
              <option value="minutes">Driving minutes</option>
            </select>
          </Field>
          <Field label={form.radiusType === "km" ? "Radius (km)" : "Radius (minutes)"} required><input type="number" min={1} max={maxRadiusFor(form.radiusType, limits)} value={form.radius} onChange={set("radius")} required /></Field>
          <Field label="Business type"><select value={form.businessTypeId} onChange={set("businessTypeId")}>{businessTypes.map((type) => <option key={type.id} value={type.id}>{type.value}</option>)}</select></Field>
          <Field label="Number of results" required hint={`Whole number, maximum ${limits.results}.`}><input type="number" min={1} max={limits.results} step={1} value={form.maxResults} onChange={set("maxResults")} required /></Field>
          <ErrorText message={formError} />
          <div className="modal-actions field-wide">
            <button type="submit" className="button button-primary" disabled={busy || (provider ? !provider.configured : false)}><Search size={15} /> {busy ? "Searching..." : "Search companies"}</button>
          </div>
        </form>
      </section>

      <section className="panel">
        {/* Review of November 18, 2026: the same list as Sales Trips (planner trips and trips planned for To Do deals),
            the most recently planned first, as many as List of values → Recent Planned Trips says, ten to a page. */}
        <div className="panel-heading">
          <div><h2>Recent Planned Trips</h2><p>The latest trips{teamWide ? "" : " you can see"}, from the planner and from the To Do list. Open one to work on it; every trip is under Sales Trips.</p></div>
          <button className="button button-outline button-small" onClick={() => navigate("sales-trips")}><MapPinned size={14} /> All Sales Trips</button>
        </div>
        <ErrorText message={recent.error} />
        {!recent.data && !recent.error && <Loading text="Loading trips..." />}
        {recent.data && recent.data.trips.length === 0 && <EmptyState icon={<Compass size={22} />} title="No trips yet" text="Plan one with the form above." />}
        {recent.data && recent.data.trips.length > 0 && (
          <>
            <TripTable trips={recent.data.trips} today={reference.today} onOpen={(trip) => navigate(trip.kind === "planner" ? "trips" : "sales-trips", trip.id)} />
            <div className="table-footer">
              <span>Showing <strong>{recent.data.trips.length}</strong> of the <strong>{recent.data.total}</strong> most recent trips</span>
              <Pagination page={recent.data.page} pageSize={recent.data.pageSize} total={recent.data.total} onPage={setRecentPage} />
            </div>
          </>
        )}
      </section>
    </>
  );
}
