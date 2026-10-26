import type { JobListing } from "../../trips/model.ts";
import type { JobSourceId } from "../model.ts";

export type CompanyJobsInput = { companyName: string; website: string; address: string; city: string; country: string; /** The trip planner's company-name normaliser (features/trips/matching). */ normalize: (name: string) => string };

/** One job-listing source (SPEC §7.13). `companyJobs` returns the company's active listings; it throws on a failed call. */
export interface JobSourceAdapter {
  readonly id: JobSourceId;
  readonly configured: boolean;
  /** Minimum gap between two calls to this source, to stay inside its rate limit. */
  readonly minIntervalMs: number;
  companyJobs(input: CompanyJobsInput): Promise<JobListing[]>;
}

export class JobSourceError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) { super(message); this.status = status; }
}

/** GET JSON with a timeout; non-2xx responses become JobSourceError with the status (429 = rate limited). */
export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new JobSourceError(`Source request failed (${response.status}).`, response.status);
  return (await response.json()) as Record<string, unknown>;
}

export const text = (value: unknown, max = 200): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
export const ymd = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);
export const httpUrl = (value: unknown): string => { const link = text(value, 2048); return /^https?:\/\//i.test(link) ? link : ""; };
export const cityOf = (address: string): string => { const parts = address.split(",").map((part) => part.trim()).filter(Boolean); return parts.length >= 2 ? parts[parts.length - 2].replace(/\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i, "") : parts[0] ?? ""; };
