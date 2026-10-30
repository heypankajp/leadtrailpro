/**
 * Scheduler for LeadTrailPro's timed jobs (daily and weekly digests, TASK-06). Every JOBS_INTERVAL_SECONDS (default
 * 60) it asks the app to run whatever is due; the app decides and never sends a digest twice for one period.
 *
 *   JOBS_URL=http://localhost:3000 JOBS_KEY=<same value as the app's JOBS_KEY> node scripts/jobs.mjs
 *
 * compose.yaml runs this as the `jobs` service. Any external cron can replace it by POSTing to /api/jobs/run with
 * the X-Jobs-Key header.
 */
const url = `${(process.env.JOBS_URL || "http://localhost:3000").replace(/\/$/, "")}/api/jobs/run`;
const key = process.env.JOBS_KEY?.trim();
const every = Math.max(15, Number(process.env.JOBS_INTERVAL_SECONDS || "60")) * 1000;

if (!key) {
  console.error("JOBS_KEY is required (the same value the app has).");
  process.exit(1);
}

let failures = 0;
async function tick() {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Jobs-Key": key }, body: "{}" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      failures += 1;
      if (failures === 1 || failures % 30 === 0) console.error(`jobs: ${url} answered ${response.status} ${data.error ?? ""}`.trim());
      return;
    }
    if (failures) { console.log(`jobs: ${url} reachable again`); failures = 0; }
    for (const run of data.ran ?? []) console.log(`${new Date().toISOString()} ${run.job} digest sent to ${run.recipients} recipient(s), ${run.failures} failure(s) [${run.periodKey}]`);
  } catch (error) {
    failures += 1;
    if (failures === 1 || failures % 30 === 0) console.error(`jobs: ${url} unreachable: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`LeadTrailPro jobs: polling ${url} every ${every / 1000}s`);
await tick();
setInterval(() => { void tick(); }, every);
