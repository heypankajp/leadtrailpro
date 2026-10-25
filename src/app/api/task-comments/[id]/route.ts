import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { maxMessageLength } from "@/features/messages/model";
import { editTaskComment, removeTaskComment } from "@/features/tasks/comments";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** Edit your own comment (TASK-04). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "collaborate", "You do not have permission to comment.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid comment ID.");
    const body = await readJsonBody(request);
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text) return jsonError(400, "Write a comment first.");
    if (text.length > maxMessageLength) return jsonError(400, `Comments must be ${maxMessageLength} characters or fewer.`);
    return NextResponse.json({ comment: await editTaskComment(id, text, user) });
  } catch (error) {
    return handleRouteError(error, "Edit task comment");
  }
}

/** Administrator soft delete (COLL-04). */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "moderate_messages", "Only an administrator can remove comments.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid comment ID.");
    return NextResponse.json({ comment: await removeTaskComment(id, user) });
  } catch (error) {
    return handleRouteError(error, "Remove task comment");
  }
}
