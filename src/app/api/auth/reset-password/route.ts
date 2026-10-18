import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { isValidPassword } from "@/features/users/model";
import { setUserPassword } from "@/features/users/repository";
import { consumePasswordResetToken } from "@/features/users/session";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request);
    const token = typeof body?.token === "string" ? body.token : "";
    if (!isValidPassword(body?.password)) return jsonError(400, "The new password must be between 12 and 200 characters.");
    const userId = await consumePasswordResetToken(token);
    if (!userId) return jsonError(400, "This reset link is invalid or has expired. Request a new one.");
    await setUserPassword(userId, body.password, userId, { reason: "Password reset through an emailed link" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Password reset");
  }
}
