import { NextResponse } from "next/server";
import { asOptionalId, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { setLeadTodo } from "@/features/leads/repository";
import { requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Puts a lead on a To Do list, moves it to another, or takes it off (TODO-02): `{ listId }`, null to remove. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid lead ID.");
    const body = await readJsonBody(request);
    if (!body || !("listId" in body)) return jsonError(400, "Send the To Do list as { listId }, or null to take the lead off its list.");
    const listId = asOptionalId(body.listId);
    if (body.listId !== null && body.listId !== "" && !listId) return jsonError(400, "Choose a To Do list.");
    return NextResponse.json({ lead: await setLeadTodo(id, listId, user) });
  } catch (error) {
    return handleRouteError(error, "Change To Do list");
  }
}
