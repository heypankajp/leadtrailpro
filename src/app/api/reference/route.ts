import { NextResponse } from "next/server";
import { businessTimeZone, todayYmd } from "@/lib/dates";
import { handleRouteError } from "@/lib/http";
import { isMailerConfigured } from "@/lib/mailer";
import { listValues } from "@/features/list-values/repository";
import { getSettings } from "@/features/settings/repository";
import { listTargetTemplates } from "@/features/targets/repository";
import { listDirectory } from "@/features/users/repository";
import { requireUser } from "@/features/users/session";

/** Everything the signed-in client needs to render forms: dropdown values, the user directory, and settings. */
export async function GET() {
  try {
    await requireUser();
    const [values, users, settings, targetTemplates] = await Promise.all([listValues(), listDirectory(), getSettings(), listTargetTemplates()]);
    return NextResponse.json({
      listValues: values,
      users,
      roleLabels: settings.roleLabels,
      inactivityDays: settings.reminders.inactivityDays,
      targetTemplates,
      mailerConfigured: isMailerConfigured(),
      today: todayYmd(),
      timeZone: businessTimeZone(),
    });
  } catch (error) {
    return handleRouteError(error, "Reference data");
  }
}
