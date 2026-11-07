import type { JobListing } from "../../trips/model.ts";
import { listingKey } from "../../opportunities/model.ts";
import { employmentTypeFrom, keepCompanyListings, plainName } from "../model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type FoundRow, type JobSourceAdapter, type SearchListingsInput, type SearchPage } from "./types.ts";

/**
 * JSearch on RapidAPI (Google for Jobs results, which index many Indeed, LinkedIn, and Glassdoor postings).
 * About 200 free requests a month. `GET https://jsearch.p.rapidapi.com/search?query=&country=&date_posted=&page=`
 * with `x-rapidapi-key` and `x-rapidapi-host` headers; about ten results a page.
 */
const perPage = 10;

export function parseJSearchRows(data: Record<string, unknown>): FoundRow[] {
  const results = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
  return results.map((row) => {
    const listing: JobListing = {
      title: text(row.job_title),
      source: text(row.job_publisher, 80) || "Google Jobs",
      location: [text(row.job_city, 80), text(row.job_state, 40)].filter(Boolean).join(", "),
      postedAt: ymd(row.job_posted_at_datetime_utc),
      employmentType: employmentTypeFrom([text(row.job_employment_type)]),
      url: httpUrl(row.job_apply_link) || httpUrl(row.job_google_link),
    };
    return { company: text(row.employer_name), listing, sourceKey: listingKey("jsearch", listing, text(row.job_id, 120)) };
  }).filter((row) => row.listing.title && row.listing.url);
}

export function mapJSearch(data: Record<string, unknown>, companyName: string, normalize: (name: string) => string = plainName): JobListing[] {
  return keepCompanyListings(parseJSearchRows(data), companyName, normalize).map((row) => row.listing);
}

const employmentTypes: Record<string, string> = { full_time: "FULLTIME", part_time: "PARTTIME", contract: "CONTRACTOR" };

/** JSearch only knows four windows; the search's posted-within days pick the smallest one that covers them. */
export function jsearchDatePosted(days: number): "today" | "3days" | "week" | "month" {
  if (days <= 1) return "today";
  if (days <= 3) return "3days";
  if (days <= 7) return "week";
  return "month";
}

export function createJSearchSource(apiKey: string | null): JobSourceAdapter {
  const headers = () => ({ "x-rapidapi-key": apiKey!, "x-rapidapi-host": "jsearch.p.rapidapi.com" });
  return {
    id: "jsearch",
    configured: Boolean(apiKey),
    minIntervalMs: 1000,
    async companyJobs(input: CompanyJobsInput) {
      const url = new URL("https://jsearch.p.rapidapi.com/search");
      url.searchParams.set("query", `${input.companyName} jobs${input.city ? ` in ${input.city}` : ""}`);
      url.searchParams.set("num_pages", "1");
      url.searchParams.set("date_posted", "month");
      url.searchParams.set("country", (input.country || "ca").toLowerCase());
      return mapJSearch(await fetchJson(url.toString(), { headers: headers() }), input.companyName, input.normalize);
    },
    async searchListings(input: SearchListingsInput): Promise<SearchPage> {
      const url = new URL("https://jsearch.p.rapidapi.com/search");
      url.searchParams.set("query", `${input.keyword}${input.location ? ` in ${input.location}` : ""}`);
      url.searchParams.set("page", String(input.page));
      url.searchParams.set("num_pages", "1");
      url.searchParams.set("date_posted", jsearchDatePosted(input.postedWithinDays));
      url.searchParams.set("country", (input.country || "ca").toLowerCase());
      if (employmentTypes[input.jobType]) url.searchParams.set("employment_types", employmentTypes[input.jobType]);
      const rows = parseJSearchRows(await fetchJson(url.toString(), { headers: headers() }));
      return { rows, hasMore: rows.length >= perPage, nextPageToken: null };
    },
  };
}
