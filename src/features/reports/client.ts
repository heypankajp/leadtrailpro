import { api, toQuery } from "@/lib/api";
import type { ReportPeriod } from "@/lib/dates";
import type { Dashboard, DrilldownMetric, DrilldownResult, PerformanceReport } from "./model";

export const fetchDashboard = (scope: "mine" | "team") => api<Dashboard>(`/api/dashboard${toQuery({ scope })}`);
export const fetchReport = (period: ReportPeriod, userId: number | null) => api<PerformanceReport>(`/api/reports${toQuery({ period, userId })}`);
export const fetchDrilldown = (period: ReportPeriod, userId: number, metric: DrilldownMetric) => api<DrilldownResult>(`/api/reports/drilldown${toQuery({ period, userId, metric })}`);
