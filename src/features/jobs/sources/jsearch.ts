import type { JobListing } from "../../trips/model.ts";
import { employmentTypeFrom, keepCompanyListings, plainName } from "../model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type JobSourceAdapter } from "./types.ts";

/**
 * JSearch on RapidAPI (Google for Jobs results, which index many Indeed, LinkedIn, and Glassdoor postings).
 * About 200 free requests a month. `GET https://jsearch.p.rapidapi.com/search?query=&country=&date_posted=` with
 * `x-rapidapi-key` and `x-rapidapi-host` headers.
 */
export function mapJSearch(data: Record<string, unknown>, companyName: string, normalize: (name: string) => string = plainName): JobListing[] {
  const results = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
  const rows = results.map((row) => ({
    company: text(row.employer_name),
    listing: {
      title: text(row.job_title),
      source: text(row.job_publisher, 80) || "Google Jobs",
      location: [text(row.job_city, 80), text(row.job_state, 40)].filter(Boolean).join(", "),
      postedAt: ymd(row.job_posted_at_datetime_utc),
      employmentType: employmentTypeFrom([text(row.job_employment_type)]),
      url: httpUrl(row.job_apply_link) || httpUrl(row.job_google_link),
    } satisfies JobListing,
  })).filter((row) => row.listing.title && row.listing.url);
  return keepCompanyListings(rows, companyName, normalize).map((row) => row.listing);
}

export function createJSearchSource(apiKey: string | null): JobSourceAdapter {
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
      const data = await fetchJson(url.toString(), { headers: { "x-rapidapi-key": apiKey!, "x-rapidapi-host": "jsearch.p.rapidapi.com" } });
      return mapJSearch(data, input.companyName, input.normalize);
    },
  };
}
