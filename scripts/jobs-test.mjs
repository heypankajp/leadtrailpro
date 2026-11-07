/**
 * Calls every configured job-listing source for one real company, through the same adapters the app uses, and
 * prints what each returns. For checking keys and coverage before the trip planner has real companies.
 *
 *   npm run jobs:test -- "OceanMD" Toronto            # every configured source
 *   npm run jobs:test -- "OceanMD" Toronto --source adzuna
 *   npm run jobs:test -- --balance                      # HasData credits left on the account (free call, nothing spent)
 *
 * Reads ADZUNA_APP_ID/ADZUNA_APP_KEY, JSEARCH_API_KEY, HASDATA_API_KEY/HASDATA_INDEED_DOMAIN, JOBS_API_URL/JOBS_API_KEY,
 * and JOBS_COUNTRY from .env.local. Each run spends one call per source (Adzuna one hit, HasData ten credits).
 * Needs the source tree (dev container or laptop), not the production image.
 */
import { plainName } from "../src/features/jobs/model.ts";
import { createAdzunaSource } from "../src/features/jobs/sources/adzuna.ts";
import { createGenericSource } from "../src/features/jobs/sources/generic.ts";
import { createHasDataSource } from "../src/features/jobs/sources/hasdata.ts";
import { createJSearchSource } from "../src/features/jobs/sources/jsearch.ts";
import { fetchHasDataUsage } from "../src/features/jobs/sources/hasdata.ts";
import { parseHasDataUsage } from "../src/features/jobs/model.ts";

const env = (name) => process.env[name]?.trim() || null;
const args = process.argv.slice(2);

// --balance: only ask HasData for the account's credit balance (a free call), as Settings → Job listing sources does.
if (args.includes("--balance")) {
  if (!env("HASDATA_API_KEY")) { console.error("HASDATA_API_KEY is empty in .env.local."); process.exit(1); }
  try {
    const account = parseHasDataUsage(await fetchHasDataUsage(env("HASDATA_API_KEY")));
    if (!account) { console.error("HasData answered, but not with the expected totalCredits/availableCredits fields."); process.exit(1); }
    console.log(`HasData account: ${account.availableCredits.toLocaleString()} of ${account.totalCredits.toLocaleString()} credits available (${Math.floor(account.availableCredits / 10)} Indeed calls at 10 credits each).`);
  } catch (error) {
    console.error(`HasData balance check failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  process.exit(0);
}
const sourceIndex = args.indexOf("--source");
const only = sourceIndex !== -1 ? args[sourceIndex + 1] : null;
const positional = args.filter((arg, index) => sourceIndex === -1 || (index !== sourceIndex && index !== sourceIndex + 1));
const [companyName, city = ""] = positional;

if (!companyName) {
  console.error('Usage: npm run jobs:test -- "<company name>" [city] [--source adzuna|jsearch|hasdata|generic]');
  process.exit(1);
}

const adapters = [
  createAdzunaSource(env("ADZUNA_APP_ID") && env("ADZUNA_APP_KEY") ? { appId: env("ADZUNA_APP_ID"), appKey: env("ADZUNA_APP_KEY") } : null),
  createJSearchSource(env("JSEARCH_API_KEY")),
  createHasDataSource(env("HASDATA_API_KEY") ? { apiKey: env("HASDATA_API_KEY"), domain: env("HASDATA_INDEED_DOMAIN") } : null),
  createGenericSource(env("JOBS_API_URL") && env("JOBS_API_KEY") ? { url: env("JOBS_API_URL"), key: env("JOBS_API_KEY") } : null),
].filter((adapter) => !only || adapter.id === only);

if (!adapters.length) {
  console.error(`Unknown source "${only}". Use adzuna, jsearch, hasdata, or generic.`);
  process.exit(1);
}

const input = { companyName, website: "", address: city, city, country: (env("JOBS_COUNTRY") ?? "ca").toLowerCase(), normalize: plainName };
console.log(`Looking up "${companyName}"${city ? ` in ${city}` : ""} (country ${input.country})…`);
let failures = 0;
for (const adapter of adapters) {
  if (!adapter.configured) { console.log(`- ${adapter.id}: not configured, skipped.`); continue; }
  const started = Date.now();
  try {
    const listings = await adapter.companyJobs(input);
    console.log(`- ${adapter.id}: ${listings.length} listing${listings.length === 1 ? "" : "s"} kept for this company (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    for (const job of listings.slice(0, 5)) console.log(`    ${job.title} · via ${job.source}${job.location ? ` · ${job.location}` : ""}${job.postedAt ? ` · ${job.postedAt}` : ""}${job.employmentType ? ` · ${job.employmentType}` : ""}`);
    if (listings.length > 5) console.log(`    … and ${listings.length - 5} more`);
  } catch (error) {
    failures += 1;
    console.log(`- ${adapter.id}: FAILED after ${((Date.now() - started) / 1000).toFixed(1)} s: ${error instanceof Error ? error.message : error}`);
  }
}
process.exitCode = failures ? 1 : 0;
