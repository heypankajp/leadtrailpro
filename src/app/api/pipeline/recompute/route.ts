import { NextResponse } from "next/server";
import { handleRouteError, requireSameOrigin } from "@/lib/http";
import { recomputeLeadStages } from "@/features/leads/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Places every lead again from its BD action through the current mapping (PIPE-03; List of values → BD action). */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_values", "You do not have permission to manage list values.");
    return NextResponse.json({ count: await recomputeLeadStages(user) });
  } catch (error) {
    return handleRouteError(error, "Recompute stages");
  }
}
