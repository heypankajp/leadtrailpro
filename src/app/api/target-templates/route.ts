import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseTargetTemplate, type TargetTemplateInput } from "@/features/targets/model";
import { createTargetTemplate, listTargetTemplates } from "@/features/targets/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ templates: await listTargetTemplates() });
  } catch (error) {
    return handleRouteError(error, "List target templates");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_targets", "You do not have permission to manage targets.");
    const input = parseTargetTemplate(await readJsonBody(request));
    if (!input) return jsonError(400, "Enter a template name, stage, and whole-number targets.");
    const template = await createTargetTemplate(input as TargetTemplateInput, user.id);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return jsonError(409, "A template with that name already exists.");
    return handleRouteError(error, "Create target template");
  }
}
