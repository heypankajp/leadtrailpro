import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { transferLead } from "@/features/leads/repository";
import { requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const body = await readJsonBody(request);
    const ownerId = Number(body?.ownerId);
    if (!Number.isSafeInteger(ownerId) || ownerId < 1) return jsonError(400, "Choose the new owner.");
    const lead = await transferLead(id, ownerId, asString(body?.reason, 500), user);
    return NextResponse.json({ lead });
  } catch (error) {
    return handleRouteError(error, "Transfer lead");
  }
}
