import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { lookupLeadCompany } from "@/features/contacts/websiteLookup";
import { getOpportunity } from "@/features/opportunities/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** The company details found for a lead before it is converted to a deal (request of November 20, 2026). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "create_leads", "You do not have permission to convert leads.");
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const lead = await getOpportunity(id);
    if (!lead) return jsonError(404, "Lead not found.");
    return NextResponse.json({ details: await lookupLeadCompany(lead.companyName, lead.location, lead.website) });
  } catch (error) {
    return handleRouteError(error, "Look up the company");
  }
}
