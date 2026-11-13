import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseSearchInput } from "@/features/opportunities/model";
import { deleteSearch, updateSearch } from "@/features/opportunities/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const idOf = async (context: RouteContext) => { const { id } = await context.params; return /^\d+$/.test(id) ? Number(id) : null; };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "Only an administrator can change searches.");
    const id = await idOf(context);
    if (id === null) return jsonError(404, "Search not found.");
    const { input, errors } = parseSearchInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ search: await updateSearch(id, input, user) });
  } catch (error) {
    return handleRouteError(error, "Update lead search");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "Only an administrator can remove searches.");
    const id = await idOf(context);
    if (id === null) return jsonError(404, "Search not found.");
    await deleteSearch(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Delete lead search");
  }
}
