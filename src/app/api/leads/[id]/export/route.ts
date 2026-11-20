import { handleRouteError, jsonError } from "@/lib/http";
import { dealWorkbook } from "@/features/deletion/export";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

/** The deal's details as an Excel workbook (request of November 20, 2026): "export the data" on a deleted deal. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view deals.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid deal ID.");
    const file = await dealWorkbook(id);
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.fileName}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error, "Export deal");
  }
}
