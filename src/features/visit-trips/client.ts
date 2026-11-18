import { api, toQuery } from "@/lib/api";
import type { LeadSummary } from "@/features/leads/model";
import type { TripDeleteChoice, VisitTrip, VisitTripPage } from "./model";

export type VisitTripQuery = Partial<{ q: string; ownerId: number; date: string; from: string; to: string; page: number; pageSize: number; recent: boolean }>;
export type VisitTripDetail = { trip: VisitTrip; deals: LeadSummary[]; permissions: { edit: boolean } };

export const fetchVisitTrips = (query: VisitTripQuery) => api<VisitTripPage>(`/api/visit-trips${toQuery(query)}`);
export const fetchVisitTrip = (id: number) => api<VisitTripDetail>(`/api/visit-trips/${id}`);
export const createVisitTrip = (input: { title: string; tripDate: string; ownerId?: number | null; leadIds?: number[] }) =>
  api<{ trip: VisitTrip }>("/api/visit-trips", { method: "POST", json: input });
export const updateVisitTrip = (id: number, input: { title?: string; tripDate?: string; ownerId?: number }) =>
  api<{ trip: VisitTrip }>(`/api/visit-trips/${id}`, { method: "PATCH", json: input });
export const deleteVisitTrip = (id: number, choice: TripDeleteChoice) => api<{ ok: true; changed: number }>(`/api/visit-trips/${id}`, { method: "DELETE", json: choice });
export const addVisitTripDeals = (id: number, leadIds: number[]) =>
  api<{ trip: VisitTrip; added: number }>(`/api/visit-trips/${id}/deals`, { method: "POST", json: { leadIds } });
export const removeVisitTripDeal = (id: number, leadId: number) =>
  api<{ trip: VisitTrip }>(`/api/visit-trips/${id}/deals?leadId=${leadId}`, { method: "DELETE" });
