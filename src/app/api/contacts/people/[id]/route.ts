import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parsePersonInput } from "@/features/contacts/model";
import { deletePerson, getPersonDetail, updatePerson } from "@/features/contacts/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };
const idOf = async (context: RouteContext) => { const id = Number((await context.params).id); return Number.isSafeInteger(id) && id > 0 ? id : null; };

/** One person with their deals and history. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view contacts.");
    const id = await idOf(context);
    if (!id) return jsonError(400, "Invalid person ID.");
    return NextResponse.json(await getPersonDetail(id, user));
  } catch (error) {
    return handleRouteError(error, "Load person");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const id = await idOf(context);
    if (!id) return jsonError(400, "Invalid person ID.");
    const { input, errors } = parsePersonInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ person: await updatePerson(id, input, user) });
  } catch (error) {
    return handleRouteError(error, "Update person");
  }
}

/** Removes a person who has no deals. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const id = await idOf(context);
    if (!id) return jsonError(400, "Invalid person ID.");
    await deletePerson(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Remove person");
  }
}
