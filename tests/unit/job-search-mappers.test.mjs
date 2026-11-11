import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adzunaHasMore, parseAdzunaRows } from "../../src/features/jobs/sources/adzuna.ts";
import { parseGenericRows } from "../../src/features/jobs/sources/generic.ts";
import { hasDataDatePosted, hasDataNextPage, parseHasDataRows } from "../../src/features/jobs/sources/hasdata.ts";
import { parseJSearchRows } from "../../src/features/jobs/sources/jsearch.ts";

describe("Keyword search mappers of the job sources", () => {
  test("Adzuna: company, listing, id as key, and paging from the reported count", () => {
    const data = {
      count: 120,
      results: [
        { id: 123, title: "Baker", company: { display_name: "Lakeshore Bakery Co." }, location: { display_name: "Mississauga, Ontario" }, created: "2026-11-01T10:00:00Z", contract_time: "full_time", redirect_url: "https://www.adzuna.ca/land/ad/123?utm_source=x" },
        { title: "No link", company: { display_name: "Nowhere" } },
      ],
    };
    const rows = parseAdzunaRows(data);
    assert.deepEqual(rows.map((row) => [row.company, row.listing.title, row.listing.location, row.listing.postedAt, row.sourceKey]), [["Lakeshore Bakery Co.", "Baker", "Mississauga, Ontario", "2026-11-01", "adzuna:123"]]);
    assert.equal(adzunaHasMore(data, 1), true);
    assert.equal(adzunaHasMore(data, 3), false);
  });

  test("JSearch: employer, city and state, job id as key", () => {
    const rows = parseJSearchRows({ data: [
      { job_id: "abc", job_title: "Line Cook", employer_name: "Cedarline Foods", job_city: "Etobicoke", job_state: "ON", job_posted_at_datetime_utc: "2026-11-02T00:00:00.000Z", job_employment_type: "FULLTIME", job_apply_link: "https://example.com/a" },
      { job_id: "def", job_title: "", employer_name: "Blank" },
    ] });
    assert.deepEqual(rows.map((row) => [row.company, row.listing.title, row.listing.location, row.sourceKey]), [["Cedarline Foods", "Line Cook", "Etobicoke, ON", "jsearch:abc"]]);
  });

  test("HasData Indeed: company, listing, id as key, and the next-page cursor", () => {
    const data = {
      jobs: [{ id: "jk1", title: "Welder", company: "Vertex Manufacturing", location: "Brampton, ON", isoDate: "2026-11-03T08:00:00Z", details: ["Full-time"], url: "https://ca.indeed.com/viewjob?jk=jk1" }],
      pagination: { nextPage: "https://api.hasdata.com/scrape/indeed/listing?keyword=welder&start=10" },
    };
    const rows = parseHasDataRows(data);
    assert.deepEqual(rows.map((row) => [row.company, row.listing.title, row.listing.postedAt, row.sourceKey]), [["Vertex Manufacturing", "Welder", "2026-11-03", "hasdata:jk1"]]);
    assert.equal(hasDataNextPage(data), "https://api.hasdata.com/scrape/indeed/listing?keyword=welder&start=10");
    assert.equal(hasDataNextPage({ jobs: [] }), null);
  });

  test("HasData Indeed: the posted-within window is rounded down to 1, 3, 7, or 14 days", () => {
    assert.deepEqual([30, 90, 14, 13, 10, 7, 5, 3, 2, 1, 0, -4, undefined, null].map((days) => hasDataDatePosted(days)), ["14", "14", "14", "7", "7", "7", "3", "3", "1", "1", "1", "1", "14", "14"]);
  });

  test("generic contract: company and id when given, URL as the key otherwise", () => {
    const rows = parseGenericRows({ jobs: [
      { id: "g1", title: "Driver", company: "Harbourfront Logistics", url: "https://x.example/1", posted_at: "2026-11-04", employment_type: "Full time", location: "Toronto" },
      { title: "Picker", company: "Pearson Freight Centre", url: "https://x.example/2?utm_campaign=c" },
    ], has_more: true });
    assert.deepEqual(rows.map((row) => [row.company, row.listing.title, row.sourceKey]), [["Harbourfront Logistics", "Driver", "generic:g1"], ["Pearson Freight Centre", "Picker", "generic:https://x.example/2"]]);
  });
});
