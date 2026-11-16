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
    // PD-29: one person's day for the Schedule an activity agenda. Someone else's tasks need view_team_reports; otherwise it is your own day.
    const asked = Number(params.get("assigneeId"));
    const assigneeId = Number.isSafeInteger(asked) && asked > 0 && (asked === user.id || hasPrivilege(user, "view_team_reports")) ? asked : null;
    const instant = (key: string) => { const value = params.get(key); const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : undefined; };
    const filter: TaskFilter = {
      assigneeId: assigneeId ?? (scope === "all" && hasPrivilege(user, "view_team_reports") ? undefined : user.id),
      leadId: Number.isSafeInteger(leadId) && leadId > 0 ? leadId : undefined,
      status: status === "open" || status === "done" ? status : undefined,
      dueFrom: instant("from"), dueTo: instant("to"),
    };
    return NextResponse.json({ tasks: await listTasks(filter), assigneeId: filter.assigneeId ?? null });
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
