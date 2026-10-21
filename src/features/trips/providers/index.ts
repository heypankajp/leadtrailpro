import { HttpError } from "@/lib/http";
import type { TripProviderStatus } from "../model";
import { createGoogleProvider } from "./google";
import { stubProvider } from "./stub";
import type { TripProvider } from "./types";

export type { CompanyCandidate, CompanySearchInput, GeoPoint, TripProvider } from "./types";

const notConfigured = "The Sales Trip Planner is not configured: set MAPS_API_KEY (and JOBS_API_URL with JOBS_API_KEY for job listings) in .env.local, or TRIPS_PROVIDER=stub for sample data.";

/** `TRIPS_PROVIDER=stub` serves sample data; otherwise the Google adapter, which needs MAPS_API_KEY. */
export function tripProviderStatus(): TripProviderStatus {
  if ((process.env.TRIPS_PROVIDER || "").trim().toLowerCase() === "stub") return { configured: true, name: "stub", jobsConfigured: true, message: "Sample company data (TRIPS_PROVIDER=stub)." };
  const mapsKey = process.env.MAPS_API_KEY?.trim();
  const jobsConfigured = Boolean(process.env.JOBS_API_URL?.trim() && process.env.JOBS_API_KEY?.trim());
  if (!mapsKey) return { configured: false, name: "google", jobsConfigured, message: notConfigured };
  return { configured: true, name: "google", jobsConfigured, message: jobsConfigured ? null : "Job listings are off until JOBS_API_URL and JOBS_API_KEY are set; the Hiring column stays blank." };
}

export function getTripProvider(): TripProvider {
  const status = tripProviderStatus();
  if (!status.configured) throw new HttpError(503, notConfigured);
  if (status.name === "stub") return stubProvider;
  return createGoogleProvider({ mapsKey: process.env.MAPS_API_KEY!.trim(), jobsUrl: process.env.JOBS_API_URL?.trim() || undefined, jobsKey: process.env.JOBS_API_KEY?.trim() || undefined });
}
