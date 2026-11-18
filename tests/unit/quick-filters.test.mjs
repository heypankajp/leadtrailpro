import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isQuickFilterKey, monthsBefore, quarterBefore, quarterOf, quarterRange, quickFilterKeys, quickFilterLabel, quickFilters, quickFilterStatusCodes, quickFilterText,
} from "../../src/features/leads/quick-filters.ts";

describe("ready-made and data cleanup filters (PD-30)", () => {
  test("every key has one entry, in three groups, and unknown keys are refused", () => {
    assert.deepEqual(quickFilters.map((filter) => filter.key), [...quickFilterKeys]);
    assert.equal(quickFilters.filter((filter) => filter.group === "ready").length, 3);
    assert.equal(quickFilters.filter((filter) => filter.group === "period").length, 5);
    assert.equal(quickFilters.filter((filter) => filter.group === "cleanup").length, 7);
    assert.ok(isQuickFilterKey("no_next_step"));
    assert.ok(!isQuickFilterKey("everything"));
    assert.ok(!isQuickFilterKey("old_3m"));
    assert.equal(quickFilterLabel("won", "2026-11-18"), "Won deals (clients)");
    assert.equal(quickFilterLabel(null, "2026-11-18"), null);
  });

  test("the quarter entries are named from today's date (review of November 18, 2026)", () => {
    const today = "2026-11-18";
    assert.deepEqual(["quarter_0", "quarter_1", "quarter_2", "quarter_3", "older"].map((key) => quickFilterText(key, today)), [
      "Current (Q4: Oct–Dec 2026)", "Q3: Jul–Sep 2026", "Q2: Apr–Jun 2026", "Q1: Jan–Mar 2026", "Quiet Deals (2025 & Older)",
    ]);
    assert.ok(!isQuickFilterKey("quiet"));
    // Early in a year the list reaches back into the year before.
    assert.equal(quickFilterText("quarter_0", "2027-02-01"), "Current (Q1: Jan–Mar 2027)");
    assert.equal(quickFilterText("quarter_3", "2027-02-01"), "Q2: Apr–Jun 2026");
    assert.equal(quickFilterText("older", "2027-02-01"), "Quiet Deals (before Q2 2026)");
  });

  test("quarters start on January, April, July and October 1st", () => {
    assert.deepEqual(quarterOf("2026-01-01"), { year: 2026, quarter: 1 });
    assert.deepEqual(quarterOf("2026-03-31"), { year: 2026, quarter: 1 });
    assert.deepEqual(quarterOf("2026-12-31"), { year: 2026, quarter: 4 });
    assert.deepEqual(quarterBefore("2026-01-15", 1), { year: 2025, quarter: 4 });
    assert.deepEqual(quarterBefore("2026-01-15", 5), { year: 2024, quarter: 4 });
    assert.deepEqual(quarterRange({ year: 2026, quarter: 4 }), { from: "2026-10-01", until: "2027-01-01" });
    assert.deepEqual(quarterRange({ year: 2026, quarter: 2 }), { from: "2026-04-01", until: "2026-07-01" });
  });

  test("lost and won look at closed deals; every other filter at open ones", () => {
    assert.deepEqual(quickFilterStatusCodes("lost"), { only: ["lost"], exclude: [] });
    assert.deepEqual(quickFilterStatusCodes("won"), { only: ["client"], exclude: [] });
    assert.deepEqual(quickFilterStatusCodes("no_update_12m"), { only: null, exclude: ["client", "lost", "disqualified"] });
  });

  test("months are counted back on the calendar, clamped to the month's last day", () => {
    assert.equal(monthsBefore("2026-11-16", 3), "2026-08-16");
    assert.equal(monthsBefore("2026-11-16", 12), "2025-11-16");
    assert.equal(monthsBefore("2026-05-31", 3), "2026-02-28");
    assert.equal(monthsBefore("2026-01-15", 3), "2025-10-15");
  });
});
