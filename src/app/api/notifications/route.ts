import { NextResponse } from "next/server";
import { handleRouteError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { listNotifications, markRead, unreadCount } from "@/features/notifications/repository";
import { requireUser } from "@/features/users/session";

/** The signed-in user's notifications (NTF-01 in-app channel). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get("limit") || "20");
    const notifications = await listNotifications(user.id, { limit: Number.isInteger(limit) ? limit : 20, unreadOnly: params.get("unread") === "1" });
    return NextResponse.json({ notifications, unread: await unreadCount(user.id) });
  } catch (error) {
    return handleRouteError(error, "List notifications");
  }
}

/** Marks some (`ids`) or all (`all: true`) of the user's notifications as read. */
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const body = await readJsonBody(request);
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
    await markRead(user.id, body?.all === true ? "all" : ids);
    return NextResponse.json({ unread: await unreadCount(user.id) });
  } catch (error) {
    return handleRouteError(error, "Update notifications");
  }
}
