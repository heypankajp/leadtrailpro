import { NextResponse } from "next/server";
import { formatYmd, zonedParts } from "@/lib/dates";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { loggableActivityTypes, type LoggableActivityType } from "@/features/leads/model";
import { canEditLead, getLead, logActivity, updateLead } from "@/features/leads/repository";
import { parseTaskInput, type Task, type TaskInput } from "@/features/tasks/model";
import { createTask } from "@/features/tasks/repository";
import { hasPrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Records a call, email, visit, or interaction note on the lead timeline. With `followUpTask` (NOTE-05, TASK-01)
 * it also creates the task the note asked for and, when the user may edit the lead, moves the lead's next
 * follow-up date to the task's due date (business timezone).
 */
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

    const followUp = body?.followUpTask && typeof body.followUpTask === "object" && !Array.isArray(body.followUpTask) ? body.followUpTask as Record<string, unknown> : null;
    let followUpInput: TaskInput | null = null;
    let moveFollowUpDate = false;
    if (followUp) {
      if (!hasPrivilege(user, "manage_tasks")) return jsonError(403, "You do not have permission to create tasks.");
      if (lead.recordState !== "active") return jsonError(400, "Follow-up tasks can only be created for active leads.");
      const { input, errors } = parseTaskInput({
        leadId: id,
        title: followUp.title,
        description: typeof followUp.description === "string" ? followUp.description : bodyText,
        assigneeId: followUp.assigneeId ?? lead.ownerId,
        dueAt: followUp.dueAt,
        priority: followUp.priority ?? "normal",
        checklist: [],
      });
      if (!input.dueAt) errors.push("The follow-up task needs a due date.");
      if (errors.length) return jsonError(400, errors.join(" "));
      followUpInput = input;
      moveFollowUpDate = followUp.setFollowUpDate === true;
    }

    const activity = await logActivity(lead, user, { type: type as LoggableActivityType, summary, body: bodyText, occurredAt });
    let task: Task | null = null;
    if (followUpInput) {
      task = await createTask(followUpInput, user);
      if (moveFollowUpDate && task.dueAt && canEditLead(user, lead)) {
        const due = zonedParts(new Date(task.dueAt));
        await updateLead(id, { followUpDate: formatYmd(due.year, due.month, due.day) }, user);
      }
    }
    return NextResponse.json({ activity, task, lead: await getLead(id) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Log activity");
  }
}
