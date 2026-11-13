import { NextResponse } from "next/server";
import { businessTimeZone, todayYmd } from "@/lib/dates";
import { handleRouteError } from "@/lib/http";
import { isMailerConfigured } from "@/lib/mailer";
import { listValues } from "@/features/list-values/repository";
import { listPipelines } from "@/features/pipeline/pipelines";
import { getSettings } from "@/features/settings/repository";
import { listTargetTemplates } from "@/features/targets/repository";
import { listDirectory } from "@/features/users/repository";
import { requireUser, passwordSignInEnabled } from "@/features/users/session";

/** Everything the signed-in client needs to render forms: dropdown values, the user directory, and settings. */
export async function GET() {
  try {
    await requireUser();
    const [values, users, settings, targetTemplates, pipelines] = await Promise.all([listValues(), listDirectory(), getSettings(), listTargetTemplates(), listPipelines()]);
    return NextResponse.json({
      listValues: values,
      pipelines,
      users,
      roleLabels: settings.roleLabels,
      inactivityDays: settings.reminders.inactivityDays,
      pipeline: settings.pipeline,
      holidays: settings.holidays.map((holiday) => holiday.date),
      targetTemplates,
      mailerConfigured: isMailerConfigured(),
      passwordSignIn: passwordSignInEnabled(),
      today: todayYmd(),
      timeZone: businessTimeZone(),
    });
  } catch (error) {
    return handleRouteError(error, "Reference data");
  }
}
