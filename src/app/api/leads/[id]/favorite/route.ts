import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { setDealFavorite } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Marks the deal as the signed-in person's favourite, or unmarks it (request of November 20, 2026): `{ favorite: true | false }`. */
export async function PUT(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view deals.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid deal ID.");
    const body = await readJsonBody(request);
    if (!body || typeof body.favorite !== "boolean") return jsonError(400, "Send { favorite: true } or { favorite: false }.");
    return NextResponse.json(await setDealFavorite(id, body.favorite, user));
  } catch (error) {
    return handleRouteError(error, "Mark favourite");
  }
}
