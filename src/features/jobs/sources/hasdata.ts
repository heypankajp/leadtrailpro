import type { JobListing } from "../../trips/model.ts";
import { employmentTypeFrom, keepCompanyListings, plainName } from "../model.ts";
import { fetchJson, httpUrl, text, ymd, type CompanyJobsInput, type JobSourceAdapter } from "./types.ts";

/**
 * HasData Indeed Jobs Scraper API (docs.hasdata.com/apis/indeed/listing): `x-api-key` header, 10 credits per call,
 * charged only on success. `GET https://api.hasdata.com/scrape/indeed/listing?keyword=&location=&domain=&datePosted=`.
 * The optional `domain` selects a regional Indeed site (expected `ca` for Canada; confirm on the free tier).
 */
export type HasDataConfig = { apiKey: string; domain: string | null };

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

export function mapHasData(data: Record<string, unknown>, companyName: string, normalize: (name: string) => string = plainName): JobListing[] {
  const jobs = Array.isArray(data.jobs) ? (data.jobs as Record<string, unknown>[]) : [];
  const rows = jobs.map((row) => ({
    company: text(row.company),
    listing: {
      title: text(row.title), source: "Indeed", location: text(row.location, 160),
      postedAt: ymd(row.isoDate),
      employmentType: employmentTypeFrom(Array.isArray(row.details) ? (row.details as unknown[]).map((item) => (typeof item === "string" ? item : "")) : []),
      url: httpUrl(row.url),
    } satisfies JobListing,
  })).filter((row) => row.listing.title && row.listing.url);
  return keepCompanyListings(rows, companyName, normalize).map((row) => row.listing);
}

export function createHasDataSource(config: HasDataConfig | null): JobSourceAdapter {
  return {
    id: "hasdata",
    configured: Boolean(config?.apiKey),
    minIntervalMs: 300,
    async companyJobs(input: CompanyJobsInput) {
      const url = new URL("https://api.hasdata.com/scrape/indeed/listing");
      url.searchParams.set("keyword", input.companyName);
      url.searchParams.set("location", input.city || input.address || input.country || "Canada");
      url.searchParams.set("datePosted", "14");
      const domain = hasDataDomain(config!.domain);
      if (domain) url.searchParams.set("domain", domain);
      const data = await fetchJson(url.toString(), { headers: { "x-api-key": config!.apiKey, "Content-Type": "application/json" } });
      return mapHasData(data, input.companyName, input.normalize);
    },
  };
}
