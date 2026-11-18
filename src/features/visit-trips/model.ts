// Sales Trips (review of November 18, 2026): a trip to visit some of the deals on the "To be visited" To Do list, with a
// title, a date and an owner. Pure types and parsing, shared by the routes, the pages and the unit tests.
// (The Sales Trip Planner, which searches companies on Google Maps, is a different feature: src/features/trips.)

import { isValidYmd } from "@/lib/dates";

/**
 * A row of Sales Trips: a trip planned for To Do deals ("visit", this feature's own) or a trip made in the Sales Trip
 * Planner ("planner": a map search, opened on the planner's page). Both kinds share one list (review of November 18, 2026).
 */
export type TripKind = "visit" | "planner";

export type VisitTrip = {
  kind: TripKind;
  id: number;
  title: string;
  /** YYYY-MM-DD */
  tripDate: string;
  ownerId: number;
  ownerName: string;
  createdById: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  dealCount: number;
  /** The companies visited, in visiting order (the list shows the first few). For a planner trip: its shortlist, or every company found. */
  companies: string[];
  /** A planner trip's search address ("" for a visit trip). */
  address: string;
};

export type VisitTripPage = { trips: VisitTrip[]; total: number; page: number; pageSize: number };

export type VisitTripFilters = {
  /** Keyword: the trip's title, or the organization, contact, city or address of a deal on it. */
  q: string;
  ownerId: number | null;
  /** One day, or a period (from and to, both included). */
  date: string | null;
  from: string | null;
  to: string | null;
  page: number;
  pageSize: number;
  /** "Recent Planned Trips" on the planner's page: the most recently planned trips first, at most the configured number. */
  recent: boolean;
};

/** How many trips "Recent Planned Trips" shows when List of values has no usable number. */
export const defaultRecentTrips = 30;

/** The number configured under List of values → Recent Planned Trips: a whole number from 1 to 500, or the default. */
export function recentTripsLimit(value: string | null | undefined): number {
  const number = Number(String(value ?? "").trim());
  return Number.isInteger(number) && number >= 1 ? Math.min(number, 500) : defaultRecentTrips;
}

export type VisitTripInput = { title: string; tripDate: string; ownerId: number | null };

/**
 * What happens to a trip's deals when the trip is deleted (the user chooses): back on the To Do list each came from
 * (they stay in the Pipeline), in the Pipeline only (on no To Do list), or archived with an Archival reason and notes.
 */
export const tripDealActions = ["todo", "pipeline", "archive"] as const;
export type TripDealAction = (typeof tripDealActions)[number];
export type TripDeleteChoice = { deals: TripDealAction; archiveReasonId: number | null; notes: string };

export function parseTripDeleteChoice(body: Record<string, unknown> | null): { choice: TripDeleteChoice; errors: string[] } {
  const deals = tripDealActions.includes(body?.deals as TripDealAction) ? (body?.deals as TripDealAction) : null;
  const reason = Number(body?.archiveReasonId);
  const archiveReasonId = Number.isSafeInteger(reason) && reason > 0 ? reason : null;
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  const errors: string[] = [];
  if (!deals) errors.push("Choose what happens to the trip's deals.");
  if (deals === "archive" && !archiveReasonId) errors.push("Choose the archival reason.");
  return { choice: { deals: deals ?? "todo", archiveReasonId, notes }, errors };
}

const id = (value: string | null) => {
  const number = Number(value);
  return value && Number.isSafeInteger(number) && number > 0 ? number : null;
};
const day = (value: string | null) => (value && isValidYmd(value) ? value : null);

export function parseVisitTripFilters(params: URLSearchParams): VisitTripFilters {
  const page = Number(params.get("page") || "1");
  const pageSize = Number(params.get("pageSize") || "50");
  return {
    q: (params.get("q") || "").trim().slice(0, 200),
    ownerId: id(params.get("ownerId")),
    date: day(params.get("date")),
    from: day(params.get("from")),
    to: day(params.get("to")),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isSafeInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 50,
    recent: params.get("recent") === "1" || params.get("recent") === "true",
  };
}

/** Validates a trip's title, date and owner; `partial` accepts an edit that changes only some of them. */
export function parseVisitTripInput(body: Record<string, unknown> | null, partial = false): { input: Partial<VisitTripInput>; errors: string[] } {
  const errors: string[] = [];
  const input: Partial<VisitTripInput> = {};
  if (!partial || body?.title !== undefined) {
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
    if (!title) errors.push("Give the sales trip a title.");
    input.title = title;
  }
  if (!partial || body?.tripDate !== undefined) {
    const tripDate = typeof body?.tripDate === "string" ? body.tripDate : "";
    if (!isValidYmd(tripDate)) errors.push("Choose the date of the sales trip.");
    input.tripDate = tripDate;
  }
  if (body?.ownerId !== undefined && body.ownerId !== null) {
    const owner = Number(body.ownerId);
    if (!Number.isSafeInteger(owner) || owner < 1) errors.push("Choose who goes on the trip.");
    else input.ownerId = owner;
  }
  return { input, errors };
}

/** The deal ids of a request, without duplicates, at most 200. */
export function parseLeadIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((item) => Number.isSafeInteger(item) && item > 0))].slice(0, 200);
}

/** "Northstar Logistics, Fable & Stone and 2 more" */
export function companiesSummary(companies: string[], shown = 3): string {
  if (!companies.length) return "No deals yet";
  if (companies.length <= shown) return companies.length === 1 ? companies[0] : `${companies.slice(0, -1).join(", ")} and ${companies[companies.length - 1]}`;
  return `${companies.slice(0, shown).join(", ")} and ${companies.length - shown} more`;
}
