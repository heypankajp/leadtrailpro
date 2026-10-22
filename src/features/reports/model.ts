import type { DateRange } from "@/lib/dates";
import type { LeadSummary } from "@/features/leads/model";
import type { Task } from "@/features/tasks/model";
import type { TargetTemplate } from "@/features/targets/model";
import type { UserStage } from "@/features/users/model";

export type ActivityCounts = { calls: number; emails: number; visits: number; notes: number };

export type PerformanceRow = {
  userId: number;
  name: string;
  role: string;
  stage: string;
  leadsCreated: number;
  leadsUpdated: number;
  calls: number;
  emails: number;
  visits: number;
  notes: number;
  conversions: number;
  tasksCreated: number;
  tasksCompleted: number;
  filesUploaded: number;
  logins: number;
  targetPercent: number | null;
  template: string | null;
};

export type TargetProgress = {
  template: TargetTemplate | null;
  leads: { achieved: number; target: number; label: string };
  visits: { achieved: number; target: number; label: string };
  conversions: { achieved: number; target: number; label: string };
  percent: number | null;
};

export type Dashboard = {
  today: string;
  metrics: { calls: { thisWeek: number; lastWeek: number }; emails: { thisWeek: number; lastWeek: number }; visits: { thisWeek: number; lastWeek: number } };
  followUps: { overdue: LeadSummary[]; today: LeadSummary[]; tomorrow: LeadSummary[] };
  targets: TargetProgress;
  inactiveLeads: LeadSummary[];
  inactivityDays: number;
  /** TASK-05: the number of quiet days that flagged each lead in inactiveLeads, keyed by lead id. */
  inactiveLimits: Record<string, number>;
  inactivityRuleCount: number;
  openTasks: Task[];
  overdueTaskCount: number;
  recentLeads: LeadSummary[];
  teamWide: boolean;
};

export type DrilldownMetric = "calls" | "emails" | "visits" | "notes" | "leads" | "conversions" | "tasks";

export type DailyPoint = { date: string; calls: number; emails: number; visits: number; leads: number };

export type PerformanceReport = { range: DateRange; rows: PerformanceRow[]; series: DailyPoint[] };

/** RPT-05: narrow a team report to one productivity stage and/or one target template. */
export type ReportFilters = { stage: UserStage | null; templateId: number | null };

export type DrilldownResult = {
  activities?: { id: number; leadId: number; leadName: string; summary: string; body: string | null; occurredAt: string }[];
  leads?: LeadSummary[];
  tasks?: Task[];
};
