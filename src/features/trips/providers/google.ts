import { haversineKm } from "../matching.ts";
import type { CompanyCandidate, CompanySearchInput, GeoPoint, TripProvider } from "./types.ts";
import { MapsBudgetError, type MapsMeter, type MapsSkuId } from "../../maps/model.ts";

/**
 * Google Maps Platform adapter on the current (non-legacy) services, needs MAPS_API_KEY with these APIs enabled on
 * the Cloud project: Geocoding API, Places API (New), Routes API.
 *
 *   geocode          GET  maps.googleapis.com/maps/api/geocode/json?key=          (Geocoding SKU, 10,000 free a month; legacy service, key in the query)
 *   searchCompanies  POST places.googleapis.com/v1/places:searchText              (Text Search; the field mask asks for
 *                    website and phone, which makes each page an Enterprise call, 1,000 free a month, but saves one
 *                    Place Details call per company)
 *   drive minutes    POST routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix (Compute Route Matrix Essentials,
 *                    10,000 free elements a month, one element per destination)
 *
 * The legacy Places Text Search / Place Details / Distance Matrix endpoints used until November 4, 2026 cannot be
 * enabled on Google Cloud projects created after October 2026. The mapping functions are pure and unit-tested with
 * responses shaped like Google's documentation; the live calls are exercised with `npm run maps:test`.
 * Job listings come from the job-sources layer (features/jobs, SPEC §7.13).
 *
 * Every call runs through the optional usage meter (features/maps): refused when the month's budget for its SKU cannot
 * cover it, counted afterwards. The first places page, the geocode, and the whole route matrix are checked before
 * anything is spent; later places pages are optional and simply stop when the budget runs out.
 */

type GoogleConfig = { mapsKey: string; /** Counts and limits the calls per month; absent in `npm run maps:test`. */ meter?: MapsMeter | null };

/** Keyword rules per Admin business-type code; unknown codes fall back to the type's display name. */
const keywords: Record<string, string> = {
  manufacturing: "manufacturing company",
  warehouse_distribution: "warehouse distribution center",
  bakery_food_manufacturing: "bakery food manufacturer",
  any: "company",
};

/** Text Search response fields; `websiteUri` and `nationalPhoneNumber` lift the call to the Enterprise SKU. */
export const placesFieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.websiteUri,places.nationalPhoneNumber,nextPageToken";
export const routeMatrixFieldMask = "originIndex,destinationIndex,duration,condition,status";
/** Compute Route Matrix allows 625 elements per request; one origin times this many destinations stays well inside. */
const routeMatrixBatch = 100;

export type FoundPlace = { name: string; address: string; latitude: number; longitude: number; placeId: string; website: string; phone: string };

/** Pure mapping of a `places:searchText` response. Closed or unlocated places are dropped. */
export function mapPlacesSearch(data: Record<string, unknown>): { places: FoundPlace[]; nextPageToken: string | null } {
  type Place = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; businessStatus?: string; websiteUri?: string; nationalPhoneNumber?: string };
  const places: FoundPlace[] = [];
  for (const place of (Array.isArray(data.places) ? data.places : []) as Place[]) {
    const name = place.displayName?.text?.trim();
    const { latitude, longitude } = place.location ?? {};
    if (!place.id || !name || typeof latitude !== "number" || typeof longitude !== "number") continue;
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;
    places.push({ name, address: place.formattedAddress ?? "", latitude, longitude, placeId: place.id, website: place.websiteUri ?? "", phone: place.nationalPhoneNumber ?? "" });
  }
  return { places, nextPageToken: typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : null };
}

/**
 * Pure mapping of a `computeRouteMatrix` response (an unordered array of elements) to whole minutes per destination;
 * null where no route exists or the element is missing. Durations arrive as strings like "1234s".
 */
export function mapRouteMatrix(data: unknown, destinationCount: number): (number | null)[] {
  type Element = { originIndex?: number; destinationIndex?: number; duration?: string; condition?: string };
  const minutes: (number | null)[] = Array.from({ length: destinationCount }, () => null);
  for (const element of (Array.isArray(data) ? data : []) as Element[]) {
    const index = element.destinationIndex ?? -1;
    if (index < 0 || index >= destinationCount || (element.originIndex ?? 0) !== 0) continue;
    if (element.condition && element.condition !== "ROUTE_EXISTS") continue;
    const seconds = typeof element.duration === "string" ? Number.parseFloat(element.duration) : Number.NaN;
    if (Number.isFinite(seconds)) minutes[index] = Math.round(seconds / 60);
  }
  return minutes;
}

async function googleJson(url: string, init: RequestInit & { fieldMask?: string }, key: string): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Goog-Api-Key": key };
  if (init.fieldMask) headers["X-Goog-FieldMask"] = init.fieldMask;
  const response = await fetch(url, { method: init.method ?? "GET", body: init.body, headers, cache: "no-store" });
  if (!response.ok) {
    // Google explains refusals in the body ("Places API (New) has not been used in project …", "API key not valid").
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string; status?: string }; error_message?: string; status?: string };
      detail = body.error?.message ?? body.error_message ?? body.error?.status ?? body.status ?? "";
    } catch { /* no JSON body */ }
    throw new Error(`Provider request failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return response.json();
}

export function createGoogleProvider(config: GoogleConfig): TripProvider {
  /** Runs one Google call inside the usage meter: refused when the month's budget cannot cover `units`, counted afterwards (failures too). */
  async function metered<T>(sku: MapsSkuId, units: number, work: () => Promise<T>): Promise<T> {
    const meter = config.meter;
    if (!meter) return work();
    const { remaining, budget } = await meter.remaining(sku);
    if (remaining < units) throw new MapsBudgetError(sku, units, remaining, budget);
    let failed = false;
    try {
      return await work();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await meter.record(sku, units, failed).catch(() => undefined);
    }
  }

  async function driveMinutes(origin: GeoPoint, targets: GeoPoint[]): Promise<(number | null)[]> {
    const out: (number | null)[] = [];
    if (!targets.length) return out;
    // The whole matrix is checked against the budget first, so a search never spends part of it and then stops.
    if (config.meter) {
      const { remaining, budget } = await config.meter.remaining("route_matrix");
      if (remaining < targets.length) throw new MapsBudgetError("route_matrix", targets.length, remaining, budget);
    }
    const waypoint = (point: GeoPoint) => ({ waypoint: { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } } });
    for (let start = 0; start < targets.length; start += routeMatrixBatch) {
      const batch = targets.slice(start, start + routeMatrixBatch);
      const data = await metered("route_matrix", batch.length, () => googleJson("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        fieldMask: routeMatrixFieldMask,
        body: JSON.stringify({ origins: [waypoint(origin)], destinations: batch.map(waypoint), travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
      }, config.mapsKey));
      out.push(...mapRouteMatrix(data, batch.length));
    }
    return out;
  }

  return {
    name: "google",
    async geocode(address) {
      // The Geocoding API is a legacy web service: it reads the key only from the `key` parameter, not the header the newer APIs accept.
      const data = (await metered("geocoding", 1, () => googleJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(config.mapsKey)}`, {}, config.mapsKey))) as Record<string, unknown>;
      if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Geocoding failed: ${String(data.error_message ?? data.status)}`);
      const first = (data.results as { geometry?: { location?: { lat: number; lng: number } } }[] | undefined)?.[0];
      const location = first?.geometry?.location;
      return location ? { latitude: location.lat, longitude: location.lng } : null;
    },
    async searchCompanies(input: CompanySearchInput): Promise<CompanyCandidate[]> {
      const code = input.businessType?.code ?? "any";
      const keyword = keywords[code] ?? input.businessType?.value ?? "company";
      // Driving-minute searches start from a generous straight-line radius and are trimmed by the route matrix below.
      const radiusMetres = Math.min(50_000, Math.round((input.radiusType === "km" ? input.radius : input.radius * 0.9) * 1000));
      const found: FoundPlace[] = [];
      let pageToken: string | null = null;
      for (let page = 0; page < 3 && found.length < input.limit * 2; page += 1) {
        const body: Record<string, unknown> = {
          textQuery: keyword,
          pageSize: 20,
          locationBias: { circle: { center: { latitude: input.origin.latitude, longitude: input.origin.longitude }, radius: radiusMetres } },
        };
        if (pageToken) body.pageToken = pageToken;
        let data: Record<string, unknown>;
        try {
          data = (await metered("places_text_search", 1, () => googleJson("https://places.googleapis.com/v1/places:searchText", { method: "POST", fieldMask: placesFieldMask, body: JSON.stringify(body) }, config.mapsKey))) as Record<string, unknown>;
        } catch (error) {
          // Later pages are optional: when the budget cannot cover another one, the companies found so far are used.
          if (page > 0 && error instanceof MapsBudgetError) break;
          throw error;
        }
        const mapped = mapPlacesSearch(data);
        found.push(...mapped.places);
        pageToken = mapped.nextPageToken;
        if (!pageToken) break;
      }
      const withDistance = found
        .map((place) => ({ ...place, distanceKm: Math.round(haversineKm(input.origin, place) * 10) / 10 }))
        .filter((place) => input.radiusType === "minutes" || place.distanceKm <= input.radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      const minutes = input.radiusType === "minutes" ? await driveMinutes(input.origin, withDistance) : withDistance.map(() => null);
      return withDistance
        .map((place, index) => ({ ...place, driveMinutes: minutes[index] }))
        .filter((place) => input.radiusType === "km" || (place.driveMinutes !== null && place.driveMinutes <= input.radius))
        .slice(0, input.limit);
    },
  };
}
