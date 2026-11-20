import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseTripDeleteChoice, parseVisitTripInput } from "@/features/visit-trips/model";
import { canManageTrip, deleteVisitTrip, getVisitTrip, updateVisitTrip, visitTripDeals, visitTripLeads, visitTripOrder } from "@/features/visit-trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const tripId = async (context: RouteContext) => {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** One sales trip with its deals in visiting order. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view sales trips.");
    const id = await tripId(context);
    if (!id) return jsonError(400, "Invalid sales trip ID.");
    const trip = await getVisitTrip(id);
    if (!trip) return jsonError(404, "Sales trip not found.");
    const [deals, leads, order] = await Promise.all([visitTripDeals(id), visitTripLeads(id), visitTripOrder(id)]);
    return NextResponse.json({ trip, deals, leads, order, permissions: { edit: canManageTrip(user, trip) } });
  } catch (error) {
    return handleRouteError(error, "Open sales trip");
  }
}

/** Changes the title, the date or (managers) the owner: { title?, tripDate?, ownerId? }. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const id = await tripId(context);
    if (!id) return jsonError(400, "Invalid sales trip ID.");
    const { input, errors } = parseVisitTripInput(await readJsonBody(request), true);
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ trip: await updateVisitTrip(id, input, user) });
  } catch (error) {
    return handleRouteError(error, "Edit sales trip");
  }
}

/** Deletes the trip: { deals: "todo" | "pipeline" | "archive", archiveReasonId?, notes? } says what happens to its deals. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const id = await tripId(context);
    if (!id) return jsonError(400, "Invalid sales trip ID.");
    const { choice, errors } = parseTripDeleteChoice(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ ok: true, ...(await deleteVisitTrip(id, choice, user)) });
  } catch (error) {
    return handleRouteError(error, "Delete sales trip");
  }
}
