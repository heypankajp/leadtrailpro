import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { resultJobs } from "@/features/trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string; resultId: string }> };

/** The job listings behind the Hiring count (TRIP-06), refreshed from the job source when stale. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const params = await context.params;
    const tripId = Number(params.id);
    const resultId = Number(params.resultId);
    if (!Number.isSafeInteger(tripId) || tripId < 1 || !Number.isSafeInteger(resultId) || resultId < 1) return jsonError(400, "Invalid trip or company ID.");
    return NextResponse.json(await resultJobs(tripId, resultId, user));
  } catch (error) {
    return handleRouteError(error, "Load job listings");
  }
}
