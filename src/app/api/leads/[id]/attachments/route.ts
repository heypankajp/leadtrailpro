import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { listAttachments, uploadAttachment } from "@/features/attachments/repository";
import { getLead } from "@/features/leads/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid lead ID.");
    return NextResponse.json({ attachments: await listAttachments(id, { includeDeleted: hasPrivilege(user, "delete_files") }) });
  } catch (error) {
    return handleRouteError(error, "List attachments");
  }
}

/** Multipart upload: fields `file`, `category` (document | profile), and `label`. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "upload_files", "You do not have permission to upload files.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid lead ID.");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) return jsonError(400, "Choose a file to upload.");
    const category = form.get("category") === "profile" ? "profile" : "document";
    const label = typeof form.get("label") === "string" ? String(form.get("label")) : "";
    const attachment = await uploadAttachment({ leadId: id, category, label, file }, user);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Upload attachment");
  }
}
