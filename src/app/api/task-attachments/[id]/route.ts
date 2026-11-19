import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { readAttachmentFile } from "@/features/attachments/storage";
import { getTaskAttachment, removeTaskAttachment } from "@/features/tasks/attachments";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const value = Number((await context.params).id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const inlineTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"]);

/** An activity's file, for preview (inline) or download (?download=1), served like a deal's documents. */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireUser();
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid file ID.");
    const attachment = await getTaskAttachment(id);
    if (!attachment) return jsonError(404, "File not found.");
    const bytes = await readAttachmentFile(attachment.storageKey);
    const download = new URL(request.url).searchParams.get("download") === "1" || !inlineTypes.has(attachment.mimeType);
    const encodedName = encodeURIComponent(attachment.fileName).replace(/['()]/g, escape);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return handleRouteError(error, "Read activity file");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_tasks", "You do not have permission to change activities.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid file ID.");
    await removeTaskAttachment(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Remove activity file");
  }
}
