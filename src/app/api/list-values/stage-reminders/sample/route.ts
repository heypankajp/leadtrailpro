import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { MailerNotConfiguredError } from "@/lib/mailer";
import { sendSampleStageReminder } from "@/features/pipeline/stage-reminders";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Sends a sample of the stage reminder email to { to } (request of November 20, 2026). */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    const body = await readJsonBody(request);
    return NextResponse.json(await sendSampleStageReminder(String(body?.to ?? ""), user));
  } catch (error) {
    if (error instanceof MailerNotConfiguredError) return jsonError(503, "Email delivery is not set up on this server (Settings → Email delivery).");
    return handleRouteError(error, "Send a sample reminder");
  }
}
