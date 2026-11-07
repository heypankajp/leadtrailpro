import { api } from "@/lib/api";
import type { JobsUsageOverview } from "./model";

/** The month's job-source usage (calls, credits, HasData balance) for the live card (SPEC §7.13). */
export const fetchJobsUsage = () => api<{ usage: JobsUsageOverview }>("/api/jobs/usage");
