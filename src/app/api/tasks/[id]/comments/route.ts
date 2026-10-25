import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { addTaskComment, listTaskComments } from "@/features/tasks/comments";
import { parseTaskCommentInput } from "@/features/tasks/model";
import { getTask } from "@/features/tasks/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** Comments on a task (TASK-04). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireUser();
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid task ID.");
    const task = await getTask(id);
    if (!task) return jsonError(404, "Task not found.");
    return NextResponse.json({ comments: await listTaskComments(task) });
  } catch (error) {
    return handleRouteError(error, "List task comments");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "collaborate", "You do not have permission to comment.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid task ID.");
    const { input, errors } = parseTaskCommentInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ comment: await addTaskComment(id, input, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Add task comment");
  }
}
