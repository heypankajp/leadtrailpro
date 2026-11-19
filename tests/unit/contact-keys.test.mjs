import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { emailKey, phoneKey } from "../../src/features/contacts/model.ts";

describe("contact duplicates by email or phone (request of November 18, 2026)", () => {
  test("emails are compared without case or outer spaces", () => {
    assert.equal(emailKey("  Elena.Vasquez@Northstar.example "), "elena.vasquez@northstar.example");
  });

  test("phones are compared by their last ten digits, and only from seven digits", () => {
    assert.equal(phoneKey("+1 (416) 555-0142"), "4165550142");
    assert.equal(phoneKey("416-555-0142"), "4165550142");
    assert.equal(phoneKey("416.555.0142 ext"), "4165550142");
    assert.equal(phoneKey("555-0142"), "5550142");
    assert.equal(phoneKey("ext 204"), null);
    assert.equal(phoneKey(""), null);
  });
});
