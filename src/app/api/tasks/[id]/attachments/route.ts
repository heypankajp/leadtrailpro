import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { listTaskAttachments, uploadTaskAttachment } from "@/features/tasks/attachments";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const parseId = async (context: RouteContext) => {
  const value = Number((await context.params).id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/** The files of an activity (Schedule an activity, request of November 18, 2026). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireUser();
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid activity ID.");
    return NextResponse.json({ attachments: await listTaskAttachments(id) });
  } catch (error) {
    return handleRouteError(error, "List activity files");
  }
}

/** Multipart upload: field `file`. The activity's assignee, creator, or someone who may edit any deal. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_tasks", "You do not have permission to change activities.");
    const id = await parseId(context);
    if (!id) return jsonError(400, "Invalid activity ID.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError(400, "Choose a file to upload.");
    return NextResponse.json({ attachment: await uploadTaskAttachment(id, file, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Upload activity file");
  }
}
