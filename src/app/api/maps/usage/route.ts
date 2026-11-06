import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { mapsStatuses } from "@/features/maps/repository";
import { hasPrivilege, requireUser } from "@/features/users/session";

/** The month's Google Maps usage against the in-app budgets, for everyone who plans trips (the live card on the planner pages, SPEC §10.8). */
export async function GET() {
  try {
    const user = await requireUser();
    if (!hasPrivilege(user, "plan_trips") && !hasPrivilege(user, "manage_settings")) return jsonError(403, "You do not have permission to plan sales trips.");
    return NextResponse.json({ usage: await mapsStatuses() });
  } catch (error) {
    return handleRouteError(error, "Google Maps usage");
  }
}
