import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fixedListKeys, listKeys, listNumber, numericListBounds, tripPlannerListKeys } from "../../src/features/list-values/model.ts";

describe("single-number lists and the Sales Trip Planner page (request of November 18, 2026)", () => {
  test("the planner's numbers are fixed lists with a range, and the page groups them with Business Type", () => {
    for (const key of ["trip_max_radius_km", "trip_max_results", "recent_trips_limit"]) {
      assert.ok(listKeys.includes(key));
      assert.ok(fixedListKeys.includes(key), `${key} holds one value`);
      assert.ok(numericListBounds[key], `${key} has a range`);
    }
    assert.deepEqual([...tripPlannerListKeys], ["trip_max_radius_km", "trip_max_results", "recent_trips_limit", "business_type"]);
    // Lead Disqualified Reason takes new values (PD-43).
    assert.ok(!fixedListKeys.includes("disqualified_reason"));
  });

  test("a number in range is used; anything else falls back", () => {
    const one = (value, active = true) => [{ value, active }];
    assert.equal(listNumber("trip_max_radius_km", one("75")), 75);
    assert.equal(listNumber("trip_max_radius_km", one("201")), 50);
    assert.equal(listNumber("trip_max_results", one("60")), 60);
    assert.equal(listNumber("trip_max_results", one("61")), 50);
    assert.equal(listNumber("trip_max_results", one("ten")), 50);
    assert.equal(listNumber("recent_trips_limit", one("12", false)), 30, "an inactive value is not used");
    assert.equal(listNumber("recent_trips_limit", undefined), 30);
  });
});

test("Lead Gen Tool: the Deal Source of deals made from Lead Generation and the Leads inbox", async () => {
  const { leadGenToolSourceId } = await import("../../src/features/list-values/model.ts");
  const source = (id, code, value, active = true) => ({ id, code, value, active });
  assert.equal(leadGenToolSourceId([source(1, "cold_call", "Cold Call"), source(5, "lead_gen_tool", "Lead Gen Tool")]), 5);
  assert.equal(leadGenToolSourceId([source(7, "custom_7", " lead gen tool ")]), 7);
  assert.equal(leadGenToolSourceId([source(5, "lead_gen_tool", "Lead Gen Tool", false)]), null);
  assert.equal(leadGenToolSourceId([source(1, "cold_call", "Cold Call")]), null);
});
