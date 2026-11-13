import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { parseSearchInput } from "@/features/opportunities/model";
import { createSearch, listSearches } from "@/features/opportunities/repository";
import { getSettings } from "@/features/settings/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

/** The shared keyword searches that feed the pool (OPP-03 as decided: one list kept by administrators). */
export async function GET() {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view leads.");
    const [searches, settings] = await Promise.all([listSearches(), getSettings()]);
    // The defaults pre-fill a new search (Settings → Opportunity searches).
    return NextResponse.json({ searches, defaults: { titles: settings.opportunities.defaultTitles, location: settings.opportunities.defaultLocation, postedWithinDays: settings.opportunities.postedWithinDays } });
  } catch (error) {
    return handleRouteError(error, "List lead searches");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "Only an administrator can add searches.");
    const { input, errors } = parseSearchInput(await readJsonBody(request));
    if (errors.length) return jsonError(400, errors.join(" "));
    return NextResponse.json({ search: await createSearch(input, user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Create lead search");
  }
}
