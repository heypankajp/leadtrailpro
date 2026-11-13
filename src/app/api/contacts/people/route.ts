import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseContactQuery, parsePersonInput } from "@/features/contacts/model";
import { createPerson, listPeople } from "@/features/contacts/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Contacts → Persons (GET ?q=&page=). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view contacts.");
    return NextResponse.json(await listPeople(parseContactQuery(new URL(request.url).searchParams)));
  } catch (error) {
    return handleRouteError(error, "List people");
  }
}

/** Adds a person of their own, before any deal exists (SPEC §10.14). */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { input, errors } = parsePersonInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ person: await createPerson(input, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Add person");
  }
}
