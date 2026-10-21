import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parsePlannedVisitDate } from "@/features/trips/model";
import { updateResult } from "@/features/trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string; resultId: string }> };

/** Shortlists a company (TRIP-10) or plans a visit date for it (the "Planned visits" scope of TRIP-11). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const params = await context.params;
    const tripId = Number(params.id);
    const resultId = Number(params.resultId);
    if (!Number.isSafeInteger(tripId) || tripId < 1 || !Number.isSafeInteger(resultId) || resultId < 1) return jsonError(400, "Invalid trip or company ID.");
    const body = await readJsonBody(request);
    const changes: { shortlisted?: boolean; plannedVisitDate?: string | null } = {};
    if (typeof body?.shortlisted === "boolean") changes.shortlisted = body.shortlisted;
    if (body && Object.prototype.hasOwnProperty.call(body, "plannedVisitDate")) {
      const { date, error } = parsePlannedVisitDate(body.plannedVisitDate);
      if (error) return jsonError(400, error);
      changes.plannedVisitDate = date;
    }
    return NextResponse.json({ result: await updateResult(tripId, resultId, changes, user) });
  } catch (error) {
    return handleRouteError(error, "Update sales trip company");
  }
}
