"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, BriefcaseBusiness, Download, ExternalLink, Printer, RefreshCw } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, statusClass } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, EmptyState, ErrorText, Loading } from "@/features/shell/components";
import { fetchResultJobs, fetchTrip, rerunTrip, tripExportUrl, updateTripResult, type TripDetail } from "./client";
import { exportScopeLabels, formatDistance, hiringLabel, radiusLabel, type ExportScope, type JobListing, type TripResult } from "./model";

type SortKey = "company" | "address" | "distance" | "hiring" | "action";
type Show = "all" | "shortlisted" | "planned";

const sortValue = (row: TripResult, key: SortKey): string | number => {
  switch (key) {
    case "company": return row.companyName.toLowerCase();
    case "address": return row.address.toLowerCase();
    case "distance": return row.driveMinutes ?? row.distanceKm ?? Number.MAX_SAFE_INTEGER;
    case "hiring": return row.jobCount ?? -1;
    case "action": return row.actionLabel.toLowerCase();
  }
};

/** A trip's companies (TRIP-03..11): sortable, filterable by Action, shortlist, planned visits, job listings, Excel export, and print. */
export default function TripResultsPage({ tripId }: { tripId: number }) {
  const { navigate, notify, openLead } = useApp();
  const fetcher = useCallback(() => fetchTrip(tripId), [tripId]);
  const { data, error, reload } = useAsyncData<TripDetail>(fetcher);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "distance", direction: "asc" });
  const [action, setAction] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [jobsFor, setJobsFor] = useState<TripResult | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const results = useMemo(() => data?.results ?? [], [data]);
  const actionOptions = useMemo(() => [...new Set(results.map((row) => row.actionLabel))].sort((a, b) => a.localeCompare(b)), [results]);
  const visible = useMemo(() => {
    const filtered = results.filter((row) => (!action || row.actionLabel === action) && (show === "all" || (show === "shortlisted" ? row.shortlisted : row.plannedVisitDate !== null)));
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (left === right) return a.sequence - b.sequence;
      return (left < right ? -1 : 1) * direction;
    });
  }, [results, action, show, sort]);
  const scope: ExportScope = show === "shortlisted" ? "shortlisted" : show === "planned" ? "planned" : action ? "filtered" : "all";

  const toggleSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));

  const patch = async (row: TripResult, changes: { shortlisted?: boolean; plannedVisitDate?: string | null }, message: string) => {
    setBusyId(row.id);
    try {
      await updateTripResult(tripId, row.id, changes);
      reload();
      notify(message);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setBusyId(null);
    }
  };

  const rerun = async () => {
    setRerunning(true);
    try {
      const next = await rerunTrip(tripId);
      reload();
      notify(`${next.results.length} ${next.results.length === 1 ? "company" : "companies"} found`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setRerunning(false);
    }
  };

  if (error && !data) return <><BackLink onClick={() => navigate("trips")} /><ErrorText message={error} /></>;
  if (!data) return <Loading text="Loading trip..." />;
  const { trip } = data;
  const sortHeader = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button className={`sort-button ${sort.key === key ? "is-active" : ""}`} onClick={() => toggleSort(key)}>{label} <ArrowUpDown size={12} /></button>
    </th>
  );

  return (
    <>
      <div className="page-heading trip-heading">
        <div>
          <BackLink onClick={() => navigate("trips")} />
          <div className="eyebrow">SALES TRIP <span className="eyebrow-dot">·</span> {results.length} {results.length === 1 ? "COMPANY" : "COMPANIES"}</div>
          <h1>{trip.title}</h1>
          <p>{trip.address} · within {radiusLabel(trip)} · {trip.businessType ?? "Any business type"} · up to {trip.maxResults} results · last run {formatDateTime(trip.lastRunAt)}</p>
        </div>
        <div className="heading-actions">
          <button className="button button-outline" onClick={() => void rerun()} disabled={rerunning}><RefreshCw size={15} /> {rerunning ? "Searching..." : "Run again"}</button>
          <a className="button button-outline" href={tripExportUrl(tripId, scope, action || null)} download><Download size={15} /> Export Excel</a>
          <button className="button button-primary" onClick={() => window.print()}><Printer size={15} /> Print</button>
        </div>
      </div>

      <div className="trip-print-header">
        <h1>Field visit report: {trip.title}</h1>
        <p>{trip.address} · within {radiusLabel(trip)} · {trip.businessType ?? "Any business type"} · {exportScopeLabels[scope]}{action ? ` · Action: ${action}` : ""} · printed {formatDate(new Date().toISOString().slice(0, 10))}</p>
      </div>

      <section className="panel">
        <div className="trip-toolbar">
          <label className="select-filter">
            <select aria-label="Filter by action" value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">All actions</option>
              {actionOptions.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </label>
          <label className="select-filter">
            <select aria-label="Show" value={show} onChange={(event) => setShow(event.target.value as Show)}>
              <option value="all">All results</option>
              <option value="shortlisted">Shortlisted companies</option>
              <option value="planned">Planned visits</option>
            </select>
          </label>
          <span className="trip-scope-note">Export and print: <strong>{exportScopeLabels[scope]}</strong>{action ? ` (Action: ${action})` : ""} · {visible.length} {visible.length === 1 ? "company" : "companies"}</span>
        </div>
        <ErrorText message={error} />
        {results.length === 0 ? <EmptyState icon={<BriefcaseBusiness size={22} />} title="No companies matched this search" text="Widen the radius, choose another business type, or run the search again." /> : (
          <div className="table-scroll">
            <table className="lead-table trip-table">
              <thead>
                <tr>
                  <th className="print-hide"><span className="sr-only">Shortlist</span></th>
                  {sortHeader("company", "COMPANY")}
                  {sortHeader("address", "COMPANY ADDRESS")}
                  {sortHeader("distance", "DISTANCE")}
                  {sortHeader("hiring", "HIRING")}
                  {sortHeader("action", "ACTION")}
                  <th>PLANNED VISIT</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className={row.shortlisted ? "row-shortlisted" : ""}>
                    <td className="print-hide"><input type="checkbox" aria-label={`Shortlist ${row.companyName}`} checked={row.shortlisted} disabled={busyId === row.id} onChange={(event) => void patch(row, { shortlisted: event.target.checked }, event.target.checked ? `${row.companyName} shortlisted` : `${row.companyName} removed from the shortlist`)} /></td>
                    <td>
                      {row.website
                        ? <a className="company-link" href={row.website} target="_blank" rel="noopener noreferrer"><strong>{row.companyName}</strong> <ExternalLink size={12} /></a>
                        : <strong>{row.companyName}</strong>}
                      {row.phone && <small className="muted-cell">{row.phone}</small>}
                    </td>
                    <td><span className="muted-cell address-cell">{row.address || "—"}</span></td>
                    <td>{formatDistance(row, trip.radiusType)}</td>
                    <td>
                      {row.jobCount !== null && row.jobCount > 0
                        ? <button className="text-button hiring-link" aria-label={`Job listings for ${row.companyName}`} onClick={() => setJobsFor(row)}>{hiringLabel(row.jobCount)}</button>
                        : <span className="muted-cell">{hiringLabel(row.jobCount)}</span>}
                    </td>
                    <td>
                      <span className={`status-pill ${row.actionCode === "new" ? "status-opportunity" : statusClass(row.actionCode)}`}><i />{row.actionLabel}</span>
                      {row.matchedLeadId && <button className="text-button print-hide open-lead" onClick={() => openLead(row.matchedLeadId!)}>Open lead</button>}
                    </td>
                    <td>
                      {row.shortlisted
                        ? <input className="print-hide" type="date" aria-label={`Planned visit date for ${row.companyName}`} value={row.plannedVisitDate ?? ""} disabled={busyId === row.id} onChange={(event) => void patch(row, { plannedVisitDate: event.target.value || null }, event.target.value ? `Visit to ${row.companyName} planned for ${formatDate(event.target.value)}` : `Planned visit to ${row.companyName} cleared`)} />
                        : <span className="muted-cell print-hide">Shortlist first</span>}
                      <span className="print-only">{row.plannedVisitDate ? formatDate(row.plannedVisitDate) : ""}</span>
                    </td>
                  </tr>
                ))}
                {!visible.length && <tr><td colSpan={7} className="empty-state">No companies match this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {jobsFor && <JobsDialog tripId={tripId} result={jobsFor} onClose={() => setJobsFor(null)} />}
    </>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return <button className="text-button back-link print-hide" onClick={onClick}><ArrowLeft size={14} /> All trips</button>;
}

/** Job listings behind the Hiring count (TRIP-06). */
function JobsDialog({ tripId, result, onClose }: { tripId: number; result: TripResult; onClose: () => void }) {
  const [state, setState] = useState<{ jobs: JobListing[] | null; error: string; loading: boolean }>({ jobs: result.jobs, error: "", loading: true });
  useEffect(() => {
    let cancelled = false;
    fetchResultJobs(tripId, result.id)
      .then((response) => { if (!cancelled) setState({ jobs: response.jobs, error: "", loading: false }); })
      .catch((caught: unknown) => { if (!cancelled) setState((current) => ({ jobs: current.jobs, error: errorMessage(caught), loading: false })); });
    return () => { cancelled = true; };
  }, [tripId, result.id]);
  const jobs = state.jobs ?? [];
  return (
    <Dialog title={`Job listings: ${result.companyName}`} eyebrow="HIRING" onClose={onClose} size="wide">
      <ErrorText message={state.error} />
      {state.loading && !state.jobs && <Loading text="Loading job listings..." />}
      {!state.loading && jobs.length === 0 && <EmptyState icon={<BriefcaseBusiness size={22} />} title="No active listings found" />}
      {jobs.length > 0 && (
        <div className="table-scroll">
          <table className="lead-table jobs-table">
            <thead><tr><th>JOB TITLE</th><th>JOB PORTAL / SOURCE</th><th>LOCATION</th><th>DATE POSTED</th><th>EMPLOYMENT TYPE</th><th><span className="sr-only">Link</span></th></tr></thead>
            <tbody>
              {jobs.map((job, index) => (
                <tr key={`${job.url}-${index}`}>
                  <td><strong>{job.title}</strong></td>
                  <td>{job.source}</td>
                  <td>{job.location || "—"}</td>
                  <td>{job.postedAt ? formatDate(job.postedAt) : "—"}</td>
                  <td>{job.employmentType ?? "—"}</td>
                  <td><a className="button button-outline button-small" href={job.url} target="_blank" rel="noopener noreferrer">View job <ExternalLink size={12} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
