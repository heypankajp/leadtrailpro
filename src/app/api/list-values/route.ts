import { NextResponse } from "next/server";
import { asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { isListKey } from "@/features/list-values/model";
import { createListValue, listValues } from "@/features/list-values/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1" && hasPrivilege(user, "manage_values");
    return NextResponse.json({ listValues: await listValues({ includeInactive }) });
  } catch (error) {
    return handleRouteError(error, "List values");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    const body = await readJsonBody(request);
    if (!isListKey(body?.listKey)) return jsonError(400, "Unknown list.");
    const value = await createListValue(body.listKey, asString(body.value, 120), user.id);
    return NextResponse.json({ value }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") return jsonError(409, "That value already exists in this list.");
    return handleRouteError(error, "Create list value");
  }
}
