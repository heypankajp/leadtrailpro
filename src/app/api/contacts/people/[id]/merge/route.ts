import { NextResponse } from "next/server";
import { asOptionalId, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { mergePeople } from "@/features/contacts/repository";
import { requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Merge duplicates (SPEC §10.16): folds the person `{ otherId }` into this one and removes it. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const id = Number((await context.params).id);
    const otherId = asOptionalId((await readJsonBody(request))?.otherId);
    if (!Number.isSafeInteger(id) || id < 1 || !otherId) return jsonError(400, "Choose the person to merge.");
    return NextResponse.json({ person: await mergePeople(id, otherId, user) });
  } catch (error) {
    return handleRouteError(error, "Merge people");
  }
}
