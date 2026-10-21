import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { rerunTrip } from "@/features/trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Runs the search again with the trip's criteria; results, shortlist, and planned visits start over. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid trip ID.");
    return NextResponse.json(await rerunTrip(id, user));
  } catch (error) {
    return handleRouteError(error, "Run sales trip");
  }
}
