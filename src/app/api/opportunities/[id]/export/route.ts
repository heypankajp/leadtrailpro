import { handleRouteError, jsonError } from "@/lib/http";
import { leadWorkbook } from "@/features/deletion/export";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** The lead's details as an Excel workbook (request of November 20, 2026), from Restore Data before it is removed for good. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const { id: rawId } = await context.params;
    if (!/^\d+$/.test(rawId)) return jsonError(400, "Invalid lead ID.");
    const file = await leadWorkbook(Number(rawId));
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.fileName}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error, "Export lead");
  }
}
