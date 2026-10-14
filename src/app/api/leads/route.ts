import { NextResponse } from "next/server";
import { parseLeadRecord } from "@/features/leads/model";
import { createLead, listLeads } from "@/features/leads/repository";
import { getRequestUser, hasPrivilege, isSameOriginRequest } from "@/features/users/session";

function databaseErrorResponse() {
  return NextResponse.json(
    { error: "Database connection failed. Verify MySQL is running and the MYSQL_* settings in .env.local." },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Sign in to view leads." }, { status: 401 });
    if (!hasPrivilege(user, "view_leads")) return NextResponse.json({ error: "You do not have permission to view leads." }, { status: 403 });
    return NextResponse.json({ leads: await listLeads() });
  } catch (error) {
    console.error("Failed to load leads from MySQL.", error instanceof Error ? error.name : "Unknown error");
    return databaseErrorResponse();
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Sign in to create leads." }, { status: 401 });
  if (!hasPrivilege(user, "create_leads")) return NextResponse.json({ error: "You do not have permission to create leads." }, { status: 403 });
  const lead = parseLeadRecord(await request.json().catch(() => null));
  if (!lead) return NextResponse.json({ error: "Invalid lead data." }, { status: 400 });

  try {
    return NextResponse.json({ lead: await createLead(lead) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create lead in MySQL.", error instanceof Error ? error.name : "Unknown error");
    return databaseErrorResponse();
  }
}
