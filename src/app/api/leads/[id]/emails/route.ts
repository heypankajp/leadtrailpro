import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { recentLeadEmails } from "@/features/gmail/gmail";
import { getLead } from "@/features/leads/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };
const safeAddress = /^[^\s"'()<>,;\\]+@[^\s"'()<>,;\\]+$/;

/** Recent Gmail messages exchanged with the lead's client email addresses (MAIL-01, MAIL-03). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found.");
    const addresses = lead.clientEmails.filter((value) => safeAddress.test(value));
    const scope = hasPrivilege(user, "view_team_reports") ? "all" : { userId: user.id };
    return NextResponse.json(await recentLeadEmails(addresses, scope));
  } catch (error) {
    return handleRouteError(error, "Lead emails");
  }
}
