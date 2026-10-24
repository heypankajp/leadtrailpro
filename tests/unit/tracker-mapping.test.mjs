import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canonicalBdAction, latestNonEmpty, looksLikeAddress, normalizeCompanyName, parseBdAction, parseCity, parseClientResponse, parseDate, parseEmails,
  parseLeadType, parsePhones, parseStatusCode, titleCase,
} from "../../scripts/lib/tracker-mapping.mjs";

describe("tracker import mapping (SPEC §10.9)", () => {
  test("dates from cells and from the sheet's text spellings", () => {
    assert.equal(parseDate(new Date("2025-06-04T00:00:00Z")), "2025-06-04");
    assert.equal(parseDate(new Date("2025-06-03T23:00:00Z")), "2025-06-04"); // a date read one hour off midnight
    assert.equal(parseDate("Jan/20/26"), "2026-01-20");
    assert.equal(parseDate("20/08/2025"), "2025-08-20");
    assert.equal(parseDate("2025-10-19 00:00:00"), "2025-10-19");
    assert.equal(parseDate("`11/01/21"), "2021-11-01"); // month first, as the sheet declares
    assert.equal(parseDate("11/31/21"), null);
    assert.equal(parseDate(new Date("1981-08-23T00:00:00Z")), null); // out of range: a typo in the sheet
    assert.equal(parseDate("snow season"), null);
    assert.equal(parseDate("Sept 25"), null);
    assert.equal(parseDate(""), null);
  });

  test("BD actions lose their step prefix and map to the BRD wording", () => {
    assert.deepEqual(parseBdAction("3 .Followup Call"), { step: 3, name: "Followup Call" });
    assert.deepEqual(parseBdAction("11 .Plan a Visit"), { step: 11, name: "Plan a Visit" });
    assert.deepEqual(parseBdAction("Introduction Email Sent"), { step: null, name: "Introduction Email Sent" });
    assert.equal(parseBdAction("Select Type"), null);
    assert.equal(canonicalBdAction("Cold Call"), "First Call");
    assert.equal(canonicalBdAction("Contract Clerification"), "Contract Clarification");
    assert.equal(canonicalBdAction("Waiting For Profile"), "Waiting For Profiles from Recruitment");
    assert.equal(canonicalBdAction("Meeting"), "Meeting");
    assert.equal(canonicalBdAction("Cold Call", true), "Cold Call");
    assert.equal(canonicalBdAction("Contract Clerification", true), "Contract Clarification");
  });

  test("responses, statuses, and lead types", () => {
    assert.equal(parseClientResponse("approach later"), "approach later");
    assert.equal(parseClientResponse("1 .Cold Call"), null);
    assert.equal(parseStatusCode("Client"), "client");
    assert.equal(parseStatusCode("Won"), "client");
    assert.equal(parseStatusCode(""), null);
    assert.equal(parseLeadType("Road_Trip"), "Road Trip");
    assert.equal(parseLeadType("office"), "Office");
    assert.equal(parseLeadType(null), null);
  });

  test("emails split and validate; leftovers are kept as text", () => {
    assert.deepEqual(parseEmails("anu@gelda.com / jaimala@gelda.com"), { emails: ["anu@gelda.com", "jaimala@gelda.com"], leftover: "" });
    assert.deepEqual(parseEmails("jrussell@radiantdelivers.com nahyankhan@radiantdelivers.com"), { emails: ["jrussell@radiantdelivers.com", "nahyankhan@radiantdelivers.com"], leftover: "" });
    assert.deepEqual(parseEmails("Doing interviews"), { emails: [], leftover: "Doing interviews" });
    assert.deepEqual(parseEmails("HR@Example.com."), { emails: ["hr@example.com"], leftover: "" });
  });

  test("phones come from numbers, text, and multi-value cells", () => {
    assert.deepEqual(parsePhones(5196203900), ["5196203900"]);
    assert.deepEqual(parsePhones("905-209-0955 / 1-416-887-5964 (c)"), ["905-209-0955", "1-416-887-5964 (c)"]);
    assert.deepEqual(parsePhones("1 800-265-5416 /"), ["1 800-265-5416"]);
    assert.deepEqual(parsePhones("N/A"), []);
    assert.deepEqual(parsePhones("ext 204"), ["ext 204"]);
  });

  test("addresses are told apart from comments", () => {
    assert.equal(looksLikeAddress("7555 Tranmere Dr, Mississauga, ON L5S 1J5"), true);
    assert.equal(looksLikeAddress("2425 matheson Blvd. E Mississauga,ON"), true);
    assert.equal(looksLikeAddress("Spoke to recep, said to reach out to Mike in 2 months"), false);
    assert.equal(looksLikeAddress("Scarborough / Whitby"), false);
  });

  test("company keys and merged fields", () => {
    assert.equal(normalizeCompanyName("Domino's Pizza Supply Chain "), "domino s pizza supply chain");
    assert.equal(normalizeCompanyName("The Trans Plus Inc."), "trans plus");
    assert.equal(titleCase("north york"), "North York");
    assert.equal(titleCase("st. catharines"), "St. Catharines");
    assert.equal(parseCity("Ottawa, ON"), "Ottawa");
    assert.equal(parseCity("Minesing, On"), "Minesing");
    assert.equal(parseCity("St Catherines"), "St Catharines");
    assert.equal(parseCity("north york"), "North York");
    assert.equal(parseCity("Brampton"), "Brampton");
    assert.equal(parseCity("Bolton"), "Bolton");
    assert.equal(parseCity("Minesing ON"), "Minesing");
    assert.equal(parseCity(""), "");
    const rows = [{ city: "Toronto", phone: "" }, { city: "", phone: "416" }, { city: "", phone: "" }];
    assert.equal(latestNonEmpty(rows, (row) => row.city), "Toronto");
    assert.equal(latestNonEmpty(rows, (row) => row.phone), "416");
  });
});
