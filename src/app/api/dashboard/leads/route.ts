import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { buildLeadDashboard } from "@/features/dashboard/lead-dashboard";
import { requireUser } from "@/features/users/session";

/** The Action Center for leads (request of November 20, 2026): `scope` mine (default) or team. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const scope = new URL(request.url).searchParams.get("scope") === "team" ? "team" : "mine";
    return NextResponse.json(await buildLeadDashboard(user, scope));
  } catch (error) {
    return handleRouteError(error, "Lead dashboard");
  }
}
