import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { reviewQueuedLead } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "review_queued", "You do not have permission to approve or reject queued leads.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const body = await readJsonBody(request);
    if (typeof body?.approve !== "boolean") return jsonError(400, "Specify whether the lead is approved.");
    const lead = await reviewQueuedLead(id, body.approve, asString(body.comment, 500), user);
    return NextResponse.json({ lead });
  } catch (error) {
    return handleRouteError(error, "Review queued lead");
  }
}
