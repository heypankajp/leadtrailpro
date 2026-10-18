import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { loggableActivityTypes, type LoggableActivityType } from "@/features/leads/model";
import { getLead, logActivity } from "@/features/leads/repository";
import { hasPrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Records a call, email, visit, or interaction note on the lead timeline. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const body = await readJsonBody(request);
    const type = body?.type;
    if (!loggableActivityTypes.includes(type as LoggableActivityType)) return jsonError(400, "Activity type must be call, email, visit, or note.");
    const privilege = type === "note" ? "add_notes" : "log_activities";
    if (!hasPrivilege(user, privilege)) return jsonError(403, type === "note" ? "You do not have permission to add notes." : "You do not have permission to log activities.");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found.");
    const bodyText = asString(body?.body, 10000);
    const summary = asString(body?.summary, 500);
    if (type === "note" && !bodyText) return jsonError(400, "Write the note before saving.");
    let occurredAt: Date | null = null;
    if (typeof body?.occurredAt === "string" && body.occurredAt) {
      occurredAt = new Date(body.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) return jsonError(400, "The activity date is not valid.");
      if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) return jsonError(400, "The activity date cannot be in the future.");
    }
    const activity = await logActivity(lead, user, { type: type as LoggableActivityType, summary, body: bodyText, occurredAt });
    return NextResponse.json({ activity, lead: await getLead(id) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Log activity");
  }
}
