import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/http";
import { hasJobsKey } from "@/lib/jobs-key";
import { parseDeployEvent } from "@/features/deploy/model";
import { recordDeployEvent } from "@/features/deploy/repository";

/** The deployer container's channel (SPEC §2.4), `X-Jobs-Key` only: its heartbeat (`poll`), and the start and finish of each deploy. */
export async function POST(request: Request) {
  try {
    if (!hasJobsKey(request)) return jsonError(403, "A valid X-Jobs-Key header is required.");
    const event = parseDeployEvent(await readJsonBody(request));
    if ("error" in event) return jsonError(400, event.error);
    return NextResponse.json(await recordDeployEvent(event));
  } catch (error) {
    return handleRouteError(error, "Record deploy event");
  }
}
