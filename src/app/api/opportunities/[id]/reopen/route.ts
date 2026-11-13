import { NextResponse } from "next/server";
import { asOptionalId, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { reopenLeadFromOpportunity } from "@/features/opportunities/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** A card whose company was a lead before (closed or archived): reopen that lead for the chosen owner (OPP-12 as decided). */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "create_leads", "You do not have permission to assign leads.");
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) return jsonError(404, "Lead not found.");
    const body = (await readJsonBody(request)) ?? {};
    const ownerId = asOptionalId(body.ownerId) ?? user.id;
    return NextResponse.json({ lead: await reopenLeadFromOpportunity(Number(id), ownerId, user) });
  } catch (error) {
    return handleRouteError(error, "Reopen deal from lead");
  }
}
