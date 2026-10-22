import { api, toQuery } from "@/lib/api";
import type { ReportPeriod } from "@/lib/dates";
import type { Dashboard, DrilldownMetric, DrilldownResult, PerformanceReport, ReportFilters } from "./model";

export const fetchDashboard = (scope: "mine" | "team") => api<Dashboard>(`/api/dashboard${toQuery({ scope })}`);
export const fetchReport = (period: ReportPeriod, userId: number | null, filters: ReportFilters = { stage: null, templateId: null }) => api<PerformanceReport>(`/api/reports${toQuery({ period, userId, stage: filters.stage, templateId: filters.templateId })}`);
export const reportExportUrl = (format: "xlsx" | "pdf", period: ReportPeriod, userId: number | null, filters: ReportFilters) => `/api/reports/export${toQuery({ format, period, userId, stage: filters.stage, templateId: filters.templateId })}`;
export const fetchDrilldown = (period: ReportPeriod, userId: number, metric: DrilldownMetric) => api<DrilldownResult>(`/api/reports/drilldown${toQuery({ period, userId, metric })}`);
