import { NextResponse } from "next/server";
import { asOptionalId, asString, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { deleteStage, moveStage, renameStage } from "@/features/pipeline/stages";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

async function stageId(context: RouteContext): Promise<number | null> {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** PD-21: `{ name }` renames the stage, `{ direction: "left" | "right" }` moves it one place within its pipeline. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_stages", "You do not have permission to edit the pipeline's stages.");
    const id = await stageId(context);
    if (!id) return jsonError(400, "Invalid stage ID.");
    const body = await readJsonBody(request);
    if (body?.direction === "left" || body?.direction === "right") {
      await moveStage(id, body.direction, user);
      return NextResponse.json({ ok: true });
    }
    if (typeof body?.name === "string") return NextResponse.json({ stage: await renameStage(id, asString(body.name, 120), user) });
    return jsonError(400, "Send a new name or a direction.");
  } catch (error) {
    return handleRouteError(error, "Edit stage");
  }
}

/** PD-21: deletes the stage; `?moveTo=<id>` names the stage that takes its deals. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_stages", "You do not have permission to edit the pipeline's stages.");
    const id = await stageId(context);
    if (!id) return jsonError(400, "Invalid stage ID.");
    const moveTo = asOptionalId(new URL(request.url).searchParams.get("moveTo"));
    return NextResponse.json(await deleteStage(id, moveTo, user));
  } catch (error) {
    return handleRouteError(error, "Delete stage");
  }
}
