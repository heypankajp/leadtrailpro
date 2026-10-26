import { HttpError } from "@/lib/http";
import { jobSourcesConfigured } from "@/features/jobs/sources";
import type { TripProviderStatus } from "../model";
import { createGoogleProvider } from "./google";
import { stubProvider } from "./stub";
import type { TripProvider } from "./types";

export type { CompanyCandidate, CompanySearchInput, GeoPoint, TripProvider } from "./types";

const notConfigured = "The Sales Trip Planner is not configured: set MAPS_API_KEY in .env.local (and a job-listing source such as ADZUNA_APP_ID/ADZUNA_APP_KEY or HASDATA_API_KEY for the Hiring column), or TRIPS_PROVIDER=stub for sample data.";

/** `TRIPS_PROVIDER=stub` serves sample data; otherwise the Google adapter, which needs MAPS_API_KEY. */
export function tripProviderStatus(): TripProviderStatus {
  const jobsConfigured = jobSourcesConfigured();
  if ((process.env.TRIPS_PROVIDER || "").trim().toLowerCase() === "stub") return { configured: true, name: "stub", jobsConfigured, message: "Sample company data (TRIPS_PROVIDER=stub)." };
  const mapsKey = process.env.MAPS_API_KEY?.trim();
  if (!mapsKey) return { configured: false, name: "google", jobsConfigured, message: notConfigured };
  return { configured: true, name: "google", jobsConfigured, message: jobsConfigured ? null : "Job listings are off until a job-listing source is configured (Settings → Job listing sources); the Hiring column stays blank." };
}

export function getTripProvider(): TripProvider {
  const status = tripProviderStatus();
  if (!status.configured) throw new HttpError(503, notConfigured);
  if (status.name === "stub") return stubProvider;
  return createGoogleProvider({ mapsKey: process.env.MAPS_API_KEY!.trim() });
}
