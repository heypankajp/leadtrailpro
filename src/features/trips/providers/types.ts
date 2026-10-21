import type { JobListing, RadiusType } from "../model";

export type GeoPoint = { latitude: number; longitude: number };

export type CompanyCandidate = {
  name: string; address: string; latitude: number | null; longitude: number | null; website: string; phone: string; placeId: string;
  distanceKm: number | null; driveMinutes: number | null;
};

export type CompanySearchInput = {
  origin: GeoPoint;
  radiusType: RadiusType;
  radius: number;
  /** null or the "any" value means every kind of business. */
  businessType: { code: string; value: string } | null;
  limit: number;
};

/**
 * The data sources behind the Sales Trip Planner (SPEC §10.8). Implementations: the deterministic stub used for
 * development and tests, and the Google Maps adapter with a licensed job aggregator behind a small JSON contract.
 */
export interface TripProvider {
  readonly name: string;
  readonly jobsConfigured: boolean;
  geocode(address: string): Promise<GeoPoint | null>;
  searchCompanies(input: CompanySearchInput): Promise<CompanyCandidate[]>;
  /** Active listings for one company, or null when no job source is configured. */
  jobs(input: { companyName: string; website: string; address: string }): Promise<JobListing[] | null>;
}
