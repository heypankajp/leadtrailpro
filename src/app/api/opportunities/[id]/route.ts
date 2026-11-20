import { NextResponse } from "next/server";
import { asOptionalId, asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { archiveOpportunity, getOpportunity, markNotRelevant, restoreOpportunity, unarchiveOpportunity, updateOpportunityDetails } from "@/features/opportunities/repository";
import { parseLeadEntry } from "@/features/opportunities/model";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const idOf = async (context: RouteContext) => { const { id } = await context.params; return /^\d+$/.test(id) ? Number(id) : null; };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const id = await idOf(context);
    const opportunity = id === null ? null : await getOpportunity(id);
    if (!opportunity) return jsonError(404, "Lead not found.");
    return NextResponse.json({ opportunity });
  } catch (error) {
    return handleRouteError(error, "Load lead");
  }
}

/** `{ action: "not_relevant", reasonId, note }` hides the card with a reason (OPP-13); `{ action: "restore" }` brings it back; `{ action: "edit", ... }` changes the lead's fields. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "create_leads", "You do not have permission to change leads.");
    const id = await idOf(context);
    if (id === null) return jsonError(404, "Lead not found.");
    const body = (await readJsonBody(request)) ?? {};
    if (body.action === "not_relevant") {
      const reasonId = asOptionalId(body.reasonId);
      if (!reasonId) return jsonError(400, "Choose a reason.");
      return NextResponse.json({ opportunity: await markNotRelevant(id, reasonId, asString(body.note, 500), user) });
    }
    if (body.action === "restore") return NextResponse.json({ opportunity: await restoreOpportunity(id, user) });
    // The Archive (request of November 20, 2026): move a lead there by hand, or bring it back to the inbox.
    if (body.action === "archive") return NextResponse.json({ opportunity: await archiveOpportunity(id, user) });
    if (body.action === "unarchive") return NextResponse.json({ opportunity: await unarchiveOpportunity(id, user) });
    // The lead's fields (request of November 19, 2026).
    if (body.action === "edit") {
      const { input, errors } = parseLeadEntry(body);
      if (errors.length) return jsonError(400, errors.join(" "));
      return NextResponse.json({ opportunity: await updateOpportunityDetails(id, input, user) });
    }
    return jsonError(400, "Unknown action.");
  } catch (error) {
    return handleRouteError(error, "Update lead");
  }
}
