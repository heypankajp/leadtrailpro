import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { createManualOpportunity, listOpportunities } from "@/features/opportunities/repository";
import { opportunityOrigins, opportunityStatuses, parseLeadEntry, type OpportunityOrigin, type OpportunityStatus } from "@/features/opportunities/model";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The pool (OPP-02, OPP-11): one card per company with its listings, by status; `origin` (manual | found) splits Leads from Lead Generation. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "new";
    if (!opportunityStatuses.includes(status as OpportunityStatus)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    const originParam = params.get("origin");
    if (originParam && !opportunityOrigins.includes(originParam as OpportunityOrigin)) return NextResponse.json({ error: "Unknown origin." }, { status: 400 });
    const origin = (originParam || undefined) as OpportunityOrigin | undefined;
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "50") || 50));
    return NextResponse.json(await listOpportunities({ status: status as OpportunityStatus, page, pageSize, search: asString(params.get("search"), 120), origin, mineOf: params.get("scope") === "mine" ? user.id : null, archived: params.get("archived") === "1" }));
  } catch (error) {
    return handleRouteError(error, "List leads");
  }
}

/** A lead added by hand (request of November 19, 2026): `{ companyName, website, location, leadSourceId, bdActionId, clientResponseId, note }`. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "create_leads", "You do not have permission to add leads.");
    const { input, errors } = parseLeadEntry(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ opportunity: await createManualOpportunity(input, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Add lead");
  }
}
