import { NextResponse } from "next/server";
import { asOptionalId, handleRouteError, HttpError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { assertNoContactClash, newContactNames } from "@/features/contacts/repository";
import { getDatabasePool } from "@/lib/db";
import { parseLeadFilters, parseLeadInput } from "@/features/leads/model";
import { createLead, findDuplicateLead, listLeads } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view deals.");
    const filters = parseLeadFilters(new URL(request.url).searchParams);
    return NextResponse.json(await listLeads(filters, user));
  } catch (error) {
    return handleRouteError(error, "List deals");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "create_leads", "You do not have permission to create deals.");
    const body = await readJsonBody(request);
    const { input, errors } = parseLeadInput(body);
    if (errors.length) return jsonError(400, errors.join(" "));
    const organizationId = asOptionalId(body?.organizationId);
    const personId = asOptionalId(body?.personId);
    // PD-15: a new organization or contact is created only once the user has confirmed it.
    const fresh = await newContactNames(input.clientName, input.clientExecutive, organizationId, personId);
    // A new contact may not take an email address or a phone number another contact has (request of November 18, 2026).
    if (fresh.contact) await assertNoContactClash(getDatabasePool(), input.clientEmails, [input.contactPhone, input.contactAltPhone]);
    const unconfirmed = (fresh.organization && body?.createOrganization !== true) || (fresh.contact && body?.createContact !== true);
    // A name close to an existing deal ("Lakeshore Bakery Co" for "Lakeshore Bakery Co.") meets the duplicate guard first:
    // createLead refuses it with a link to that deal, before anyone is asked to create a new organization.
    const duplicate = unconfirmed && fresh.organization ? await findDuplicateLead(input) : null;
    if (unconfirmed && !(duplicate && (duplicate.exact || body?.allowSimilar !== true))) {
      const named = [fresh.organization && `the organization ${fresh.organization}`, fresh.contact && `the contact ${fresh.contact}`].filter(Boolean).join(" and ");
      throw new HttpError(409, `Saving this deal creates ${named}. Confirm to continue.`, { code: "confirm_create", ...fresh });
    }
    const lead = await createLead(input, user, asOptionalId(body?.ownerId), { allowSimilar: body?.allowSimilar === true, opportunityId: asOptionalId(body?.opportunityId), organizationId, personId });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Create deal");
  }
}
