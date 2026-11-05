import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapPlacesSearch, mapRouteMatrix, placesFieldMask, routeMatrixFieldMask } from "../../src/features/trips/providers/google.ts";

describe("Google trip provider mappings", () => {
  test("Places API (New) text search: keeps operating, located places with contact fields and the page token", () => {
    const { places, nextPageToken } = mapPlacesSearch({
      places: [
        { id: "ChIJ1", displayName: { text: "Northgate Packaging", languageCode: "en" }, formattedAddress: "1 Dixie Rd, Mississauga, ON", location: { latitude: 43.6, longitude: -79.6 }, businessStatus: "OPERATIONAL", websiteUri: "https://northgate.example", nationalPhoneNumber: "(905) 555-0100" },
        { id: "ChIJ2", displayName: { text: "Closed Foods" }, location: { latitude: 43.7, longitude: -79.7 }, businessStatus: "CLOSED_PERMANENTLY" },
        { id: "ChIJ3", displayName: { text: "No Location Ltd" }, formattedAddress: "somewhere" },
        { displayName: { text: "No id" }, location: { latitude: 1, longitude: 1 } },
        { id: "ChIJ4", displayName: { text: "Minimal Metal" }, location: { latitude: 43.8, longitude: -79.8 } },
      ],
      nextPageToken: "token-2",
    });
    assert.deepEqual(places, [
      { name: "Northgate Packaging", address: "1 Dixie Rd, Mississauga, ON", latitude: 43.6, longitude: -79.6, placeId: "ChIJ1", website: "https://northgate.example", phone: "(905) 555-0100" },
      { name: "Minimal Metal", address: "", latitude: 43.8, longitude: -79.8, placeId: "ChIJ4", website: "", phone: "" },
    ]);
    assert.equal(nextPageToken, "token-2");
    assert.deepEqual(mapPlacesSearch({}), { places: [], nextPageToken: null });
    assert.deepEqual(mapPlacesSearch({ places: [], nextPageToken: "" }), { places: [], nextPageToken: null });
  });

  test("Routes API route matrix: minutes by destination index, null when no route, unordered elements", () => {
    const minutes = mapRouteMatrix([
      { originIndex: 0, destinationIndex: 2, status: {}, condition: "ROUTE_EXISTS", distanceMeters: 12000, duration: "1530s" },
      { originIndex: 0, destinationIndex: 0, status: {}, condition: "ROUTE_EXISTS", distanceMeters: 800, duration: "89.5s" },
      { originIndex: 0, destinationIndex: 1, status: { code: 5, message: "no route" }, condition: "ROUTE_NOT_FOUND" },
      { originIndex: 1, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "1s" },
      { originIndex: 0, destinationIndex: 9, condition: "ROUTE_EXISTS", duration: "60s" },
    ], 4);
    assert.deepEqual(minutes, [1, null, 26, null]);
    assert.deepEqual(mapRouteMatrix({ error: "not an array" }, 2), [null, null]);
  });

  test("field masks name the response fields the mappers read", () => {
    for (const field of ["places.id", "places.displayName", "places.location", "places.businessStatus", "places.websiteUri", "places.nationalPhoneNumber", "nextPageToken"]) assert.ok(placesFieldMask.includes(field), field);
    for (const field of ["destinationIndex", "duration", "condition"]) assert.ok(routeMatrixFieldMask.includes(field), field);
  });
});
