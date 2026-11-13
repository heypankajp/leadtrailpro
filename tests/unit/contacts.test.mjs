import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contactKey, contactPageSize, dealCountLabel, parseContactActivity, timelineCell, timelineMonthLabel, timelineMonths, parseContactQuery, parseOrganizationInput, parsePersonInput } from "../../src/features/contacts/model.ts";

describe("Contacts (SPEC §10.13, §10.14)", () => {
  test("the request's search and page are read; anything odd falls back to the first page of everything", () => {
    assert.deepEqual(parseContactQuery(new URLSearchParams("q=%20Northern%20&page=3")), { q: "Northern", page: 3, pageSize: contactPageSize });
    assert.deepEqual(parseContactQuery(new URLSearchParams("")), { q: "", page: 1, pageSize: contactPageSize });
    for (const page of ["0", "-2", "1.5", "abc"]) assert.equal(parseContactQuery(new URLSearchParams({ page })).page, 1, page);
    assert.equal(parseContactQuery(new URLSearchParams({ q: "x".repeat(500) })).q.length, 200);
  });

  test("a contact's deals are summed up as the total and how many are still open; a new contact has none", () => {
    assert.equal(dealCountLabel(0, 0), "No deals yet");
    assert.equal(dealCountLabel(1, 1), "1 deal · open");
    assert.equal(dealCountLabel(3, 3), "3 deals · all open");
    assert.equal(dealCountLabel(3, 2), "3 deals · 2 open");
    assert.equal(dealCountLabel(1, 0), "1 deal · 0 open");
  });

  test("names are compared without case and outer spaces: the same key is one organization, or one person inside it", () => {
    assert.equal(contactKey("  Northern Fitness "), "northern fitness");
    assert.equal(contactKey("NORTHERN fitness"), contactKey("Northern Fitness"));
    assert.notEqual(contactKey("Northern Fitness Inc"), contactKey("Northern Fitness"));
  });

  test("an organization needs a name; the website must be a web address; list references are ids or nothing", () => {
    const ok = parseOrganizationInput({ name: "  Northern Fitness ", website: "https://northernfitness.example", address: "1 Main St", cityId: "12", industry: "Fitness", companySizeId: "" });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.input, { name: "Northern Fitness", website: "https://northernfitness.example", address: "1 Main St", cityId: 12, industry: "Fitness", companySizeId: null });
    assert.match(parseOrganizationInput({ name: "" }).errors.join(" "), /Enter the organization's name/);
    assert.match(parseOrganizationInput({ name: "A", website: "northernfitness.example" }).errors.join(" "), /must begin with http/);
    assert.deepEqual(parseOrganizationInput(null).input.cityId, null);
  });

  test("a person needs a name; emails come as a list or as typed text, lower-cased and without repeats; the organization may stay empty", () => {
    const typed = parsePersonInput({ name: " Adam Brooks ", organizationName: " Northern Fitness ", emails: "Adam@Northern.example, adam@northern.example; elvis@northern.example", phone: "645-697-5476" });
    assert.deepEqual(typed.errors, []);
    assert.deepEqual(typed.input, { name: "Adam Brooks", organizationName: "Northern Fitness", emails: ["adam@northern.example", "elvis@northern.example"], phone: "645-697-5476", altPhone: "", remark: "" });
    assert.deepEqual(parsePersonInput({ name: "Adam", emails: ["a@b.example"] }).input.emails, ["a@b.example"]);
    assert.equal(parsePersonInput({ name: "Adam" }).input.organizationName, "");
    assert.match(parsePersonInput({ name: "" }).errors.join(" "), /Enter the person's name/);
    assert.match(parsePersonInput({ name: "Adam", emails: "not-an-email" }).errors.join(" "), /Not an email address: not-an-email/);
  });

  test("a note on a contact needs its text; a call, an email or a visit needs a summary or notes; the time is not in the future", () => {
    const note = parseContactActivity({ type: "note", body: "  Met at the trade fair.  " });
    assert.deepEqual(note.errors, []);
    assert.deepEqual(note.input, { type: "note", summary: "", body: "Met at the trade fair.", occurredAt: null });
    assert.match(parseContactActivity({ type: "note", body: "" }).errors.join(" "), /Write the note/);
    assert.deepEqual(parseContactActivity({ type: "call", summary: "Intro call" }).errors, []);
    assert.match(parseContactActivity({ type: "call" }).errors.join(" "), /Enter a summary or notes/);
    assert.match(parseContactActivity({ type: "meeting", summary: "x" }).errors.join(" "), /Choose what to record/);
    assert.equal(parseContactActivity({ type: "visit", summary: "On site", occurredAt: "2026-11-12T15:00:00Z" }).input.occurredAt, "2026-11-12T15:00:00.000Z");
    assert.match(parseContactActivity({ type: "visit", summary: "On site", occurredAt: "2999-01-01T00:00:00Z" }).errors.join(" "), /cannot be in the future/);
    assert.match(parseContactActivity({ type: "visit", summary: "On site", occurredAt: "not a date" }).errors.join(" "), /not valid/);
  });

  test("the timeline shows twelve months ending with the current one, and a cell sums up the month", () => {
    const months = timelineMonths("2026-11-13");
    assert.equal(months.length, 12);
    assert.equal(months[0], "2025-12");
    assert.equal(months[11], "2026-11");
    assert.deepEqual(timelineMonths("2026-01-31", 3), ["2025-11", "2025-12", "2026-01"]);
    assert.equal(timelineMonthLabel("2025-12", true), "Dec 2025");
    assert.equal(timelineMonthLabel("2026-01"), "Jan 2026");
    assert.equal(timelineMonthLabel("2026-11"), "Nov");
    assert.deepEqual(timelineCell(undefined), { total: 0, text: "" });
    assert.deepEqual(timelineCell({ call: 2, note: 1 }), { total: 3, text: "2 calls, 1 note" });
    assert.deepEqual(timelineCell({ email: 1, visit: 0 }), { total: 1, text: "1 email" });
  });
});
