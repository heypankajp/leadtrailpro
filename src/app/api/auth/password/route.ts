import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { isValidPassword } from "@/features/users/model";
import { setUserPassword } from "@/features/users/repository";
import { getRequestSessionToken, hashToken, requireUser, verifyPassword } from "@/features/users/session";

/** Lets a signed-in person change their own password. Other sessions are signed out. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const body = await readJsonBody(request);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = body?.newPassword;
    if (!isValidPassword(newPassword)) return jsonError(400, "The new password must be between 12 and 200 characters.");
    if (currentPassword === newPassword) return jsonError(400, "Choose a password you have not used just now.");
    if (!(await verifyPassword(user.email, currentPassword))) return jsonError(400, "The current password is incorrect.");
    const token = await getRequestSessionToken();
    await setUserPassword(user.id, newPassword, user.id, { keepSessionTokenHash: token ? hashToken(token) : undefined, reason: "Password changed by the account holder" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Password change");
  }
}
