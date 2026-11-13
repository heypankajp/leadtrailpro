import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dealCurrency, formatDealValue, maxDealValue, parseDealValue } from "../../src/features/leads/deal-value.ts";

describe("Deal value and expected close date (PD-11, SPEC §10.15)", () => {
  test("a typed amount is read with or without separators and the currency sign; empty means no value", () => {
    assert.deepEqual(parseDealValue(""), { value: null, error: null });
    assert.deepEqual(parseDealValue(null), { value: null, error: null });
    assert.deepEqual(parseDealValue("25,000"), { value: 25000, error: null });
    assert.deepEqual(parseDealValue("CA$1 200.50"), { value: 1200.5, error: null });
    assert.deepEqual(parseDealValue(500), { value: 500, error: null });
    assert.equal(parseDealValue("0").value, 0);
    assert.match(parseDealValue("about ten").error, /must be an amount/);
    assert.match(parseDealValue("-5").error, /must be an amount/);
    assert.match(parseDealValue("99999999999").error, /too large/);
  });

  test("a value is shown in the one currency, with cents only when there are any; no value shows nothing", () => {
    assert.equal(formatDealValue(82000), "CA$82,000");
    assert.equal(formatDealValue(1200.5), "CA$1,200.50");
    assert.equal(formatDealValue(0), "CA$0");
    assert.equal(formatDealValue(null), "");
    assert.equal(formatDealValue(undefined), "");
  });

  test("one currency, and a ceiling that keeps typing slips out", () => {
    assert.equal(dealCurrency, "CA$");
    assert.equal(parseDealValue(String(maxDealValue)).value, maxDealValue);
    assert.match(parseDealValue(String(maxDealValue + 1)).error, /too large/);
  });
});
