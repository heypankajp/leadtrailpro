import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isQuickFilterKey, monthsBefore, quickFilterKeys, quickFilterLabel, quickFilters, quickFilterStatusCodes } from "../../src/features/leads/quick-filters.ts";

describe("ready-made and data cleanup filters (PD-30)", () => {
  test("every key has one entry, in two groups, and unknown keys are refused", () => {
    assert.deepEqual(quickFilters.map((filter) => filter.key), [...quickFilterKeys]);
    assert.equal(quickFilters.filter((filter) => filter.group === "ready").length, 5);
    assert.equal(quickFilters.filter((filter) => filter.group === "cleanup").length, 7);
    assert.ok(isQuickFilterKey("no_next_step"));
    assert.ok(!isQuickFilterKey("everything"));
    assert.equal(quickFilterLabel("won"), "Won deals (clients)");
    assert.equal(quickFilterLabel(null), null);
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
