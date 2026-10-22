import { NextResponse } from "next/server";
import { handleRouteError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { getDatabasePool } from "@/lib/db";
import { parseNotificationPrefs } from "@/features/users/model";
import { updateNotificationPrefs } from "@/features/users/repository";
import { requireUser } from "@/features/users/session";

/** The signed-in user's own notification preferences (NTF-05). */
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const prefs = parseNotificationPrefs(await readJsonBody(request));
    const updated = await updateNotificationPrefs(user.id, prefs);
    await recordAudit(getDatabasePool(), { actorId: user.id, action: "user.preferences_updated", entityType: "user", entityId: user.id, before: { ...user.notificationPrefs }, after: { ...prefs }, details: `${user.name} updated notification preferences` });
    return NextResponse.json({ user: updated });
  } catch (error) {
    return handleRouteError(error, "Update preferences");
  }
}
