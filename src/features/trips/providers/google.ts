import { haversineKm } from "../matching";
import type { JobListing } from "../model";
import type { CompanyCandidate, CompanySearchInput, GeoPoint, TripProvider } from "./types";

/**
 * Google Maps Platform adapter (Geocoding, Places Text Search, Place Details, Distance Matrix) plus a licensed
 * job-listing aggregator behind a small JSON contract. Needs MAPS_API_KEY; job listings need JOBS_API_URL and
 * JOBS_API_KEY. Written to the documented HTTP APIs and exercised only through the stub in automated tests:
 * verify against a real key before go-live (PRD open questions 9 and 10).
 *
 * Job aggregator contract: GET `${JOBS_API_URL}?company=<name>&website=<domain>&location=<address>` with
 * `Authorization: Bearer <JOBS_API_KEY>` returns `{ "jobs": [{ "title", "source", "location", "posted_at", "employment_type", "url" }] }`.
 * Any licensed source (Adzuna, SerpApi Google Jobs, JSearch, …) is wrapped by a thin service exposing that shape.
 */

type GoogleConfig = { mapsKey: string; jobsUrl: string | undefined; jobsKey: string | undefined };

/** Keyword rules per Admin business-type code; unknown codes fall back to the type's display name. */
const keywords: Record<string, string> = {
  manufacturing: "manufacturing company",
  warehouse_distribution: "warehouse distribution center",
  bakery_food_manufacturing: "bakery food manufacturer",
  any: "company",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(`Provider request failed (${response.status}).`);
  return (await response.json()) as Record<string, unknown>;
}

export function createGoogleProvider(config: GoogleConfig): TripProvider {
  const base = "https://maps.googleapis.com/maps/api";
  const jobsConfigured = Boolean(config.jobsUrl && config.jobsKey);

  async function placeDetails(placeId: string): Promise<{ website: string; phone: string }> {
    const data = await getJson(`${base}/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=website,formatted_phone_number&key=${config.mapsKey}`);
    const result = (data.result ?? {}) as { website?: string; formatted_phone_number?: string };
    return { website: result.website ?? "", phone: result.formatted_phone_number ?? "" };
  }

  async function driveMinutes(origin: GeoPoint, targets: GeoPoint[]): Promise<(number | null)[]> {
    const out: (number | null)[] = [];
    for (let start = 0; start < targets.length; start += 25) {
      const batch = targets.slice(start, start + 25);
      const destinations = batch.map((point) => `${point.latitude},${point.longitude}`).join("|");
      const data = await getJson(`${base}/distancematrix/json?origins=${origin.latitude},${origin.longitude}&destinations=${encodeURIComponent(destinations)}&mode=driving&key=${config.mapsKey}`);
      const row = ((data.rows as { elements?: { status: string; duration?: { value: number } }[] }[] | undefined)?.[0]?.elements) ?? [];
      for (let index = 0; index < batch.length; index += 1) {
        const element = row[index];
        out.push(element && element.status === "OK" && element.duration ? Math.round(element.duration.value / 60) : null);
      }
    }
    return out;
  }

  return {
    name: "google",
    jobsConfigured,
    async geocode(address) {
      const data = await getJson(`${base}/geocode/json?address=${encodeURIComponent(address)}&key=${config.mapsKey}`);
      const first = (data.results as { geometry?: { location?: { lat: number; lng: number } } }[] | undefined)?.[0];
      const location = first?.geometry?.location;
      return location ? { latitude: location.lat, longitude: location.lng } : null;
    },
    async searchCompanies(input: CompanySearchInput): Promise<CompanyCandidate[]> {
      const code = input.businessType?.code ?? "any";
      const keyword = keywords[code] ?? input.businessType?.value ?? "company";
      // Driving-minute searches start from a generous straight-line radius and are trimmed by the Distance Matrix below.
      const radiusMetres = Math.min(50_000, Math.round((input.radiusType === "km" ? input.radius : input.radius * 0.9) * 1000));
      const found: { name: string; address: string; latitude: number; longitude: number; placeId: string }[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 3 && found.length < input.limit * 2; page += 1) {
        const query = pageToken
          ? `${base}/place/textsearch/json?pagetoken=${encodeURIComponent(pageToken)}&key=${config.mapsKey}`
          : `${base}/place/textsearch/json?query=${encodeURIComponent(keyword)}&location=${input.origin.latitude},${input.origin.longitude}&radius=${radiusMetres}&key=${config.mapsKey}`;
        if (pageToken) await sleep(2000); // Google issues the next page token a moment before it becomes valid.
        const data = await getJson(query);
        for (const place of (data.results ?? []) as { name?: string; formatted_address?: string; geometry?: { location?: { lat: number; lng: number } }; place_id?: string; business_status?: string }[]) {
          if (!place.name || !place.place_id || !place.geometry?.location || (place.business_status && place.business_status !== "OPERATIONAL")) continue;
          found.push({ name: place.name, address: place.formatted_address ?? "", latitude: place.geometry.location.lat, longitude: place.geometry.location.lng, placeId: place.place_id });
        }
        pageToken = typeof data.next_page_token === "string" ? data.next_page_token : undefined;
        if (!pageToken) break;
      }
      const withDistance = found
        .map((place) => ({ ...place, distanceKm: Math.round(haversineKm(input.origin, place) * 10) / 10 }))
        .filter((place) => input.radiusType === "minutes" || place.distanceKm <= input.radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      const minutes = input.radiusType === "minutes" ? await driveMinutes(input.origin, withDistance) : withDistance.map(() => null);
      const kept = withDistance
        .map((place, index) => ({ ...place, driveMinutes: minutes[index] }))
        .filter((place) => input.radiusType === "km" || (place.driveMinutes !== null && place.driveMinutes <= input.radius))
        .slice(0, input.limit);
      const details = await Promise.all(kept.map((place) => placeDetails(place.placeId).catch(() => ({ website: "", phone: "" }))));
      return kept.map((place, index) => ({ ...place, website: details[index].website, phone: details[index].phone }));
    },
    async jobs({ companyName, website, address }) {
      if (!jobsConfigured) return null;
      const url = new URL(config.jobsUrl!);
      url.searchParams.set("company", companyName);
      if (website) url.searchParams.set("website", website);
      if (address) url.searchParams.set("location", address);
      const data = await getJson(url.toString(), { headers: { Authorization: `Bearer ${config.jobsKey}` } });
      const rows = (data.jobs ?? []) as Record<string, unknown>[];
      const listings: JobListing[] = [];
      for (const row of rows) {
        const title = typeof row.title === "string" ? row.title.trim() : "";
        const link = typeof row.url === "string" ? row.url.trim() : "";
        if (!title || !/^https?:\/\//i.test(link)) continue;
        listings.push({
          title: title.slice(0, 200),
          source: typeof row.source === "string" && row.source ? row.source.slice(0, 80) : "Job board",
          location: typeof row.location === "string" ? row.location.slice(0, 160) : "",
          postedAt: typeof row.posted_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(row.posted_at) ? row.posted_at.slice(0, 10) : null,
          employmentType: typeof row.employment_type === "string" && row.employment_type ? row.employment_type.slice(0, 60) : null,
          url: link.slice(0, 2048),
        });
      }
      return listings;
    },
  };
}
