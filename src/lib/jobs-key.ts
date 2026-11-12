import { timingSafeEqual } from "node:crypto";

/**
 * Whether the request carries the shared secret of the server's own helper containers (`X-Jobs-Key` = JOBS_KEY): the
 * `jobs` scheduler and the `deployer`. Compared in constant time; never true while JOBS_KEY is unset.
 */
export function hasJobsKey(request: Request): boolean {
  const expected = process.env.JOBS_KEY?.trim();
  const supplied = request.headers.get("x-jobs-key");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
