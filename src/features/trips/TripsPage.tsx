"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Compass, MapPin, Search, ShieldCheck } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState, ErrorText, Field, Loading } from "@/features/shell/components";
import { createTrip, fetchTrips } from "./client";
import { maxRadius, maxTripResults, radiusLabel, type RadiusType, type SalesTrip, type TripProviderStatus } from "./model";

type FormState = { title: string; address: string; radiusType: RadiusType; radius: string; businessTypeId: string; maxResults: string };

/** Sales Trip Planner (TRIP-01..03): define a trip's search and keep the trips already planned. */
export default function TripsPage() {
  const { reference, navigate, notify, dataVersion, can } = useApp();
  const fetcher = useCallback(() => fetchTrips(), []);
  const { data, error } = useAsyncData<{ trips: SalesTrip[]; provider: TripProviderStatus }>(fetcher, dataVersion);
  const businessTypes = reference.listValues.business_type;
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

      <section className="panel trip-panel">
        <div className="panel-heading"><div><h2>New trip</h2><p>Up to {maxTripResults} companies within a distance or a driving time of the address.</p></div></div>
        <form className="lead-form trip-form" onSubmit={submit}>
          <Field label="Trip title" required><input value={form.title} onChange={set("title")} required maxLength={120} placeholder="e.g. Mississauga industrial park, Thursday" autoFocus /></Field>
          <Field label="Address" required wide><input value={form.address} onChange={set("address")} required maxLength={500} placeholder="Starting or target address or neighbourhood" /></Field>
          <Field label="Radius type" required>
            <select value={form.radiusType} onChange={(event) => setForm((current) => ({ ...current, radiusType: event.target.value === "minutes" ? "minutes" : "km", radius: event.target.value === "minutes" ? "20" : "15" }))}>
              <option value="km">Kilometres</option>
              <option value="minutes">Driving minutes</option>
            </select>
          </Field>
          <Field label={form.radiusType === "km" ? "Radius (km)" : "Radius (minutes)"} required><input type="number" min={1} max={maxRadius[form.radiusType]} value={form.radius} onChange={set("radius")} required /></Field>
          <Field label="Business type"><select value={form.businessTypeId} onChange={set("businessTypeId")}>{businessTypes.map((type) => <option key={type.id} value={type.id}>{type.value}</option>)}</select></Field>
          <Field label="Number of results" required hint={`Whole number, maximum ${maxTripResults}.`}><input type="number" min={1} max={maxTripResults} step={1} value={form.maxResults} onChange={set("maxResults")} required /></Field>
          <ErrorText message={formError} />
          <div className="modal-actions field-wide">
            <button type="submit" className="button button-primary" disabled={busy || (provider ? !provider.configured : false)}><Search size={15} /> {busy ? "Searching..." : "Search companies"}</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>{teamWide ? "Planned trips" : "Your trips"}</h2><p>Open a trip to filter, sort, shortlist, export, or print its companies.</p></div></div>
        <ErrorText message={error} />
        {!data && !error && <Loading text="Loading trips..." />}
        {data && data.trips.length === 0 && <EmptyState icon={<Compass size={22} />} title="No trips yet" text="Plan one with the form above." />}
        {data && data.trips.length > 0 && (
          <div className="table-scroll">
            <table className="lead-table trips-table">
              <thead><tr><th>TRIP</th><th>ADDRESS</th><th>RADIUS</th><th>BUSINESS TYPE</th><th>COMPANIES</th><th>LAST RUN</th>{teamWide && <th>PLANNED BY</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.trips.map((trip) => (
                  <tr key={trip.id}>
                    <td><button className="client-cell trip-open" onClick={() => navigate("trips", trip.id)}><span><strong>{trip.title}</strong></span></button></td>
                    <td><span className="muted-cell"><MapPin size={12} /> {trip.address}</span></td>
                    <td>{radiusLabel(trip)}</td>
                    <td>{trip.businessType ?? "Any"}</td>
                    <td>{trip.resultCount}</td>
                    <td><span className="muted-cell">{formatDateTime(trip.lastRunAt)}</span></td>
                    {teamWide && <td>{trip.ownerName}</td>}
                    <td><button className="text-button" onClick={() => navigate("trips", trip.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
