import type { JobListing } from "../../trips/model.ts";
import { listingKey } from "../../opportunities/model.ts";
import { employmentTypeFrom, keepCompanyListings, plainName } from "../model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type FoundRow, type JobSourceAdapter, type SearchListingsInput, type SearchPage } from "./types.ts";

/**
 * Adzuna Job Search API (developer.adzuna.com): free developer keys (a new application starts as "pending activation"
 * with 25 calls a day until Adzuna reviews it; 25 a minute and 250 a day afterwards), "Jobs by Adzuna" attribution
 * required. `GET /v1/api/jobs/{country}/search/{page}?app_id&app_key&what|what_phrase&where&…`, 50 results a page.
 * Company lookups put the company name in `what_phrase` (exact phrase over title and description) and narrow the
 * results to that company with `keepCompanyListings`; keyword searches use `what`. Checked with a live key on
 * November 1, 2026: the `company` filter returned nothing for one company and an HTML 400 page for another, while
 * `what_phrase` returned every listing of the same company.
 */
export type AdzunaConfig = { appId: string; appKey: string };
const perPage = 50;

/** Pure mapping of a search response: every listing with its company and Adzuna's id as the key. */
export function parseAdzunaRows(data: Record<string, unknown>): FoundRow[] {
  const results = Array.isArray(data.results) ? (data.results as Record<string, unknown>[]) : [];
  return results.map((row) => {
    const company = row.company && typeof row.company === "object" ? text((row.company as Record<string, unknown>).display_name) : "";
    const location = row.location && typeof row.location === "object" ? text((row.location as Record<string, unknown>).display_name, 160) : "";
    const listing: JobListing = {
      title: text(row.title), source: "Adzuna", location,
      postedAt: ymd(row.created),
      employmentType: employmentTypeFrom([text(row.contract_time), text(row.contract_type)]),
      url: httpUrl(row.redirect_url),
    };
    return { company, listing, sourceKey: listingKey("adzuna", listing, text(row.id, 100)) };
  }).filter((row) => row.listing.title && row.listing.url);
}

/** Whether Adzuna has a page after `page`, from the `count` it reports. */
export const adzunaHasMore = (data: Record<string, unknown>, page: number): boolean => Number(data.count ?? 0) > page * perPage;

/** The company lookup: the search narrowed to the company asked about. */
export function mapAdzuna(data: Record<string, unknown>, companyName: string, normalize: (name: string) => string = plainName): JobListing[] {
  return keepCompanyListings(parseAdzunaRows(data), companyName, normalize).map((row) => row.listing);
}

const jobTypeParams: Record<string, [string, string]> = { full_time: ["full_time", "1"], part_time: ["part_time", "1"], contract: ["contract", "1"], permanent: ["permanent", "1"] };

export function createAdzunaSource(config: AdzunaConfig | null): JobSourceAdapter {
  const baseUrl = (country: string, page: number) => {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country || "ca")}/search/${page}`);
    url.searchParams.set("app_id", config!.appId);
    url.searchParams.set("app_key", config!.appKey);
    url.searchParams.set("results_per_page", String(perPage));
    url.searchParams.set("max_days_old", "30");
    url.searchParams.set("content-type", "application/json");
    return url;
  };
  return {
    id: "adzuna",
    configured: Boolean(config?.appId && config?.appKey),
    minIntervalMs: 2500,
    async companyJobs(input: CompanyJobsInput) {
      const url = baseUrl(input.country, 1);
      url.searchParams.set("what_phrase", input.companyName);
      if (input.city) url.searchParams.set("where", input.city);
      return mapAdzuna(await fetchJson(url.toString()), input.companyName, input.normalize);
    },
    async searchListings(input: SearchListingsInput): Promise<SearchPage> {
      const url = baseUrl(input.country, input.page);
      url.searchParams.set("what", input.keyword);
      if (input.location) url.searchParams.set("where", input.location);
      const flag = jobTypeParams[input.jobType];
      if (flag) url.searchParams.set(flag[0], flag[1]);
      const data = await fetchJson(url.toString());
      const rows = parseAdzunaRows(data);
      return { rows, hasMore: rows.length > 0 && adzunaHasMore(data, input.page), nextPageToken: null };
    },
  };
}
