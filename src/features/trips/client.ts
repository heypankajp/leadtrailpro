import { api, toQuery } from "@/lib/api";
import type { ExportScope, JobListing, SalesTrip, TripInput, TripProviderStatus, TripResult } from "./model";

export type TripDetail = { trip: SalesTrip; results: TripResult[] };

export const fetchTrips = () => api<{ trips: SalesTrip[]; provider: TripProviderStatus }>("/api/trips");
export const createTrip = (input: TripInput) => api<TripDetail>("/api/trips", { method: "POST", json: input });
export const fetchTrip = (id: number) => api<TripDetail>(`/api/trips/${id}`);
export const rerunTrip = (id: number) => api<TripDetail>(`/api/trips/${id}/run`, { method: "POST" });
export const updateTripResult = (tripId: number, resultId: number, changes: { shortlisted?: boolean; plannedVisitDate?: string | null }) =>
  api<{ result: TripResult }>(`/api/trips/${tripId}/results/${resultId}`, { method: "PATCH", json: changes });
export const fetchResultJobs = (tripId: number, resultId: number) => api<{ result: TripResult; jobs: JobListing[] | null }>(`/api/trips/${tripId}/results/${resultId}/jobs`);
export const tripExportUrl = (tripId: number, scope: ExportScope, action: string | null) => `/api/trips/${tripId}/export${toQuery({ scope, action })}`;
