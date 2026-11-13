import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { todayYmd } from "@/lib/dates";
import { parseContactQuery } from "@/features/contacts/model";
import { contactsTimeline } from "@/features/contacts/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Contacts timeline (SPEC §10.17): people with their calls, emails, visits and notes per month (GET ?q=&page=). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view contacts.");
    return NextResponse.json(await contactsTimeline(parseContactQuery(new URL(request.url).searchParams), todayYmd()));
  } catch (error) {
    return handleRouteError(error, "Contacts timeline");
  }
}
