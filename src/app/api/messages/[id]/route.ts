import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { maxMessageLength } from "@/features/messages/model";
import { editMessage, removeMessage } from "@/features/messages/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** Edit your own message (COLL-03). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "collaborate", "You do not have permission to post messages.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid message ID.");
    const body = await readJsonBody(request);
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text) return jsonError(400, "Write a message first.");
    if (text.length > maxMessageLength) return jsonError(400, `Messages must be ${maxMessageLength} characters or fewer.`);
    return NextResponse.json({ message: await editMessage(id, text, user) });
  } catch (error) {
    return handleRouteError(error, "Edit message");
  }
}

/** Administrator soft delete (COLL-04); the audit entry keeps the text. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "moderate_messages", "Only an administrator can remove messages.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid message ID.");
    return NextResponse.json({ message: await removeMessage(id, user) });
  } catch (error) {
    return handleRouteError(error, "Remove message");
  }
}
