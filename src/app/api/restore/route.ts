import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { listDeleted, restoreDeals, restoreLeadCards } from "@/features/deletion/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** Restore Data (request of November 20, 2026): GET ?kind=deals|leads lists what was deleted in the last 30 days. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view deals.");
    const kind = new URL(request.url).searchParams.get("kind") === "leads" ? "leads" : "deals";
    const [deals, leads] = await Promise.all([listDeleted("deals", user), listDeleted("leads", user)]);
    return NextResponse.json({ items: kind === "deals" ? deals : leads, counts: { deals: deals.length, leads: leads.length } });
  } catch (error) {
    return handleRouteError(error, "Restore data");
  }
}

/** `{ kind: "deals" | "leads", ids: number[] }`: restores those the user may restore; answers how many came back. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to restore.");
    const body = await readJsonBody(request);
    const raw: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    const ids = [...new Set(raw.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))].slice(0, 500);
    if (!ids.length) return jsonError(400, "Choose what to restore.");
    if (body?.kind === "leads") {
      requirePrivilege(user, "create_leads", "You do not have permission to restore leads.");
      return NextResponse.json({ restored: await restoreLeadCards(ids, user) });
    }
    requirePrivilege(user, "archive_leads", "You do not have permission to restore deals.");
    return NextResponse.json({ restored: await restoreDeals(ids, user) });
  } catch (error) {
    return handleRouteError(error, "Restore");
  }
}
