import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { runDigestJobs } from "@/features/notifications/digests";
import { getRequestUser, hasPrivilege } from "@/features/users/session";

const keyMatches = (supplied: string | null) => {
  const expected = process.env.JOBS_KEY?.trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Scheduled jobs (TASK-06). The scheduler (scripts/jobs.mjs or an external cron) calls this every minute with
 * `X-Jobs-Key`; whatever is due runs once. An administrator may instead force a digest for themselves from Settings.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request)) ?? {};
    const job = body.job === "daily" || body.job === "weekly" ? body.job : null;
    if (keyMatches(request.headers.get("x-jobs-key"))) {
      return NextResponse.json(await runDigestJobs({ force: body.force === true ? job : null }));
    }
    requireSameOrigin(request);
    const user = await getRequestUser();
    if (!user || !hasPrivilege(user, "manage_settings")) return jsonError(403, "A valid X-Jobs-Key header or an administrator session is required.");
    if (!job) return jsonError(400, "Choose the daily or the weekly digest.");
    return NextResponse.json(await runDigestJobs({ force: job, onlyUserId: body.onlyMe === false ? null : user.id, actorId: user.id }));
  } catch (error) {
    return handleRouteError(error, "Run jobs");
  }
}
