import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseLeadEntry } from "../../src/features/opportunities/model.ts";
import { withBdLines } from "../../scripts/lib/tracker-import.mjs";

describe("BD action and Client response move from the deal to the lead (request of November 19, 2026)", () => {
  test("the import replaces earlier lines, so one pair (the latest) is kept", () => {
    assert.equal(withBdLines("Note one\nBD Action : Old\nClient response : Old", "First Email", "Interested"), "Note one\nBD Action : First Email\nClient response : Interested");
    assert.equal(withBdLines("", "Call", null), "BD Action : Call");
    assert.equal(withBdLines(null, null, "Busy"), "Client response : Busy");
    assert.equal(withBdLines("Kept\n\n", null, null), "Kept");
  });

  test("a lead added by hand needs a company and a lead source; a website begins with http(s)://", () => {
    const { input, errors } = parseLeadEntry({ companyName: "  Acme  ", leadSourceId: "4", bdActionId: 9, clientResponseId: "", note: " Met at a fair " });
    assert.deepEqual(errors, []);
    assert.deepEqual(input, { companyName: "Acme", website: "", location: "", leadSourceId: 4, bdActionId: 9, clientResponseId: null, note: "Met at a fair", organizationId: null, personIds: [] });
    // Several contacts, once each, and only with the company (request of November 19, 2026).
    assert.deepEqual(parseLeadEntry({ companyName: "A", leadSourceId: 1, organizationId: 7, personIds: [3, "5", 3] }).input.personIds, [3, 5]);
    assert.deepEqual(parseLeadEntry({ companyName: "A", leadSourceId: 1, personIds: [3] }).errors, ["Choose the company first: contacts belong to it."]);
    assert.deepEqual(parseLeadEntry({}).errors, ["Enter the company's name.", "Choose the lead source."]);
    assert.match(parseLeadEntry({ companyName: "A", leadSourceId: 1, website: "acme.com" }).errors[0], /http/);
  });
});
