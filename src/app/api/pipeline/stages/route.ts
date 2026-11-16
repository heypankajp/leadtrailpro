import { NextResponse } from "next/server";
import { asOptionalId, asString, handleRouteError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { addStage } from "@/features/pipeline/stages";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** PD-21: a new stage at the end of a pipeline (the default one unless `pipelineId` names another). */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_stages", "You do not have permission to edit the pipeline's stages.");
    const body = await readJsonBody(request);
    const stage = await addStage(asString(body?.name, 120), asOptionalId(body?.pipelineId), user);
    return NextResponse.json({ stage }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Add stage");
  }
}
