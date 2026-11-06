import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { MapsBudgetError, defaultMapsSettings, mapsAlert, mapsSkuNote, monthKeyOf, nextResetYmd, normalizeMapsSettings, reachedThresholds, thresholdUnits } from "../../src/features/maps/model.ts";
import { createGoogleProvider } from "../../src/features/trips/providers/google.ts";

const usage = (month = 0, today = 0) => ({ month, today, failuresToday: 0 });

describe("Google Maps usage meter (SPEC §10.8)", () => {
  test("settings normalise with defaults under the free allowance and reject bad values", () => {
    const ok = normalizeMapsSettings({ budgets: { places_text_search: 500 }, warnAtPercent: 70 });
    assert.equal(ok.error, null);
    assert.equal(ok.maps.budgets.places_text_search, 500);
    assert.equal(ok.maps.budgets.geocoding, defaultMapsSettings.budgets.geocoding);
    assert.equal(ok.maps.warnAtPercent, 70);
    assert.deepEqual(normalizeMapsSettings({}).maps, defaultMapsSettings);
    assert.ok(defaultMapsSettings.budgets.places_text_search < 1000 && defaultMapsSettings.budgets.geocoding < 10000 && defaultMapsSettings.budgets.route_matrix < 10000);
    assert.match(normalizeMapsSettings({ budgets: { geocoding: -1 } }).error, /Geocoding/);
    assert.match(normalizeMapsSettings({ budgets: { route_matrix: 1.5 } }).error, /Route matrix/);
    assert.match(normalizeMapsSettings({ warnAtPercent: 0 }).error, /warning level/);
    assert.match(normalizeMapsSettings({ warnAtPercent: 101 }).error, /warning level/);
  });

  test("levels, notes, and the monthly period", () => {
    assert.equal(thresholdUnits(900, 80), 720);
    assert.equal(thresholdUnits(3, 80), 3);
    assert.deepEqual(reachedThresholds(719, 900, 80), []);
    assert.deepEqual(reachedThresholds(720, 900, 80), [80]);
    assert.deepEqual(reachedThresholds(900, 900, 80), [80, 100]);
    assert.deepEqual(reachedThresholds(5, 900, 100), []);
    assert.deepEqual(reachedThresholds(900, 900, 100), [100]);
    assert.deepEqual(reachedThresholds(50, 0, 80), []);
    assert.equal(mapsSkuNote(900, usage(100), 80), null);
    assert.equal(mapsSkuNote(900, usage(720), 80), "80% of the monthly budget used.");
    assert.equal(mapsSkuNote(900, usage(900), 80), "Monthly budget spent (900 of 900).");
    assert.equal(mapsSkuNote(0, usage(0), 80), "Switched off (monthly budget 0).");
    assert.equal(monthKeyOf(new Date("2026-11-06T23:30:00Z")), "2026-11");
    assert.equal(nextResetYmd(new Date("2026-11-06T23:30:00Z")), "2026-12-01");
    assert.equal(nextResetYmd(new Date("2026-12-31T12:00:00Z")), "2027-01-01");
    const warning = mapsAlert("places_text_search", 80, 720, 900, "2026-12-01");
    assert.match(warning.title, /80% of the monthly budget for Places text search used \(720 of 900 calls\)/);
    assert.match(warning.body, /180 calls remain until the counters reset on 2026-12-01/);
    const spent = mapsAlert("route_matrix", 100, 9000, 9000, "2026-12-01");
    assert.match(spent.title, /budget for Route matrix is spent/);
    assert.match(spent.body, /km radius still work/);
    assert.match(new MapsBudgetError("geocoding", 1, 0, 9000).message, /is spent: this search needs 1 calls and 0 of 9000 remain/);
  });
});

/** A fake Google: geocoding, two pages of places near the origin, and a route matrix with a 10-minute drive to each. */
function fakeGoogle(log) {
  return async (url, init) => {
    const text = String(url);
    log.push({ url: text, body: init?.body ? JSON.parse(init.body) : null });
    if (text.includes("/geocode/")) return Response.json({ status: "OK", results: [{ geometry: { location: { lat: 43.6, lng: -79.4 } } }] });
    if (text.includes("places:searchText")) {
      const page = init.body.includes("pageToken") ? 2 : 1;
      if (page === 1) return Response.json({ places: [{ id: "p1", displayName: { text: "Alpha Metal" }, location: { latitude: 43.61, longitude: -79.41 } }, { id: "p2", displayName: { text: "Beta Foods" }, location: { latitude: 43.62, longitude: -79.42 } }], nextPageToken: "page-2" });
      return Response.json({ places: [{ id: "p3", displayName: { text: "Gamma Plastics" }, location: { latitude: 43.63, longitude: -79.43 } }] });
    }
    if (text.includes("computeRouteMatrix")) {
      const count = JSON.parse(init.body).destinations.length;
      return Response.json(Array.from({ length: count }, (_, index) => ({ originIndex: 0, destinationIndex: index, condition: "ROUTE_EXISTS", duration: "600s" })));
    }
    return new Response("not found", { status: 404 });
  };
}

/** Like the database-backed meter: what a call records lowers what remains for the next one. */
function fakeMeter(remaining) {
  const recorded = [];
  return {
    recorded,
    remaining: async (sku) => ({ remaining: remaining[sku] ?? 1000, budget: 1000 }),
    record: async (sku, units, failed) => { recorded.push({ sku, units, failed }); remaining[sku] = (remaining[sku] ?? 1000) - units; },
  };
}

describe("Google adapter inside the usage meter", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  test("counts geocoding, each places page, and one route element per company", async () => {
    const log = [];
    globalThis.fetch = fakeGoogle(log);
    const meter = fakeMeter({});
    const provider = createGoogleProvider({ mapsKey: "k", meter });
    const origin = await provider.geocode("1 Dundas St W, Toronto");
    assert.deepEqual(origin, { latitude: 43.6, longitude: -79.4 });
    assert.ok(log[0].url.includes("key=k"), "the Geocoding API reads the key from the query, not the header");
    const companies = await provider.searchCompanies({ origin, radiusType: "minutes", radius: 20, businessType: null, limit: 5 });
    assert.deepEqual(companies.map((company) => company.name), ["Alpha Metal", "Beta Foods", "Gamma Plastics"]);
    assert.ok(companies.every((company) => company.driveMinutes === 10));
    assert.deepEqual(meter.recorded, [
      { sku: "geocoding", units: 1, failed: false },
      { sku: "places_text_search", units: 1, failed: false },
      { sku: "places_text_search", units: 1, failed: false },
      { sku: "route_matrix", units: 3, failed: false },
    ]);
  });

  test("a km radius spends no route elements and a later page is skipped when the budget cannot cover it", async () => {
    const log = [];
    globalThis.fetch = fakeGoogle(log);
    const meter = fakeMeter({ places_text_search: 1 });
    const provider = createGoogleProvider({ mapsKey: "k", meter });
    const companies = await provider.searchCompanies({ origin: { latitude: 43.6, longitude: -79.4 }, radiusType: "km", radius: 10, businessType: null, limit: 5 });
    assert.deepEqual(companies.map((company) => company.name), ["Alpha Metal", "Beta Foods"]);
    assert.deepEqual(meter.recorded, [{ sku: "places_text_search", units: 1, failed: false }]);
    assert.equal(log.filter((entry) => entry.url.includes("computeRouteMatrix")).length, 0);
  });

  test("refuses the first page, the geocode, or a route matrix the budget cannot cover before spending anything", async () => {
    const log = [];
    globalThis.fetch = fakeGoogle(log);
    const origin = { latitude: 43.6, longitude: -79.4 };
    await assert.rejects(createGoogleProvider({ mapsKey: "k", meter: fakeMeter({ geocoding: 0 }) }).geocode("anywhere"), (error) => error instanceof MapsBudgetError && error.sku === "geocoding");
    await assert.rejects(createGoogleProvider({ mapsKey: "k", meter: fakeMeter({ places_text_search: 0 }) }).searchCompanies({ origin, radiusType: "km", radius: 10, businessType: null, limit: 5 }), (error) => error instanceof MapsBudgetError && error.sku === "places_text_search");
    const routes = fakeMeter({ route_matrix: 2 });
    await assert.rejects(createGoogleProvider({ mapsKey: "k", meter: routes }).searchCompanies({ origin, radiusType: "minutes", radius: 20, businessType: null, limit: 5 }), (error) => error instanceof MapsBudgetError && error.sku === "route_matrix" && error.needed === 3 && error.remaining === 2);
    assert.equal(log.filter((entry) => entry.url.includes("computeRouteMatrix")).length, 0);
    assert.equal(log.filter((entry) => entry.url.includes("geocode")).length, 0);
    assert.deepEqual(routes.recorded.map((entry) => entry.sku), ["places_text_search", "places_text_search"]);
  });

  test("a refused Google call is still counted, as a failure; without a meter nothing is counted", async () => {
    globalThis.fetch = async () => Response.json({ error: { message: "API key not valid", status: "INVALID_ARGUMENT" } }, { status: 400 });
    const meter = fakeMeter({});
    await assert.rejects(createGoogleProvider({ mapsKey: "bad", meter }).geocode("anywhere"), /API key not valid/);
    assert.deepEqual(meter.recorded, [{ sku: "geocoding", units: 1, failed: true }]);
    globalThis.fetch = fakeGoogle([]);
    assert.deepEqual(await createGoogleProvider({ mapsKey: "k" }).geocode("anywhere"), { latitude: 43.6, longitude: -79.4 });
  });
});
