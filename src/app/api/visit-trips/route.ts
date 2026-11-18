import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseLeadIds, parseVisitTripFilters, parseVisitTripInput, type VisitTripInput } from "@/features/visit-trips/model";
import { createVisitTrip, listVisitTrips } from "@/features/visit-trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Sales Trips (review of November 18, 2026): the list, with ?q= (title, or a deal's organization, contact, city or address), ownerId, date, from and to. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view sales trips.");
    return NextResponse.json(await listVisitTrips(parseVisitTripFilters(new URL(request.url).searchParams), user));
  } catch (error) {
    return handleRouteError(error, "List sales trips");
  }
}

/** Plans a trip: { title, tripDate, ownerId?, leadIds? }. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const body = await readJsonBody(request);
    const { input, errors } = parseVisitTripInput(body);
    if (errors.length) return jsonError(400, errors.join(" "));
    const trip = await createVisitTrip({ ownerId: null, ...input } as VisitTripInput, parseLeadIds(body?.leadIds), user);
    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Plan sales trip");
  }
}
