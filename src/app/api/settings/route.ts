import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { getMailProvider, isMailerConfigured, listOutbox } from "@/lib/mailer";
import { businessTimeZone } from "@/lib/dates";
import { sourceStatuses } from "@/features/jobs/repository";
import { getSettings, updateSettings } from "@/features/settings/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

export async function GET() {
  try {
    const user = await requireUser();
    // The outbox (which holds reset links and sign-in codes in stub mode) is for administrators only.
    const manages = hasPrivilege(user, "manage_settings");
    const outbox = manages ? await listOutbox(20) : [];
    return NextResponse.json({ settings: await getSettings(), mailerConfigured: isMailerConfigured(), mail: { provider: getMailProvider(), outbox }, jobSources: manages ? await sourceStatuses() : [], timeZone: businessTimeZone() });
  } catch (error) {
    return handleRouteError(error, "Load settings");
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to change settings.");
    const body = await readJsonBody(request);
    if (!body) return jsonError(400, "Invalid settings.");
    const roleLabels = body.roleLabels && typeof body.roleLabels === "object" ? body.roleLabels as Record<string, string> : undefined;
    const reminders = body.reminders && typeof body.reminders === "object" ? body.reminders as { inactivityDays?: number; rules?: unknown } : undefined;
    const holidays = body.holidays !== undefined ? body.holidays : undefined;
    const digests = body.digests !== undefined ? body.digests : undefined;
    const jobSources = body.jobSources !== undefined ? body.jobSources : undefined;
    const settings = await updateSettings({ roleLabels, reminders, digests, jobSources, holidays }, user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error, "Update settings");
  }
}
