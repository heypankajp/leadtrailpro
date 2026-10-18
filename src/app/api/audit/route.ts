import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { listAudit } from "@/features/audit/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_audit", "You do not have permission to view audit history.");
    const params = new URL(request.url).searchParams;
    const entityId = Number(params.get("entityId"));
    const actorId = Number(params.get("actorId"));
    const limit = Number(params.get("limit") || "100");
    return NextResponse.json({
      entries: await listAudit({
        entityType: params.get("entityType")?.slice(0, 40) || undefined,
        entityId: Number.isSafeInteger(entityId) && entityId > 0 ? entityId : undefined,
        actorId: Number.isSafeInteger(actorId) && actorId > 0 ? actorId : undefined,
        limit: Number.isInteger(limit) ? limit : 100,
      }),
    });
  } catch (error) {
    return handleRouteError(error, "Audit history");
  }
}
