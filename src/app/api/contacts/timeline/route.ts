import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { todayYmd } from "@/lib/dates";
import { parseContactQuery } from "@/features/contacts/model";
import { contactsTimeline } from "@/features/contacts/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Contacts timeline (SPEC §10.17): people with their calls, emails, visits and notes per month (GET ?q=&page=&month=YYYY-MM). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view contacts.");
    const params = new URL(request.url).searchParams;
    const month = /^(\d{4}-\d{2}|old)$/.test(params.get("month") ?? "") ? params.get("month") : null;
    return NextResponse.json(await contactsTimeline(parseContactQuery(params), todayYmd(), undefined, month));
  } catch (error) {
    return handleRouteError(error, "Contacts timeline");
  }
}
