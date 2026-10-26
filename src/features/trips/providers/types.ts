import type { RadiusType } from "../model";

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
 * The company data sources behind the Sales Trip Planner (SPEC §10.8): the deterministic stub used for development
 * and tests, and the Google Maps adapter. Job listings come from the job-sources layer (features/jobs, SPEC §7.13).
 */
export interface TripProvider {
  readonly name: string;
  geocode(address: string): Promise<GeoPoint | null>;
  searchCompanies(input: CompanySearchInput): Promise<CompanyCandidate[]>;
}
