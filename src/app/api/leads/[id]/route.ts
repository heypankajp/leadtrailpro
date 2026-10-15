import { NextResponse } from "next/server";
import { parseLeadRecord } from "@/features/leads/model";
import { getLead, removeLead, updateLead } from "@/features/leads/repository";
import { getRequestUser, hasPrivilege, isSameOriginRequest } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

function databaseErrorResponse() {
  return NextResponse.json(
    { error: "Database connection failed. Verify MySQL is running and the MYSQL_* settings in .env.local." },
    { status: 503 },
  );
}

export async function PUT(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Sign in to update leads." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  const lead = parseLeadRecord(await request.json().catch(() => null));
  if (!Number.isSafeInteger(id) || id < 1 || !lead) {
    return NextResponse.json({ error: "Invalid lead data." }, { status: 400 });
  }
  const canEdit = hasPrivilege(user, "edit_leads");
  const canTransfer = hasPrivilege(user, "transfer_leads");
  if (!canEdit && !canTransfer) {
    return NextResponse.json({ error: "You do not have permission to update leads." }, { status: 403 });
  }

  try {
    const existing = await getLead(id);
    if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (existing.recordState !== lead.recordState && !hasPrivilege(user, "archive_leads")) {
      return NextResponse.json({ error: "You do not have permission to archive, restore, or review leads." }, { status: 403 });
    }
    if (existing.owner !== lead.owner && !canTransfer) {
      return NextResponse.json({ error: "You do not have permission to transfer leads." }, { status: 403 });
    }
    const leadFields = [
      "name", "companyUrl", "contact", "contactEmail", "alternateEmail", "contactPhone", "initials", "color",
      "status", "action", "followUp", "city", "industry", "lastActivity", "type", "firstContact", "recordState",
    ] as const;
    if (!canEdit && leadFields.some((key) => lead[key] !== (existing[key] ?? ""))) {
      return NextResponse.json({ error: "You can transfer ownership but cannot edit lead details." }, { status: 403 });
    }
    if (!(await updateLead(id, lead))) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    return NextResponse.json({ lead: { ...lead, id } });
  } catch (error) {
    console.error("Failed to update lead in MySQL.", error instanceof Error ? error.name : "Unknown error");
    return databaseErrorResponse();
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!isSameOriginRequest(_request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete leads." }, { status: 401 });
  if (!hasPrivilege(user, "archive_leads")) return NextResponse.json({ error: "You do not have permission to remove leads." }, { status: 403 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
  }

  try {
    if (!(await removeLead(id))) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete lead from MySQL.", error instanceof Error ? error.name : "Unknown error");
    return databaseErrorResponse();
  }
}
