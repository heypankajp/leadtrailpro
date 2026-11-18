import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseLeadIds } from "@/features/visit-trips/model";
import { addVisitTripDeals, removeVisitTripDeal } from "@/features/visit-trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const tripId = async (context: RouteContext) => {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Adds deals to the end of the trip: { leadIds }. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const id = await tripId(context);
    if (!id) return jsonError(400, "Invalid sales trip ID.");
    const leadIds = parseLeadIds((await readJsonBody(request))?.leadIds);
    if (!leadIds.length) return jsonError(400, "Choose at least one deal.");
    return NextResponse.json(await addVisitTripDeals(id, leadIds, user));
  } catch (error) {
    return handleRouteError(error, "Add deals to sales trip");
  }
}

/** Takes one deal off the trip: ?leadId=. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const id = await tripId(context);
    const leadId = Number(new URL(request.url).searchParams.get("leadId"));
    if (!id || !Number.isSafeInteger(leadId) || leadId < 1) return jsonError(400, "Invalid sales trip or deal ID.");
    return NextResponse.json({ trip: await removeVisitTripDeal(id, leadId, user) });
  } catch (error) {
    return handleRouteError(error, "Remove deal from sales trip");
  }
}
