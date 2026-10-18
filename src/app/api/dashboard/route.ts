import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { buildDashboard } from "@/features/reports/repository";
import { requireUser } from "@/features/users/session";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const scope = new URL(request.url).searchParams.get("scope") === "team" ? "team" : "mine";
    return NextResponse.json(await buildDashboard(user, scope));
  } catch (error) {
    return handleRouteError(error, "Dashboard");
  }
}
