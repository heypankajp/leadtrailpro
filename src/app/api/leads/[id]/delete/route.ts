import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { deleteDeal } from "@/features/deletion/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Deletes a deal (request of November 20, 2026): it can be restored from Restore Data for 30 days. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "archive_leads", "You do not have permission to delete deals.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid deal ID.");
    await deleteDeal(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Delete deal");
  }
}
