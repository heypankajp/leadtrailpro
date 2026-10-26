import type { JobListing } from "../../trips/model.ts";
import { employmentTypeFrom, keepCompanyListings, plainName } from "../model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type JobSourceAdapter } from "./types.ts";

/**
 * Adzuna Job Search API (developer.adzuna.com): free developer keys, 25 calls a minute and 250 a day by default,
 * "Jobs by Adzuna" attribution required. `GET /v1/api/jobs/{country}/search/1?app_id&app_key&company&where&…`.
 */
export type AdzunaConfig = { appId: string; appKey: string };

/** Pure mapping of a search response, keeping only the company asked about. */
export function mapAdzuna(data: Record<string, unknown>, companyName: string, normalize: (name: string) => string = plainName): JobListing[] {
  const results = Array.isArray(data.results) ? (data.results as Record<string, unknown>[]) : [];
  const rows = results.map((row) => {
    const company = row.company && typeof row.company === "object" ? text((row.company as Record<string, unknown>).display_name) : "";
    const location = row.location && typeof row.location === "object" ? text((row.location as Record<string, unknown>).display_name, 160) : "";
    return {
      company,
      listing: {
        title: text(row.title), source: "Adzuna", location,
        postedAt: ymd(row.created),
        employmentType: employmentTypeFrom([text(row.contract_time), text(row.contract_type)]),
        url: httpUrl(row.redirect_url),
      } satisfies JobListing,
    };
  }).filter((row) => row.listing.title && row.listing.url);
  return keepCompanyListings(rows, companyName, normalize).map((row) => row.listing);
}

export function createAdzunaSource(config: AdzunaConfig | null): JobSourceAdapter {
  return {
    id: "adzuna",
    configured: Boolean(config?.appId && config?.appKey),
    minIntervalMs: 2500,
    async companyJobs(input: CompanyJobsInput) {
      const url = new URL(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(input.country || "ca")}/search/1`);
      url.searchParams.set("app_id", config!.appId);
      url.searchParams.set("app_key", config!.appKey);
      url.searchParams.set("results_per_page", "50");
      url.searchParams.set("company", input.companyName);
      url.searchParams.set("max_days_old", "30");
      if (input.city) url.searchParams.set("where", input.city);
      url.searchParams.set("content-type", "application/json");
      return mapAdzuna(await fetchJson(url.toString()), input.companyName, input.normalize);
    },
  };
}
