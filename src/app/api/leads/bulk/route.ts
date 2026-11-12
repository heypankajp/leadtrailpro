import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { bulkReassign, bulkSetStage, bulkSetState, bulkSetTodo } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Bulk archive, restore, reassign, move to a stage (PIPE-11), or move to a To Do list (TODO-03): { ids, action, ownerId?, reason?, stageId?, todoListId? }. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const body = await readJsonBody(request);
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 500) : [];
    if (!ids.length) return jsonError(400, "Select at least one lead.");
    const reason = asString(body?.reason, 500);
    if (body?.action === "archive" || body?.action === "restore") {
      requirePrivilege(user, "archive_leads", "You do not have permission to archive or restore leads.");
      const count = await bulkSetState(ids, body.action === "archive" ? "archived" : "active", reason, user);
      return NextResponse.json({ ok: true, count });
    }
    if (body?.action === "reassign") {
      requirePrivilege(user, "reassign_leads", "You do not have permission to reassign leads.");
      const ownerId = Number(body.ownerId);
      if (!Number.isSafeInteger(ownerId) || ownerId < 1) return jsonError(400, "Choose the new owner.");
      const count = await bulkReassign(ids, ownerId, reason, user);
      return NextResponse.json({ ok: true, count });
    }
    if (body?.action === "stage") {
      requirePrivilege(user, "edit_leads", "You do not have permission to move leads.");
      const stageId = Number(body.stageId);
      if (!Number.isSafeInteger(stageId) || stageId < 1) return jsonError(400, "Choose the stage.");
      const count = await bulkSetStage(ids, stageId, user);
      return NextResponse.json({ ok: true, count });
    }
    if (body?.action === "todo") {
      requirePrivilege(user, "edit_leads", "You do not have permission to change To Do lists.");
      // null takes the leads off their list.
      const listId = body.todoListId === null || body.todoListId === undefined ? null : Number(body.todoListId);
      if (listId !== null && (!Number.isSafeInteger(listId) || listId < 1)) return jsonError(400, "Choose the To Do list.");
      const count = await bulkSetTodo(ids, listId, user);
      return NextResponse.json({ ok: true, count });
    }
    return jsonError(400, "Action must be archive, restore, reassign, stage, or todo.");
  } catch (error) {
    return handleRouteError(error, "Bulk lead update");
  }
}
