import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { bulkReassign, bulkSetState } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Bulk archive, restore, or reassign: { ids, action, ownerId?, reason? }. */
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
    return jsonError(400, "Action must be archive, restore, or reassign.");
  } catch (error) {
    return handleRouteError(error, "Bulk lead update");
  }
}
