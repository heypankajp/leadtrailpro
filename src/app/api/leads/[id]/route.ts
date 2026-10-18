import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { listAttachments } from "@/features/attachments/repository";
import { listAudit } from "@/features/audit/repository";
import { parseLeadPatch } from "@/features/leads/model";
import { canEditLead, getLead, listActivities, updateLead } from "@/features/leads/repository";
import { listTasks } from "@/features/tasks/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** The lead 360 view: record, timeline, tasks, files, and (for auditors) history. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid lead ID.");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found.");
    const [activities, tasks, attachments, audit] = await Promise.all([
      listActivities(id),
      listTasks({ leadId: id }),
      listAttachments(id, { includeDeleted: hasPrivilege(user, "delete_files") }),
      hasPrivilege(user, "view_audit") ? listAudit({ entityType: "lead", entityId: id, limit: 200 }) : Promise.resolve([]),
    ]);
    return NextResponse.json({ lead, activities, tasks, attachments, audit, permissions: { edit: canEditLead(user, lead) } });
  } catch (error) {
    return handleRouteError(error, "Load lead");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid lead ID.");
    const existing = await getLead(id);
    if (!existing) return jsonError(404, "Lead not found.");
    if (!canEditLead(user, existing)) return jsonError(403, "You can only edit leads you own.");
    const { changes, errors } = parseLeadPatch(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    const lead = await updateLead(id, changes, user);
    return NextResponse.json({ lead });
  } catch (error) {
    return handleRouteError(error, "Update lead");
  }
}
