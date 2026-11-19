import { NextResponse } from "next/server";
import { handleRouteError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { lookupCompanyWebsite } from "@/features/contacts/websiteLookup";
import { requireUser } from "@/features/users/session";

/** Add company → Website → Fetch: the company's name, industry, city and address read from its website (POST { url }). */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireUser();
    const body = await readJsonBody(request);
    const url = typeof body?.url === "string" ? body.url.slice(0, 2048) : "";
    return NextResponse.json({ details: await lookupCompanyWebsite(url) });
  } catch (error) {
    return handleRouteError(error, "Read the company's website");
  }
}
