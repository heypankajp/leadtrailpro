import { listingKey } from "@/features/opportunities/model";
import { stubCatalogue, stubListings } from "@/features/trips/providers/stub";
import type { JobSourceAdapter, SearchListingsInput, SearchPage } from "./types";

/**
 * Fixed listings for the sample companies of the trip planner's stub provider (development and tests). A keyword
 * search returns the catalogue's listings whose title, company, or business type contains a word of the keyword, in
 * the companies whose address contains the first word of the location.
 */
export function createStubSource(enabled: boolean): JobSourceAdapter {
  return {
    id: "stub",
    configured: enabled,
    minIntervalMs: 0,
    async companyJobs({ companyName }) { return stubListings(companyName); },
    async searchListings(input: SearchListingsInput): Promise<SearchPage> {
      const words = input.keyword.toLowerCase().split(/\s+/).filter((word) => word.length >= 3);
      const place = input.location.toLowerCase().split(/[\s,]+/).filter(Boolean)[0] ?? "";
      const rows = stubCatalogue()
        .filter((entry) => !place || entry.address.toLowerCase().includes(place))
        .flatMap((entry) => entry.jobs
          .filter((job) => !words.length || words.some((word) => job.title.toLowerCase().includes(word) || entry.name.toLowerCase().includes(word) || entry.types.some((type) => type.includes(word))))
          .map((job) => ({ company: entry.name, listing: job, sourceKey: listingKey("stub", job) })));
      return { rows: input.page === 1 ? rows : [], hasMore: false, nextPageToken: null };
    },
  };
}
