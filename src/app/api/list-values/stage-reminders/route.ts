import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { listStageReminders, saveStageReminder } from "@/features/pipeline/stage-reminders";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The auto reminder of every pipeline stage (request of November 20, 2026). */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    return NextResponse.json({ reminders: await listStageReminders() });
  } catch (error) {
    return handleRouteError(error, "Load the auto reminders");
  }
}

/** Saves one stage's reminder: { stageId, days, count, active } (count: No. of Reminders, 1 by default). */
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    const body = await readJsonBody(request);
    const stageId = Number(body?.stageId);
    if (!Number.isSafeInteger(stageId) || stageId < 1) return jsonError(400, "Choose a pipeline stage.");
    if (typeof body?.active !== "boolean") return jsonError(400, "Say whether the reminder is active.");
    return NextResponse.json({ reminders: await saveStageReminder(stageId, Number(body.days), body.count === undefined ? 1 : Number(body.count), body.active, user) });
  } catch (error) {
    return handleRouteError(error, "Save the auto reminder");
  }
}
