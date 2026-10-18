import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { isListKey } from "@/features/list-values/model";
import { reorderListValues } from "@/features/list-values/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    const body = await readJsonBody(request);
    if (!isListKey(body?.listKey)) return jsonError(400, "Unknown list.");
    const ids = Array.isArray(body.orderedIds) ? body.orderedIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
    if (!ids.length) return jsonError(400, "Provide the ordered value IDs.");
    await reorderListValues(body.listKey, ids, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Reorder list values");
  }
}
