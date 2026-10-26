import type { JobListing } from "../../trips/model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type JobSourceAdapter } from "./types.ts";

/**
 * The original aggregator contract (SPEC §10.8), kept for any licensed source wrapped by the client:
 * `GET ${JOBS_API_URL}?company=&website=&location=` with `Authorization: Bearer ${JOBS_API_KEY}` returning
 * `{ jobs: [{ title, source, location, posted_at, employment_type, url }] }`.
 */
export function mapGeneric(data: Record<string, unknown>): JobListing[] {
  const rows = Array.isArray(data.jobs) ? (data.jobs as Record<string, unknown>[]) : [];
  return rows.map((row) => ({
    title: text(row.title), source: text(row.source, 80) || "Job board", location: text(row.location, 160),
    postedAt: ymd(row.posted_at), employmentType: text(row.employment_type, 60) || null, url: httpUrl(row.url),
  })).filter((row) => row.title && row.url);
}

export function createGenericSource(config: { url: string; key: string } | null): JobSourceAdapter {
  return {
    id: "generic",
    configured: Boolean(config?.url && config?.key),
    minIntervalMs: 0,
    async companyJobs(input: CompanyJobsInput) {
      const url = new URL(config!.url);
      url.searchParams.set("company", input.companyName);
      if (input.website) url.searchParams.set("website", input.website);
      if (input.address) url.searchParams.set("location", input.address);
      return mapGeneric(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${config!.key}` } }));
    },
  };
}
