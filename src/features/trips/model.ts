import { isValidYmd } from "@/lib/dates";

/** Sales Trip Planner (TRIP-01..11, change note of October 21, 2026). */

export const radiusTypes = ["km", "minutes"] as const;
export type RadiusType = (typeof radiusTypes)[number];
export const maxTripResults = 50;
export const maxRadius: Record<RadiusType, number> = { km: 200, minutes: 180 };

export const exportScopes = ["all", "filtered", "shortlisted", "planned"] as const;
export type ExportScope = (typeof exportScopes)[number];
export const exportScopeLabels: Record<ExportScope, string> = { all: "All results", filtered: "Filtered results", shortlisted: "Shortlisted companies", planned: "Planned visits" };

export type JobListing = { title: string; source: string; location: string; postedAt: string | null; employmentType: string | null; url: string };

export type TripInput = { title: string; address: string; radiusType: RadiusType; radius: number; businessTypeId: number | null; maxResults: number };

export type SalesTrip = {
  id: number; ownerId: number; ownerName: string; title: string; address: string; latitude: number | null; longitude: number | null;
  radiusType: RadiusType; radius: number; businessTypeId: number | null; businessType: string | null; maxResults: number;
  provider: string; lastRunAt: string | null; resultCount: number; createdAt: string; updatedAt: string;
};

export type TripResult = {
  id: number; tripId: number; sequence: number; companyName: string; address: string; latitude: number | null; longitude: number | null;
  distanceKm: number | null; driveMinutes: number | null; website: string; phone: string;
  jobCount: number | null; jobs: JobListing[] | null; jobsFetchedAt: string | null;
  matchedLeadId: number | null; actionCode: string; actionLabel: string; shortlisted: boolean; plannedVisitDate: string | null; createdAt: string;
};

export type TripProviderStatus = { configured: boolean; name: string; jobsConfigured: boolean; message: string | null };

export const newActionLabel = "New / Not in CRM";

export function parseTripInput(value: unknown): { input: TripInput; errors: string[] } {
  const errors: string[] = [];
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (key: string, max: number, label: string, required: boolean) => {
    const raw = typeof body[key] === "string" ? (body[key] as string).trim() : "";
    if (required && !raw) errors.push(`${label} is required.`);
    if (raw.length > max) errors.push(`${label} must be ${max} characters or fewer.`);
    return raw.slice(0, max);
  };
  const title = text("title", 120, "Trip title", true);
  const address = text("address", 500, "Address", true);
  const radiusType: RadiusType = body.radiusType === "minutes" ? "minutes" : "km";
  const radius = Number(body.radius);
  if (!Number.isFinite(radius) || radius <= 0) errors.push("Radius must be a positive number.");
  else if (radius > maxRadius[radiusType]) errors.push(`Radius must be ${maxRadius[radiusType]} ${radiusType === "km" ? "km" : "minutes"} or less.`);
  const maxResults = Number(body.maxResults);
  if (!Number.isInteger(maxResults) || maxResults < 1) errors.push("Number of results must be a whole number of at least 1.");
  else if (maxResults > maxTripResults) errors.push(`Number of results cannot exceed ${maxTripResults}.`);
  let businessTypeId: number | null = null;
  if (body.businessTypeId !== undefined && body.businessTypeId !== null && body.businessTypeId !== "") {
    const id = Number(body.businessTypeId);
    if (!Number.isSafeInteger(id) || id < 1) errors.push("Business type is not valid.");
    else businessTypeId = id;
  }
  return { input: { title, address, radiusType, radius: Math.round(radius), businessTypeId, maxResults: Number.isInteger(maxResults) ? maxResults : 0 }, errors };
}

export function parseExportScope(value: string | null): ExportScope {
  return exportScopes.includes(value as ExportScope) ? (value as ExportScope) : "all";
}

export function parsePlannedVisitDate(value: unknown): { date: string | null; error: string | null } {
  if (value === null || value === "" || value === undefined) return { date: null, error: null };
  if (typeof value !== "string" || !isValidYmd(value)) return { date: null, error: "Planned visit date must be a valid date (YYYY-MM-DD)." };
  return { date: value, error: null };
}

export const radiusLabel = (trip: { radiusType: RadiusType; radius: number }) => `${trip.radius} ${trip.radiusType === "km" ? "km" : "min drive"}`;

export function formatDistance(result: { distanceKm: number | null; driveMinutes: number | null }, radiusType: RadiusType): string {
  if (radiusType === "minutes" && result.driveMinutes !== null) return `${result.driveMinutes} min`;
  if (result.distanceKm !== null) return `${result.distanceKm.toFixed(1)} km`;
  return "—";
}

export function hiringLabel(count: number | null): string {
  if (count === null) return "—";
  return `${count} ${count === 1 ? "Job" : "Jobs"}`;
}
