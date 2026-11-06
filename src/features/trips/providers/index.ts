import { getDatabasePool, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { jobSourcesConfigured } from "@/features/jobs/sources";
import { createMapsMeter, mapsApiKey } from "@/features/maps/repository";
import type { TripProviderStatus } from "../model";
import { createGoogleProvider } from "./google";
import { stubProvider } from "./stub";
import type { TripProvider } from "./types";

export type { CompanyCandidate, CompanySearchInput, GeoPoint, TripProvider } from "./types";

const notConfigured = "The Sales Trip Planner is not configured: set MAPS_API_KEY (or GOOGLE_MAPS_API_KEY) in .env.local (and a job-listing source such as ADZUNA_APP_ID/ADZUNA_APP_KEY or HASDATA_API_KEY for the Hiring column), or TRIPS_PROVIDER=stub for sample data.";

/** `TRIPS_PROVIDER=stub` serves sample data; otherwise the Google adapter, which needs MAPS_API_KEY (or GOOGLE_MAPS_API_KEY). */
export function tripProviderStatus(): TripProviderStatus {
  const jobsConfigured = jobSourcesConfigured();
  if ((process.env.TRIPS_PROVIDER || "").trim().toLowerCase() === "stub") return { configured: true, name: "stub", jobsConfigured, message: "Sample company data (TRIPS_PROVIDER=stub)." };
  const mapsKey = mapsApiKey().key;
  if (!mapsKey) return { configured: false, name: "google", jobsConfigured, message: notConfigured };
  return { configured: true, name: "google", jobsConfigured, message: jobsConfigured ? null : "Job listings are off until a job-listing source is configured (Settings → Job listing sources); the Hiring column stays blank." };
}

/** The provider for one search; the Google adapter counts its calls in the usage meter on `db` (features/maps, SPEC §10.8). */
export function getTripProvider(db: Queryable = getDatabasePool()): TripProvider {
  const status = tripProviderStatus();
  if (!status.configured) throw new HttpError(503, notConfigured);
  if (status.name === "stub") return stubProvider;
  return createGoogleProvider({ mapsKey: mapsApiKey().key, meter: createMapsMeter(db) });
}
