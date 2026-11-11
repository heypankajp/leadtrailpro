import type { JobListing } from "../../trips/model.ts";
import { listingKey } from "../../opportunities/model.ts";
import { employmentTypeFrom, keepCompanyListings, plainName } from "../model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type FoundRow, type JobSourceAdapter, type SearchListingsInput, type SearchPage } from "./types.ts";

/**
 * HasData Indeed Jobs Scraper API (docs.hasdata.com/apis/indeed/listing): `x-api-key` header, 10 credits per call,
 * charged only on success. `GET https://api.hasdata.com/scrape/indeed/listing?keyword=&location=&domain=&datePosted=`
 * returns `{ jobs: [...], pagination: { nextPage } }`; the next page is fetched with `nextPage=<that value>`.
 * The optional `domain` selects a regional Indeed site (`ca` → `ca.indeed.com`). `datePosted` accepts only 1, 3, 7, or 14
 * (a 422 "datePosted must be one of 1, 3, 7, 14" otherwise, seen on the server on November 11, 2026), so a search's
 * posted-within window is rounded down to the nearest of those by `hasDataDatePosted`.
 */
export type HasDataConfig = { apiKey: string; domain: string | null };

/** HasData's REST base; HASDATA_API_URI points it at a stand-in during tests. */
export const hasDataApiUri = () => (process.env.HASDATA_API_URI?.trim() || "https://api.hasdata.com").replace(/\/+$/, "");

/**
 * The account's credit balance (docs.hasdata.com/credits-and-concurrency: `GET /user/me/usage`, free). Returns the raw JSON
 * for `parseHasDataUsage`; throws on a non-2xx answer so the caller can treat the balance as unknown.
 */
export async function fetchHasDataUsage(apiKey: string): Promise<unknown> {
  return fetchJson(`${hasDataApiUri()}/user/me/usage`, { headers: { "x-api-key": apiKey } });
}

/**
 * The API validates `domain` against the full Indeed host names (`ca.indeed.com`, `www.indeed.com`, …), so a bare
 * country code from HASDATA_INDEED_DOMAIN (`ca`) is expanded; a value that already contains a dot is used as given.
 */
export function hasDataDomain(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes(".")) return trimmed;
  return trimmed === "us" || trimmed === "www" ? "www.indeed.com" : `${trimmed}.indeed.com`;
}

export function parseHasDataRows(data: Record<string, unknown>): FoundRow[] {
  const jobs = Array.isArray(data.jobs) ? (data.jobs as Record<string, unknown>[]) : [];
  return jobs.map((row) => {
    const listing: JobListing = {
      title: text(row.title), source: "Indeed", location: text(row.location, 160),
      postedAt: ymd(row.isoDate),
      employmentType: employmentTypeFrom(Array.isArray(row.details) ? (row.details as unknown[]).map((item) => (typeof item === "string" ? item : "")) : []),
      url: httpUrl(row.url),
    };
    return { company: text(row.company), listing, sourceKey: listingKey("hasdata", listing, text(row.id, 120) || text(row.jobKey, 120)) };
  }).filter((row) => row.listing.title && row.listing.url);
}

/** The values HasData's `datePosted` accepts, in days. */
export const hasDataDatePostedValues = [1, 3, 7, 14] as const;

/** The largest accepted `datePosted` that does not exceed the requested window (30 → 14, 10 → 7, 2 → 1; anything under 1 → 1). */
export function hasDataDatePosted(days: number | null | undefined): string {
  const wanted = Number.isFinite(days) ? Number(days) : 14;
  let chosen: number = hasDataDatePostedValues[0];
  for (const value of hasDataDatePostedValues) if (value <= wanted) chosen = value;
  return String(chosen);
}

/** The cursor of the page after this one, when HasData reports one. */
export function hasDataNextPage(data: Record<string, unknown>): string | null {
  const pagination = data.pagination && typeof data.pagination === "object" ? (data.pagination as Record<string, unknown>) : {};
  return text(pagination.nextPage, 2048) || text(data.nextPage, 2048) || null;
}

export function mapHasData(data: Record<string, unknown>, companyName: string, normalize: (name: string) => string = plainName): JobListing[] {
  return keepCompanyListings(parseHasDataRows(data), companyName, normalize).map((row) => row.listing);
}

export function createHasDataSource(config: HasDataConfig | null): JobSourceAdapter {
  const request = (url: URL) => fetchJson(url.toString(), { headers: { "x-api-key": config!.apiKey, "Content-Type": "application/json" } });
  const listingUrl = (keyword: string, location: string, days: string) => {
    const url = new URL(`${hasDataApiUri()}/scrape/indeed/listing`);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("location", location);
    url.searchParams.set("datePosted", days);
    const domain = hasDataDomain(config!.domain);
    if (domain) url.searchParams.set("domain", domain);
    return url;
  };
  return {
    id: "hasdata",
    configured: Boolean(config?.apiKey),
    minIntervalMs: 300,
    async companyJobs(input: CompanyJobsInput) {
      const data = await request(listingUrl(input.companyName, input.city || input.address || input.country || "Canada", "14"));
      return mapHasData(data, input.companyName, input.normalize);
    },
    async searchListings(input: SearchListingsInput): Promise<SearchPage> {
      const url = listingUrl(input.keyword, input.location || "Canada", hasDataDatePosted(input.postedWithinDays || 30));
      if (input.pageToken) url.searchParams.set("nextPage", input.pageToken);
      const data = await request(url);
      const rows = parseHasDataRows(data);
      const nextPageToken = hasDataNextPage(data);
      return { rows, hasMore: rows.length > 0 && Boolean(nextPageToken), nextPageToken };
    },
  };
}
