import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { leadTodoCounts } from "@/features/opportunities/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** How many leads are on each To Do list (request of November 20, 2026): the caller's own and everyone's. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    return NextResponse.json({ counts: await leadTodoCounts(user) });
  } catch (error) {
    return handleRouteError(error, "Count the leads on To Do lists");
  }
}
