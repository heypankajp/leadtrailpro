import { api, toQuery } from "@/lib/api";
import type { CustomRange, ReportPeriod } from "@/lib/dates";
import type { Dashboard, DrilldownMetric, DrilldownResult, PerformanceReport, ReportFilters } from "./model";

export const fetchDashboard = (scope: "mine" | "team") => api<Dashboard>(`/api/dashboard${toQuery({ scope })}`);
export const fetchReport = (period: ReportPeriod, userId: number | null, filters: ReportFilters = { stage: null, templateId: null }, custom: CustomRange | null = null) => api<PerformanceReport>(`/api/reports${toQuery({ period, from: custom?.from, to: custom?.to, userId, stage: filters.stage, templateId: filters.templateId })}`);
export const reportExportUrl = (format: "xlsx" | "pdf", period: ReportPeriod, userId: number | null, filters: ReportFilters, custom: CustomRange | null = null) => `/api/reports/export${toQuery({ format, period, from: custom?.from, to: custom?.to, userId, stage: filters.stage, templateId: filters.templateId })}`;
export const fetchDrilldown = (period: ReportPeriod, userId: number, metric: DrilldownMetric, custom: CustomRange | null = null) => api<DrilldownResult>(`/api/reports/drilldown${toQuery({ period, from: custom?.from, to: custom?.to, userId, metric })}`);
