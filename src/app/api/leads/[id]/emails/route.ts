import { NextResponse } from "next/server";
import { getLead } from "@/features/leads/repository";
import { getRequestUser, hasPrivilege } from "@/features/users/session";
import { recentLeadEmails } from "@/features/gmail/gmail";

type RouteContext = { params: Promise<{ id: string }> };
const safeAddress = /^[^\s"'()<>,;\\]+@[^\s"'()<>,;\\]+$/;

export async function GET(_request: Request, context: RouteContext) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Sign in to view emails." }, { status: 401 });
  if (!hasPrivilege(user, "view_leads")) return NextResponse.json({ error: "You do not have permission to view leads." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });

  try {
    const lead = await getLead(id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const addresses = [lead.contactEmail, lead.alternateEmail].filter((value): value is string => Boolean(value && safeAddress.test(value)));
    const result = await recentLeadEmails(addresses, user.role === "Administrator" ? "all" : { userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load lead emails.", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Emails could not be loaded." }, { status: 503 });
  }
}
