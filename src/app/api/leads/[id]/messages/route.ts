import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { getLead } from "@/features/leads/repository";
import { parseMessageInput } from "@/features/messages/model";
import { listThreads, postMessage } from "@/features/messages/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** Collaboration threads on a lead (COLL-01). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid lead ID.");
    if (!(await getLead(id))) return jsonError(404, "Lead not found.");
    return NextResponse.json({ threads: await listThreads(id) });
  } catch (error) {
    return handleRouteError(error, "List messages");
  }
}

/** Posts a message or a reply (COLL-01..03, COLL-06). */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "collaborate", "You do not have permission to post messages.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid lead ID.");
    const { input, errors } = parseMessageInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ message: await postMessage(id, input, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Post message");
  }
}
