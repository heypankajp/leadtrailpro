import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultJobSources, eligibleSources, employmentTypeFrom, isCacheFresh, keepCompanyListings, normalizeJobSources, sourceNote } from "../../src/features/jobs/model.ts";
import { mapAdzuna } from "../../src/features/jobs/sources/adzuna.ts";
import { mapHasData } from "../../src/features/jobs/sources/hasdata.ts";
import { mapJSearch } from "../../src/features/jobs/sources/jsearch.ts";
import { cityOf } from "../../src/features/jobs/sources/types.ts";

const usage = (today = 0, month = 0) => ({ today, month, failuresToday: 0 });

describe("job-listing sources (TRIP-06, SPEC §7.13)", () => {
  test("settings normalise with defaults, unknown sources rejected, order completed", () => {
    const ok = normalizeJobSources({ order: ["hasdata", "adzuna"], budgets: { adzuna: { daily: 100 } }, cacheHours: 48 });
    assert.equal(ok.error, null);
    assert.deepEqual(ok.jobSources.order, ["hasdata", "adzuna", "jsearch", "generic", "stub"]);
    assert.equal(ok.jobSources.budgets.adzuna.daily, 100);
    assert.equal(ok.jobSources.budgets.adzuna.monthly, defaultJobSources.budgets.adzuna.monthly);
    assert.equal(ok.jobSources.cacheHours, 48);
    assert.equal(ok.jobSources.prefetch, defaultJobSources.prefetch);
    assert.match(normalizeJobSources({ order: ["indeed"] }).error, /Unknown job source/);
    assert.match(normalizeJobSources({ budgets: { jsearch: { daily: -1 } } }).error, /whole numbers/);
    assert.match(normalizeJobSources({ cacheHours: 0 }).error, /Cache hours/);
  });

  test("routing skips unconfigured, disabled, and over-budget sources and keeps the order", () => {
    const settings = normalizeJobSources({ order: ["adzuna", "jsearch", "hasdata"], budgets: { jsearch: { enabled: false }, hasdata: { daily: 5, monthly: 50 } } }).jobSources;
    const statuses = [
      { id: "adzuna", configured: false, usage: usage() },
      { id: "jsearch", configured: true, usage: usage() },
      { id: "hasdata", configured: true, usage: usage(2, 10) },
      { id: "generic", configured: true, usage: usage() },
      { id: "stub", configured: true, usage: usage() },
    ];
    assert.deepEqual(eligibleSources(settings, statuses), ["hasdata", "generic", "stub"]);
    statuses[2].usage = usage(5, 10);
    assert.deepEqual(eligibleSources(settings, statuses), ["generic", "stub"]);
    assert.match(sourceNote("adzuna", settings, statuses[0]), /Not configured: set ADZUNA_APP_ID/);
    assert.equal(sourceNote("jsearch", settings, statuses[1]), "Switched off.");
    assert.equal(sourceNote("hasdata", settings, statuses[2]), "Daily budget spent.");
    assert.equal(sourceNote("generic", settings, statuses[3]), null);
  });

  test("cache freshness and employment types", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    assert.equal(isCacheFresh("2026-10-26T00:00:00Z", 24, now), true);
    assert.equal(isCacheFresh("2026-10-25T11:00:00Z", 24, now), false);
    assert.equal(isCacheFresh(null, 24, now), false);
    assert.equal(employmentTypeFrom(["Hybrid work", "Full-time"]), "Full-time");
    assert.equal(employmentTypeFrom(["FULLTIME"]), "Full-time");
    assert.equal(employmentTypeFrom(["part_time"]), "Part-time");
    assert.equal(employmentTypeFrom(["Remote"]), null);
    assert.equal(cityOf("7555 Tranmere Dr, Mississauga, ON L5S 1J5"), "Mississauga");
    assert.equal(cityOf("Toronto"), "Toronto");
  });

  test("listings are kept only for the company asked about", () => {
    const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/ (inc|ltd)$/, "");
    const rows = [{ company: "Trans Plus Inc.", t: 1 }, { company: "Trans Plus Logistics", t: 2 }, { company: "Plus Trans", t: 3 }];
    assert.deepEqual(keepCompanyListings(rows, "Trans Plus", normalize).map((row) => row.t), [1, 2]);
  });

  test("Adzuna, JSearch, and HasData responses map to the dialog rows", () => {
    const adzuna = mapAdzuna({ results: [
      { title: "Forklift Operator", company: { display_name: "Acme Robotics" }, location: { display_name: "Mississauga, Ontario" }, created: "2026-10-20T08:00:00Z", contract_time: "full_time", redirect_url: "https://www.adzuna.ca/land/ad/1" },
      { title: "Welder", company: { display_name: "Other Co" }, location: { display_name: "Toronto" }, created: "2026-10-21T08:00:00Z", redirect_url: "https://www.adzuna.ca/land/ad/2" },
    ] }, "Acme Robotics Inc");
    assert.deepEqual(adzuna, [{ title: "Forklift Operator", source: "Adzuna", location: "Mississauga, Ontario", postedAt: "2026-10-20", employmentType: "Full-time", url: "https://www.adzuna.ca/land/ad/1" }]);

    const jsearch = mapJSearch({ data: [
      { job_title: "Dispatcher", employer_name: "Acme Robotics", job_city: "Mississauga", job_state: "ON", job_posted_at_datetime_utc: "2026-10-19T00:00:00.000Z", job_employment_type: "FULLTIME", job_apply_link: "https://ca.indeed.com/viewjob?jk=1", job_publisher: "Indeed" },
      { job_title: "Not ours", employer_name: "Zed", job_apply_link: "https://x.example/1" },
    ] }, "Acme Robotics");
    assert.deepEqual(jsearch, [{ title: "Dispatcher", source: "Indeed", location: "Mississauga, ON", postedAt: "2026-10-19", employmentType: "Full-time", url: "https://ca.indeed.com/viewjob?jk=1" }]);

    const hasdata = mapHasData({ jobs: [
      { title: "CNC Machinist", company: "Acme Robotics", location: "Mississauga, ON", details: ["Contract", "Hybrid work"], isoDate: "2026-10-18T00:00:00Z", url: "https://ca.indeed.com/viewjob?jk=2" },
      { title: "No link", company: "Acme Robotics", url: "" },
    ] }, "Acme Robotics");
    assert.deepEqual(hasdata, [{ title: "CNC Machinist", source: "Indeed", location: "Mississauga, ON", postedAt: "2026-10-18", employmentType: "Contract", url: "https://ca.indeed.com/viewjob?jk=2" }]);
  });
});
