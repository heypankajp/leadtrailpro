import { api, toQuery } from "@/lib/api";
import type { Opportunity, OpportunityPage, OpportunityRun, OpportunitySearch, OpportunitySearchInput, OpportunityStatus } from "./model";

export const fetchOpportunities = (query: { status: OpportunityStatus; page?: number; pageSize?: number; search?: string }) => api<OpportunityPage>(`/api/opportunities${toQuery(query)}`);
export const fetchOpportunity = (id: number) => api<{ opportunity: Opportunity }>(`/api/opportunities/${id}`);
export const markOpportunityNotRelevant = (id: number, reasonId: number, note: string) => api<{ opportunity: Opportunity }>(`/api/opportunities/${id}`, { method: "PATCH", json: { action: "not_relevant", reasonId, note } });
export const restoreOpportunity = (id: number) => api<{ opportunity: Opportunity }>(`/api/opportunities/${id}`, { method: "PATCH", json: { action: "restore" } });
export const reopenOpportunity = (id: number, ownerId: number) => api<{ lead: { id: number; clientName: string; ownerName: string } }>(`/api/opportunities/${id}/reopen`, { method: "POST", json: { ownerId } });
export type SearchDefaults = { titles: string[]; location: string; postedWithinDays: number };
export const fetchSearches = () => api<{ searches: OpportunitySearch[]; defaults: SearchDefaults }>("/api/opportunities/searches");
export const createSearch = (input: OpportunitySearchInput) => api<{ search: OpportunitySearch }>("/api/opportunities/searches", { method: "POST", json: input });
export const updateSearch = (id: number, input: OpportunitySearchInput) => api<{ search: OpportunitySearch }>(`/api/opportunities/searches/${id}`, { method: "PATCH", json: input });
export const deleteSearch = (id: number) => api<{ ok: true }>(`/api/opportunities/searches/${id}`, { method: "DELETE" });
export const fetchRuns = () => api<{ runs: OpportunityRun[] }>("/api/opportunities/runs");
export const runSearchesNow = () => api<{ run: { status: string; listingsFound: number; newCompanies: number; newListings: number; attached: number; details: string[] }; runs: OpportunityRun[] }>("/api/opportunities/runs", { method: "POST", json: {} });
