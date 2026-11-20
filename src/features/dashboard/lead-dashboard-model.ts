/** The Action Center for leads (request of November 20, 2026). */
export type LeadDashboardItem = {
  id: number; companyName: string; location: string; latestTitle: string; origin: "manual" | "found";
  createdAt: string; addedByName: string | null; todoSince: string | null;
  /** The deal a converted lead became, with its owner and stage. */
  dealId: number | null; decidedAt: string | null; decidedByName: string | null; reason: string | null; dealOwnerName: string | null; dealStage: string | null;
};

export type LeadDashboard = {
  today: string;
  teamWide: boolean;
  metrics: Record<"added" | "converted" | "notRelevant", { thisWeek: number; lastWeek: number }>;
  /** Leads in the inbox (not converted, not relevant or archived), of which added by hand. */
  open: number; openManual: number;
  /** Leads on any To Do list, and on To be visited. */
  onTodo: number; toBeVisitedCount: number;
  /** Leads in the inbox by Lead Source. */
  sources: { label: string; count: number }[];
  /** The newest leads added by hand, and the newest the job searches found (request of November 20, 2026). */
  newest: LeadDashboardItem[];
  generated: LeadDashboardItem[];
  toBeVisited: LeadDashboardItem[];
  /** Leads in the inbox the longest, not on a To Do list. */
  waiting: LeadDashboardItem[];
  converted: LeadDashboardItem[];
};
