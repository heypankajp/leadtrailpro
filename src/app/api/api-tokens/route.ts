import { NextResponse } from "next/server";
import { handleRouteError, hasBearerToken, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { createApiToken, listApiTokens } from "@/features/users/api-token-repository";
import { parseCreateApiToken } from "@/features/users/api-tokens";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Personal access tokens (SPEC §4): administrators list everyone's and create their own; the token is returned once. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to manage API tokens.");
    return NextResponse.json({ tokens: await listApiTokens() });
  } catch (error) {
    return handleRouteError(error, "List API tokens");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    // A token cannot mint tokens: a stolen one must not be able to outlive its revocation.
    if (hasBearerToken(request)) return jsonError(403, "Create API tokens from a signed-in browser session, under Administration → API access.");
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to manage API tokens.");
    const input = parseCreateApiToken(await readJsonBody(request));
    if ("error" in input) return jsonError(400, input.error);
    const created = await createApiToken(user.id, input, user.id);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Create API token");
  }
}
