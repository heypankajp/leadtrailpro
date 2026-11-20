import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseLeadIds } from "@/features/visit-trips/model";
import { addVisitTripLeads, removeVisitTripLead } from "@/features/visit-trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const tripId = async (context: RouteContext) => {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Adds leads (Leads and Lead Generation) to the end of the trip: { opportunityIds } (request of November 20, 2026). */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const id = await tripId(context);
    if (!id) return jsonError(400, "Invalid sales trip ID.");
    const opportunityIds = parseLeadIds((await readJsonBody(request))?.opportunityIds);
    if (!opportunityIds.length) return jsonError(400, "Choose at least one lead.");
    return NextResponse.json(await addVisitTripLeads(id, opportunityIds, user));
  } catch (error) {
    return handleRouteError(error, "Add leads to sales trip");
  }
}

/** Takes one lead off the trip: ?opportunityId=. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const id = await tripId(context);
    const opportunityId = Number(new URL(request.url).searchParams.get("opportunityId"));
    if (!id || !Number.isSafeInteger(opportunityId) || opportunityId < 1) return jsonError(400, "Invalid sales trip or lead ID.");
    return NextResponse.json({ trip: await removeVisitTripLead(id, opportunityId, user) });
  } catch (error) {
    return handleRouteError(error, "Take a lead off a sales trip");
  }
}
