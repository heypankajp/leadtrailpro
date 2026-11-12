import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http";
import { parsePipelineFilters } from "@/features/pipeline/model";
import { listPipeline } from "@/features/pipeline/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The Pipeline board (PIPE-04): stages with counts and cards, own leads or the team's. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const filters = parsePipelineFilters(new URL(request.url).searchParams);
    return NextResponse.json(await listPipeline(filters, user));
  } catch (error) {
    return handleRouteError(error, "Pipeline");
  }
}
