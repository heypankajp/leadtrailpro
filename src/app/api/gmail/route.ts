import { NextResponse } from "next/server";
import { handleRouteError, requireSameOrigin } from "@/lib/http";
import { getConnectionEmail, googleConfig, removeConnection } from "@/features/gmail/gmail";
import type { GmailStatus } from "@/features/gmail/model";
import { hasPrivilege, requireUser } from "@/features/users/session";

/** Gmail link status for the signed-in user (MAIL-01). */
export async function GET() {
  try {
    const user = await requireUser();
    const status: GmailStatus = {
      configured: Boolean(googleConfig()),
      connectedEmail: (await getConnectionEmail(user.id)) ?? null,
      allMailboxes: hasPrivilege(user, "view_team_reports"),
    };
    return NextResponse.json(status);
  } catch (error) {
    return handleRouteError(error, "Gmail status");
  }
}

/** Removes the signed-in user's Gmail link and its stored refresh token. */
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    await removeConnection(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Disconnect Gmail");
  }
}
