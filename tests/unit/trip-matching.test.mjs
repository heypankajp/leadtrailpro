import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { actionFor, addressKey, jaroWinkler, matchLead, normalizeCompanyName, phoneKey, registrableDomain } from "../../src/features/trips/matching.ts";

const lead = (overrides) => ({
  id: 1, clientName: "Acme Packaging Inc.", companyUrl: "https://www.acmepackaging.ca/about", contactPhone: "(905) 555-0141", contactAltPhone: "", address: "1200 Britannia Road East, Unit 4, Mississauga, ON",
  city: "Mississauga", statusCode: "warm", status: "Warm", statusLabel: "Warm", recordState: "active", lastActivityAt: "2026-10-01T00:00:00Z", ...overrides,
});

describe("company normalisation (TRIP-07)", () => {
  test("names drop punctuation, legal suffixes, and a leading 'the'", () => {
    assert.equal(normalizeCompanyName("The Acme Packaging Co., Inc."), "acme packaging");
    assert.equal(normalizeCompanyName("Fable & Stone Ltd"), "fable and stone");
    assert.equal(normalizeCompanyName("Co"), "co");
  });
  test("domains ignore scheme, www, and paths, and keep second-level public suffixes", () => {
    assert.equal(registrableDomain("https://www.Example.co.uk/about"), "example.co.uk");
    assert.equal(registrableDomain("shop.acme.ca"), "acme.ca");
    assert.equal(registrableDomain("not a url"), "");
    assert.equal(registrableDomain(""), "");
  });
  test("phones compare on their last ten digits", () => {
    assert.equal(phoneKey("+1 (905) 555-0141"), "9055550141");
    assert.equal(phoneKey("555-0141"), "");
  });
  test("addresses compare on the street number and street", () => {
    assert.equal(addressKey("225 Rexdale Blvd Unit 3, Etobicoke, ON M9W 1P7"), "225 rexdale blvd");
    assert.equal(addressKey("Unit 4, 1200 Britannia Road East, Mississauga"), "1200 britannia rd");
    assert.equal(addressKey("Mississauga, ON"), "");
  });
  test("jaro-winkler rates near-identical names highly", () => {
    assert.ok(jaroWinkler("northgate packaging", "northgate packging") > 0.9);
    assert.ok(jaroWinkler("northgate packaging", "lakeshore bakery") < 0.7);
  });
});

describe("lead matching precedence (TRIP-07)", () => {
  const leads = [
    lead({ id: 1 }),
    lead({ id: 2, clientName: "Northgate Packaging", companyUrl: "", contactPhone: "", address: "1200 Britannia Rd E, Mississauga", city: "Mississauga", statusCode: "hot", status: "Hot", statusLabel: "Hot" }),
    lead({ id: 3, clientName: "Northgate Packaging", companyUrl: "", contactPhone: "", address: "9 Other St, Brampton", city: "Brampton", recordState: "archived", statusCode: "cold", status: "Cold", statusLabel: "Cold" }),
    lead({ id: 4, clientName: "Summit Office Supply", companyUrl: "", contactPhone: "416-555-0199", address: "", city: null, statusCode: "disqualified", status: "Disqualified", statusLabel: "Disqualified – Not Interested" }),
  ];
  test("the website domain wins over everything else", () => {
    const match = matchLead({ name: "Totally Different", website: "http://acmepackaging.ca", phone: "", address: "" }, leads);
    assert.equal(match?.lead.id, 1);
    assert.equal(match?.matchedOn, "domain");
  });
  test("a phone number matches either contact number", () => {
    const match = matchLead({ name: "Unknown", website: "", phone: "+1 416 555 0199", address: "" }, leads);
    assert.deepEqual([match?.lead.id, match?.matchedOn], [4, "phone"]);
    assert.deepEqual(actionFor(match), { code: "disqualified", label: "Disqualified – Not Interested" });
  });
  test("an exact name at the same address beats an archived lead with the same name", () => {
    const match = matchLead({ name: "Northgate Packaging Inc", website: "", phone: "", address: "1200 Britannia Road E, Mississauga, ON" }, leads);
    assert.deepEqual([match?.lead.id, match?.matchedOn], [2, "name_address"]);
    assert.deepEqual(actionFor(match), { code: "hot", label: "Hot Lead" });
  });
  test("an archived lead is used only when nothing active matches", () => {
    const match = matchLead({ name: "Northgate Packaging", website: "", phone: "", address: "9 Other Street, Brampton" }, leads.filter((item) => item.id !== 2));
    assert.deepEqual([match?.lead.id, match?.matchedOn], [3, "name_address"]);
  });
  test("a lead with a city only matches by bare name when the address mentions that city", () => {
    assert.equal(matchLead({ name: "Northgate Packaging", website: "", phone: "", address: "Somewhere in Oakville" }, leads.filter((item) => item.id === 2)), null);
    assert.equal(matchLead({ name: "Northgate Packaging", website: "", phone: "", address: "Mississauga" }, leads.filter((item) => item.id === 2))?.matchedOn, "name");
  });
  test("a misspelt name at the same address still matches; no match means New / Not in CRM", () => {
    const match = matchLead({ name: "Northgate Packging", website: "", phone: "", address: "1200 Britannia Rd E" }, leads);
    assert.equal(match?.matchedOn, "similar_name_address");
    assert.deepEqual(actionFor(null), { code: "new", label: "New / Not in CRM" });
  });
});
