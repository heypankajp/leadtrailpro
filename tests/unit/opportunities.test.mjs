import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  decideCompany, defaultOpportunitySettings, groupByCompany, indeedKeyword, isOpportunityRunDue, listingKey, normalizeOpportunitySettings, parseSearchInput, parseTitles, reasonScopeFor,
} from "../../src/features/opportunities/model.ts";
import { normalizeCompanyName } from "../../src/features/trips/matching.ts";
import { jsearchDatePosted } from "../../src/features/jobs/sources/jsearch.ts";

const listing = (title, url, location = "Mississauga, ON") => ({ title, source: "Test", location, postedAt: null, employmentType: null, url });

describe("Leads inbox rules", () => {
  test("schedule settings: defaults, validation, days deduped and sorted", () => {
    assert.deepEqual(normalizeOpportunitySettings(undefined), { settings: defaultOpportunitySettings, error: null });
    assert.deepEqual(normalizeOpportunitySettings({ days: [5, 1, 5], time: "07:00", maxListings: 300, enabled: false, notify: false, sources: ["hasdata", "hasdata"] }).settings, { enabled: false, days: [1, 5], time: "07:00", maxListings: 300, notify: false, sources: ["hasdata"], defaultTitles: defaultOpportunitySettings.defaultTitles, defaultLocation: "Ontario", postedWithinDays: 30 });
    assert.deepEqual(normalizeOpportunitySettings({ defaultTitles: "Baker\n baker , Pastry Chef", defaultLocation: " Peel ", postedWithinDays: "14" }).settings.defaultTitles, ["Baker", "Pastry Chef"]);
    assert.equal(normalizeOpportunitySettings({ defaultLocation: " Peel " }).settings.defaultLocation, "Peel");
    assert.equal(normalizeOpportunitySettings({ postedWithinDays: "14" }).settings.postedWithinDays, 14);
    assert.match(normalizeOpportunitySettings({ postedWithinDays: 0 }).error, /between 1 and 90/);
    assert.match(normalizeOpportunitySettings({ defaultTitles: Array.from({ length: 11 }, (_, i) => `t${i}`) }).error, /Up to 10/);
    assert.match(normalizeOpportunitySettings({ sources: [] }).error, /at least one/);
    assert.match(normalizeOpportunitySettings({ sources: ["indeed"] }).error, /from the list/);
    assert.match(normalizeOpportunitySettings({ time: "7am" }).error, /HH:MM/);
    assert.match(normalizeOpportunitySettings({ days: [7] }).error, /weekday/);
    assert.match(normalizeOpportunitySettings({ maxListings: 5 }).error, /between 20 and 1000/);
  });

  test("a run is due on a configured day once the time has passed in the business time zone", () => {
    const settings = { ...defaultOpportunitySettings, days: [1, 3], time: "06:30" };
    const monday = "2026-11-09";
    assert.equal(isOpportunityRunDue(settings, new Date("2026-11-09T12:00:00Z"), "America/Toronto", monday), true); // 07:00 Toronto
    assert.equal(isOpportunityRunDue(settings, new Date("2026-11-09T11:00:00Z"), "America/Toronto", monday), false); // 06:00 Toronto
    assert.equal(isOpportunityRunDue(settings, new Date("2026-11-10T12:00:00Z"), "America/Toronto", "2026-11-10"), false); // Tuesday
    assert.equal(isOpportunityRunDue({ ...settings, enabled: false }, new Date("2026-11-09T12:00:00Z"), "America/Toronto", monday), false);
  });

  test("search input: titles, window, trimmed, validated, optional cap", () => {
    const ok = parseSearchInput({ name: " Bakery staff ", titles: ["baker", " Pastry Chef ", "baker"], location: "Mississauga, ON", postedWithinDays: "14", jobType: "full_time", maxListings: "", active: true });
    assert.deepEqual(ok, { input: { name: "Bakery staff", titles: ["baker", "Pastry Chef"], location: "Mississauga, ON", postedWithinDays: 14, jobType: "full_time", maxListings: null, active: true }, errors: [] });
    const bad = parseSearchInput({ name: "", titles: [], jobType: "gig", postedWithinDays: 400, maxListings: 5 });
    assert.deepEqual(bad.errors, ["Give the search a name.", "Enter at least one job title.", "Posted within must be between 1 and 90 days.", "Choose a job type from the list.", "Listings per run must be between 20 and 1000, or empty for the default."]);
    assert.equal(parseSearchInput({ name: "x", titles: ["y"] }).input.active, true);
    assert.equal(parseSearchInput({ name: "x", titles: ["y"] }).input.postedWithinDays, 30);
    // An older client sending a bare keyword still works: it becomes the single title.
    assert.deepEqual(parseSearchInput({ name: "x", keyword: "baker" }).input.titles, ["baker"]);
    assert.deepEqual(parseSearchInput({ name: "x", titles: "baker, pastry chef" }).input.titles, ["baker", "pastry chef"]);
  });

  test("titles become one Indeed query: a single title as typed, several joined with OR and phrases quoted", () => {
    assert.equal(indeedKeyword(["baker"]), "baker");
    assert.equal(indeedKeyword(["forklift operator"]), "forklift operator");
    assert.equal(indeedKeyword(["Forklift Operator", "Baker", '"Line Cook"']), '"Forklift Operator" OR Baker OR "Line Cook"');
    assert.equal(indeedKeyword([]), "");
    assert.deepEqual(parseTitles("a\n\n b ,A"), ["a", "b"]);
    assert.equal(jsearchDatePosted(1), "today");
    assert.equal(jsearchDatePosted(3), "3days");
    assert.equal(jsearchDatePosted(7), "week");
    assert.equal(jsearchDatePosted(30), "month");
  });

  test("listing key: the source's job id, else the URL without tracking parameters", () => {
    assert.equal(listingKey("adzuna", { url: "https://x.example/a?utm_source=mail&id=1" }, "123"), "adzuna:123");
    assert.equal(listingKey("adzuna", { url: "https://x.example/a?utm_source=mail&id=1" }), "adzuna:https://x.example/a?id=1");
    assert.equal(listingKey("stub", { url: "not a url" }), "stub:not a url");
  });

  test("grouping: one group per normalised company, listings deduped on key, biggest first", () => {
    const groups = groupByCompany([
      { source: "adzuna", company: "Lakeshore Bakery Co.", listing: listing("Baker", "https://a/1"), sourceKey: "adzuna:1" },
      { source: "hasdata", company: "Lakeshore Bakery Co", listing: listing("Pastry chef", "https://b/2", ""), sourceKey: "hasdata:2" },
      { source: "hasdata", company: "Lakeshore Bakery Co", listing: listing("Pastry chef", "https://b/2"), sourceKey: "hasdata:2" },
      { source: "adzuna", company: "Vertex Manufacturing Inc.", listing: listing("Welder", "https://a/3", "Brampton, ON"), sourceKey: "adzuna:3" },
      { source: "adzuna", company: "", listing: listing("Orphan", "https://a/4"), sourceKey: "adzuna:4" },
      { source: "adzuna", company: "No link", listing: listing("Broken", ""), sourceKey: "adzuna:5" },
    ], normalizeCompanyName);
    assert.deepEqual(groups.map((group) => [group.key, group.company, group.location, group.listings.length]), [
      ["lakeshore bakery", "Lakeshore Bakery Co.", "Mississauga, ON", 2],
      ["vertex manufacturing", "Vertex Manufacturing Inc.", "Brampton, ON", 1],
    ]);
  });

  test("decision: a live deal or client takes the listings; closed, archived, or absent deals leave the company in the pool", () => {
    const live = { id: 7, recordState: "active", statusCode: "warm" };
    const client = { id: 8, recordState: "active", statusCode: "client" };
    const lost = { id: 9, recordState: "active", statusCode: "lost" };
    const archived = { id: 10, recordState: "archived", statusCode: "cold" };
    assert.deepEqual(decideCompany(null, live, null), { action: "attach", leadId: 7 });
    assert.deepEqual(decideCompany(null, null, client), { action: "attach", leadId: 8 });
    assert.deepEqual(decideCompany(null, null, null), { action: "pool", revived: false, matchedLeadId: null });
    assert.deepEqual(decideCompany(null, lost, null), { action: "pool", revived: false, matchedLeadId: 9 });
    assert.deepEqual(decideCompany({ status: "converted", reasonScope: null, leadId: 10, matchedLeadId: null }, null, archived), { action: "pool", revived: true, matchedLeadId: 10 });
    assert.deepEqual(decideCompany({ status: "new", reasonScope: null, leadId: null, matchedLeadId: 9 }, null, null), { action: "pool", revived: false, matchedLeadId: 9 });
  });

  test("decision: not relevant stays hidden for a company reason and returns for a role reason", () => {
    assert.deepEqual(decideCompany({ status: "not_relevant", reasonScope: "company", leadId: null, matchedLeadId: null }, null, null), { action: "silent" });
    assert.deepEqual(decideCompany({ status: "not_relevant", reasonScope: "role", leadId: null, matchedLeadId: null }, null, null), { action: "pool", revived: true, matchedLeadId: null });
    assert.deepEqual(decideCompany({ status: "not_relevant", reasonScope: "company", leadId: null, matchedLeadId: null }, { id: 3, recordState: "active", statusCode: "hot" }, null), { action: "attach", leadId: 3 });
    assert.equal(reasonScopeFor("position_not_relevant"), "role");
    assert.equal(reasonScopeFor("existing_client"), "company");
    assert.equal(reasonScopeFor(null), "company");
  });
});
