import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseTaskPatch } from "@/features/tasks/model";
import { getTask, updateTask } from "@/features/tasks/repository";
import { requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid task ID.");
    const task = await getTask(id);
    if (!task) return jsonError(404, "Task not found.");
    return NextResponse.json({ task });
  } catch (error) {
    return handleRouteError(error, "Load task");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid task ID.");
    const { changes, errors } = parseTaskPatch(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    const task = await updateTask(id, changes, user);
    return NextResponse.json({ task });
  } catch (error) {
    return handleRouteError(error, "Update task");
  }
}
