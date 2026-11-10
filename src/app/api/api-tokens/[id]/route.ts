import { NextResponse } from "next/server";
import { asId, handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { revokeApiToken } from "@/features/users/api-token-repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Revokes a token at once (SPEC §4); any request still carrying it is answered 401 from then on. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to manage API tokens.");
    const id = asId((await context.params).id);
    if (!id) return jsonError(400, "Invalid token id.");
    const revoked = await revokeApiToken(id, user.id);
    if (!revoked) return jsonError(404, "That token does not exist or was revoked already.");
    return NextResponse.json({ ok: true, apiToken: revoked });
  } catch (error) {
    return handleRouteError(error, "Revoke API token");
  }
}
