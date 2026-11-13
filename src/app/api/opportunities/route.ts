import { NextResponse } from "next/server";
import { asString, handleRouteError } from "@/lib/http";
import { listOpportunities } from "@/features/opportunities/repository";
import { opportunityStatuses, type OpportunityStatus } from "@/features/opportunities/model";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The pool (OPP-02, OPP-11): one card per company with its listings, by status. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "new";
    if (!opportunityStatuses.includes(status as OpportunityStatus)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "50") || 50));
    return NextResponse.json(await listOpportunities({ status: status as OpportunityStatus, page, pageSize, search: asString(params.get("search"), 120) }));
  } catch (error) {
    return handleRouteError(error, "List leads");
  }
}
