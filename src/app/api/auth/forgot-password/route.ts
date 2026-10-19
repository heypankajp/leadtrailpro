import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/db";
import { appBaseUrl, handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { isMailerConfigured, passwordResetEmail, sendMail } from "@/lib/mailer";
import { isValidEmail } from "@/features/users/model";
import { getUserByEmail } from "@/features/users/repository";
import { createPasswordResetToken } from "@/features/users/session";

/** Sends a reset link. The response is the same whether or not the address exists. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request);
    if (!isValidEmail(body?.email)) return jsonError(400, "Enter the email address you sign in with.");
    if (!isMailerConfigured()) {
      return jsonError(503, "Password reset emails are not configured yet. Ask an administrator to set a new password for you.");
    }
    const user = await getUserByEmail(body.email);
    if (user && user.active) {
      const [rows] = await getDatabasePool().query(
        "SELECT COUNT(*) AS count FROM email_tokens WHERE user_id = ? AND purpose = 'password_reset' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE",
        [user.id],
      );
      if (Number((rows as { count: number }[])[0].count) < 3) {
        const token = await createPasswordResetToken(user.id);
        const resetUrl = `${appBaseUrl(request)}/?reset=${encodeURIComponent(token)}`;
        await sendMail({ to: user.email, ...passwordResetEmail(user.firstName, resetUrl) });
      }
    }
    return NextResponse.json({ ok: true, message: "If that address belongs to an active account, a reset link is on its way." });
  } catch (error) {
    return handleRouteError(error, "Password reset request");
  }
}
