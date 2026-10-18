import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { getAttachmentWithStorage, softDeleteAttachment } from "@/features/attachments/repository";
import { readAttachmentFile } from "@/features/attachments/storage";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const inlineTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"]);

/** Streams the file for preview (inline) or download (?download=1). */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view files.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid attachment ID.");
    const attachment = await getAttachmentWithStorage(id);
    if (!attachment || (attachment.deletedAt && !hasPrivilege(user, "delete_files"))) return jsonError(404, "Attachment not found.");
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
    return handleRouteError(error, "Read attachment");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "delete_files", "You do not have permission to remove files.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid attachment ID.");
    await softDeleteAttachment(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Remove attachment");
  }
}
