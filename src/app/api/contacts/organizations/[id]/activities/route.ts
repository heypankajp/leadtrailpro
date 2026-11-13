import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseContactActivity } from "@/features/contacts/model";
import { logContactActivity } from "@/features/contacts/repository";
import { requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** A note, or a logged call, email or visit, on the organization itself (SPEC §10.16): `{ type, summary, body, occurredAt }`. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid organization ID.");
    const { input, errors } = parseContactActivity(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    await logContactActivity("organization", id, input, user);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Log organization activity");
  }
}
