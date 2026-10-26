import { stubListings } from "@/features/trips/providers/stub";
import type { JobSourceAdapter } from "./types";

/** Fixed listings for the sample companies of the trip planner's stub provider (development and tests). */
export function createStubSource(enabled: boolean): JobSourceAdapter {
  return { id: "stub", configured: enabled, minIntervalMs: 0, async companyJobs({ companyName }) { return stubListings(companyName); } };
}
