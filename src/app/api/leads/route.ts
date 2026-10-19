import { NextResponse } from "next/server";
import { asOptionalId, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseLeadFilters, parseLeadInput } from "@/features/leads/model";
import { createLead, listLeads } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const filters = parseLeadFilters(new URL(request.url).searchParams);
    return NextResponse.json(await listLeads(filters, user));
  } catch (error) {
    return handleRouteError(error, "List leads");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "create_leads", "You do not have permission to create leads.");
    const body = await readJsonBody(request);
    const { input, errors } = parseLeadInput(body);
    if (errors.length) return jsonError(400, errors.join(" "));
    const lead = await createLead(input, user, asOptionalId(body?.ownerId));
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Create lead");
  }
}
