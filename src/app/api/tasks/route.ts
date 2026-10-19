import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseTaskInput } from "@/features/tasks/model";
import { createTask, listTasks, type TaskFilter } from "@/features/tasks/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope");
    const status = params.get("status");
    const leadId = Number(params.get("leadId"));
    const filter: TaskFilter = {
      assigneeId: scope === "all" && hasPrivilege(user, "view_team_reports") ? undefined : user.id,
      leadId: Number.isSafeInteger(leadId) && leadId > 0 ? leadId : undefined,
      status: status === "open" || status === "done" ? status : undefined,
    };
    return NextResponse.json({ tasks: await listTasks(filter) });
  } catch (error) {
    return handleRouteError(error, "List tasks");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_tasks", "You do not have permission to create tasks.");
    const { input, errors } = parseTaskInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    const task = await createTask(input, user);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Create task");
  }
}
