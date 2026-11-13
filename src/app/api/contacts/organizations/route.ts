import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseContactQuery, parseOrganizationInput } from "@/features/contacts/model";
import { createOrganization, listOrganizations } from "@/features/contacts/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Contacts → Organizations (GET ?q=&page=). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view contacts.");
    return NextResponse.json(await listOrganizations(parseContactQuery(new URL(request.url).searchParams)));
  } catch (error) {
    return handleRouteError(error, "List organizations");
  }
}

/** Adds an organization of its own, before any deal exists (SPEC §10.14). */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { input, errors } = parseOrganizationInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ organization: await createOrganization(input, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Add organization");
  }
}
