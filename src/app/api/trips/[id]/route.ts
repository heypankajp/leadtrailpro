import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { getTrip } from "@/features/trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid trip ID.");
    return NextResponse.json(await getTrip(id, user));
  } catch (error) {
    return handleRouteError(error, "Load sales trip");
  }
}
