import { createAdzunaSource } from "./adzuna";
import { createGenericSource } from "./generic";
import { createHasDataSource } from "./hasdata";
import { createJSearchSource } from "./jsearch";
import { createStubSource } from "./stub";
import type { JobSourceAdapter } from "./types";

export type { CompanyJobsInput, JobSourceAdapter } from "./types";

const env = (name: string): string | null => process.env[name]?.trim() || null;

/** Every adapter, configured or not, built from the environment (keys never leave the server). */
export function listSourceAdapters(): JobSourceAdapter[] {
  const adzunaId = env("ADZUNA_APP_ID");
  const adzunaKey = env("ADZUNA_APP_KEY");
  const hasDataKey = env("HASDATA_API_KEY");
  const genericUrl = env("JOBS_API_URL");
  const genericKey = env("JOBS_API_KEY");
  const stubEnabled = (env("TRIPS_PROVIDER") ?? "").toLowerCase() === "stub" || (env("JOBS_SOURCES") ?? "").split(",").map((item) => item.trim().toLowerCase()).includes("stub");
  return [
    createAdzunaSource(adzunaId && adzunaKey ? { appId: adzunaId, appKey: adzunaKey } : null),
    createJSearchSource(env("JSEARCH_API_KEY")),
    createHasDataSource(hasDataKey ? { apiKey: hasDataKey, domain: env("HASDATA_INDEED_DOMAIN") } : null),
    createGenericSource(genericUrl && genericKey ? { url: genericUrl, key: genericKey } : null),
    createStubSource(stubEnabled),
  ];
}

/** Country code for the sources that take one (Adzuna, JSearch); `JOBS_COUNTRY`, default Canada. */
export const jobsCountry = (): string => (env("JOBS_COUNTRY") ?? "ca").toLowerCase();

export const jobSourcesConfigured = (): boolean => listSourceAdapters().some((adapter) => adapter.configured);
