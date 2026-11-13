import { NextResponse } from "next/server";
import { asOptionalId, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { getLead, setLeadStage } from "@/features/leads/repository";
import { createStageFollowUp } from "@/features/pipeline/follow-up";
import { requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Moves a lead to a stage (PIPE-05): from the board (drag-and-drop or Move to…) or the lead page. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid deal ID.");
    const body = await readJsonBody(request);
    const stageId = asOptionalId(body?.stageId);
    if (!stageId) return jsonError(400, "Choose a stage.");
    const via = body?.via === "detail" ? "detail" : "board";
    const before = await getLead(id);
    if (!before) return jsonError(404, "Deal not found.");
    const lead = await setLeadStage(id, stageId, user, via);
    // PIPE-09: with Settings → Pipeline "create automatically" on, the stage's suggested task is created for the owner.
    const task = lead.stageId !== before.stageId
      ? await createStageFollowUp(lead, user).catch((error: unknown) => { console.error("Stage follow-up failed.", error instanceof Error ? error.message : error); return null; })
      : null;
    return NextResponse.json({ lead, task });
  } catch (error) {
    return handleRouteError(error, "Move deal");
  }
}
