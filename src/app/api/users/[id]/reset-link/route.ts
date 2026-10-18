import { NextResponse } from "next/server";
import { appBaseUrl, handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { isMailerConfigured, passwordResetEmail, sendMail } from "@/lib/mailer";
import { getUser } from "@/features/users/repository";
import { createPasswordResetToken, requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** Emails a set-password link to a user (used to invite someone once SMTP is configured). */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    requirePrivilege(actor, "manage_users", "You do not have permission to manage users.");
    if (!isMailerConfigured()) return jsonError(503, "Email delivery is not configured. Add the SMTP_* settings to .env.local first.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid user ID.");
    const user = await getUser(id);
    if (!user || !user.active) return jsonError(404, "Active user not found.");
    const token = await createPasswordResetToken(user.id);
    await sendMail({ to: user.email, ...passwordResetEmail(user.firstName, `${appBaseUrl(request)}/?reset=${encodeURIComponent(token)}`) });
    return NextResponse.json({ ok: true, message: `A set-password link was emailed to ${user.email}.` });
  } catch (error) {
    return handleRouteError(error, "Send reset link");
  }
}
