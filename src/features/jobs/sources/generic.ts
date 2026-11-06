import type { JobListing } from "../../trips/model.ts";
import { listingKey } from "../../opportunities/model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type FoundRow, type JobSourceAdapter, type SearchListingsInput, type SearchPage } from "./types.ts";

/**
 * The original aggregator contract (SPEC §10.8), kept for any licensed source wrapped by the client:
 * `GET ${JOBS_API_URL}?company=&website=&location=` with `Authorization: Bearer ${JOBS_API_KEY}` returning
 * `{ jobs: [{ id?, title, company?, source, location, posted_at, employment_type, url }] }`. Keyword searches call the
 * same URL with `keyword=&location=&job_type=&page=` and read `has_more`.
 */
export function parseGenericRows(data: Record<string, unknown>): FoundRow[] {
  const rows = Array.isArray(data.jobs) ? (data.jobs as Record<string, unknown>[]) : [];
  return rows.map((row) => {
    const listing: JobListing = {
      title: text(row.title), source: text(row.source, 80) || "Job board", location: text(row.location, 160),
      postedAt: ymd(row.posted_at), employmentType: text(row.employment_type, 60) || null, url: httpUrl(row.url),
    };
    return { company: text(row.company), listing, sourceKey: listingKey("generic", listing, text(row.id, 120)) };
  }).filter((row) => row.listing.title && row.listing.url);
}

export function mapGeneric(data: Record<string, unknown>): JobListing[] {
  return parseGenericRows(data).map((row) => row.listing);
}

export function createGenericSource(config: { url: string; key: string } | null): JobSourceAdapter {
  const request = (url: URL) => fetchJson(url.toString(), { headers: { Authorization: `Bearer ${config!.key}` } });
  return {
    id: "generic",
    configured: Boolean(config?.url && config?.key),
    minIntervalMs: 0,
    async companyJobs(input: CompanyJobsInput) {
      const url = new URL(config!.url);
      url.searchParams.set("company", input.companyName);
      if (input.website) url.searchParams.set("website", input.website);
      if (input.address) url.searchParams.set("location", input.address);
      return mapGeneric(await request(url));
    },
    async searchListings(input: SearchListingsInput): Promise<SearchPage> {
      const url = new URL(config!.url);
      url.searchParams.set("keyword", input.keyword);
      if (input.location) url.searchParams.set("location", input.location);
      if (input.jobType) url.searchParams.set("job_type", input.jobType);
      url.searchParams.set("page", String(input.page));
      const data = await request(url);
      const rows = parseGenericRows(data);
      return { rows, hasMore: rows.length > 0 && data.has_more === true, nextPageToken: null };
    },
  };
}
