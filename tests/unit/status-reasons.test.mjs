import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { closedStatusCodes, isClosedStatus, reasonListFor, statusCodes, statusLabel } from "../../src/features/list-values/model.ts";

describe("status reasons (LEAD-06)", () => {
  test("only Lost Lead and Disqualified draw a reason from a list", () => {
    assert.equal(reasonListFor("lost"), "lost_reason");
    assert.equal(reasonListFor("disqualified"), "disqualified_reason");
    for (const code of ["cold", "warm", "hot", "client", null, undefined, "other"]) assert.equal(reasonListFor(code), null);
    assert.deepEqual(closedStatusCodes.filter((code) => isClosedStatus(code)), ["lost", "disqualified"]);
    assert.ok(closedStatusCodes.every((code) => statusCodes.includes(code)));
  });

  test("the combined label joins status and reason with an en dash", () => {
    assert.equal(statusLabel("Disqualified", "Not Interested"), "Disqualified – Not Interested");
    assert.equal(statusLabel("Lost Lead", "Pricing"), "Lost Lead – Pricing");
    assert.equal(statusLabel("Warm", null), "Warm");
    assert.equal(statusLabel("Cold", ""), "Cold");
  });
});
