import { NextResponse } from "next/server";
import { asString, handleRouteError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { createPipeline, listPipelines } from "@/features/pipeline/pipelines";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The pipelines (PD-09, SPEC §10.18). */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ pipelines: await listPipelines() });
  } catch (error) {
    return handleRouteError(error, "List pipelines");
  }
}

/** Adds a pipeline: `{ name }`. It starts with one stage, "New". */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage pipelines.");
    const body = await readJsonBody(request);
    return NextResponse.json({ pipeline: await createPipeline(asString(body?.name, 80), user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Add pipeline");
  }
}
