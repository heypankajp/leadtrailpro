import { NextResponse } from "next/server";
import { getRequestUser, isSameOriginRequest } from "@/features/users/session";
import { getConnectionEmail, googleConfig, removeConnection } from "@/features/gmail/gmail";

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Sign in to use Gmail." }, { status: 401 });
  try {
    return NextResponse.json({
      configured: Boolean(googleConfig()),
      connectedEmail: (await getConnectionEmail(user.id)) ?? null,
      isAdmin: user.role === "Administrator",
    });
  } catch {
    return NextResponse.json({ error: "Gmail status could not be loaded." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Sign in to use Gmail." }, { status: 401 });
  await removeConnection(user.id);
  return NextResponse.json({ ok: true });
}
