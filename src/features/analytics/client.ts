import { api, toQuery } from "@/lib/api";
import type { CustomRange, ReportPeriod } from "@/lib/dates";
import type { LeadSummary } from "@/features/leads/model";
import type { AnalyticsFilters, AnalyticsReport } from "./model";

const filterQuery = (period: ReportPeriod, custom: CustomRange | null, filters: AnalyticsFilters) => ({
  period, from: custom?.from, to: custom?.to, ownerId: filters.ownerId, statusId: filters.statusId, leadTypeId: filters.leadTypeId, cityId: filters.cityId,
  industry: filters.industry, client: filters.client, source: filters.source, jobType: filters.jobType,
});

export const fetchAnalytics = (period: ReportPeriod, custom: CustomRange | null, filters: AnalyticsFilters) => api<AnalyticsReport>(`/api/analytics${toQuery(filterQuery(period, custom, filters))}`);
export const fetchAnalyticsLeads = (filters: AnalyticsFilters, statusCode: string | null, ownerId: number | null) =>
  api<{ leads: LeadSummary[] }>(`/api/analytics/leads${toQuery({ ...filterQuery("this_week", null, filters), period: undefined, status: statusCode, drillOwnerId: ownerId })}`);
