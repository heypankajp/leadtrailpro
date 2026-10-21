import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseTripInput } from "@/features/trips/model";
import { tripProviderStatus } from "@/features/trips/providers";
import { createTrip, listTrips } from "@/features/trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Sales trips (TRIP-01..03): the viewer's trips (every trip for team reporters) and the provider status. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    return NextResponse.json({ trips: await listTrips(user), provider: tripProviderStatus() });
  } catch (error) {
    return handleRouteError(error, "List sales trips");
  }
}

/** Defines a trip and runs its company search at once. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const { input, errors } = parseTripInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json(await createTrip(input, user), { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Create sales trip");
  }
}
