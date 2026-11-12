import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { todoCounts } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** How many active leads are on each To Do list (TODO-04): the caller's own and everyone's. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    return NextResponse.json({ counts: await todoCounts(user) });
  } catch (error) {
    return handleRouteError(error, "Count To Do lists");
  }
}
