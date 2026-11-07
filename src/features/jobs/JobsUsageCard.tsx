"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, RefreshCw, SlidersHorizontal } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { fetchJobsUsage } from "./client";
import type { JobsUsageOverview, JobsUsageSource } from "./model";

const pollSeconds = 30;

type Tone = "ok" | "warn" | "spent";
const toneOf = (source: JobsUsageSource, warnAtPercent: number): Tone =>
  !source.enabled || source.budget.monthly <= 0 || source.usage.month >= source.budget.monthly || source.usage.today >= source.budget.daily || (source.account !== null && source.callsLeft === 0)
    ? "spent" : source.percent >= warnAtPercent ? "warn" : "ok";
const toneLabels: Record<Tone, string> = { ok: "Within budget", warn: "Running low", spent: "Stopped" };

function summaryOf(source: JobsUsageSource): string {
  const parts = [`${source.callsLeft} more call${source.callsLeft === 1 ? "" : "s"} possible this month`];
  if (source.account && source.creditsPerCall) parts.push(`the account holds ${source.account.availableCredits.toLocaleString()} of ${source.account.totalCredits.toLocaleString()} credits (${Math.floor(source.account.availableCredits / source.creditsPerCall)} calls at ${source.creditsPerCall} each), checked ${relativeTime(source.account.checkedAt)}`);
  else if (source.creditsPerCall) parts.push("the account balance could not be read");
  return `${parts.join("; ")}. A pool search spends one call per page of results and a Hiring lookup one call per company.`;
}

/**
 * Live job-source usage for everyone who uses the pool or the planner (SPEC §7.13): this month's calls and credits
 * against the in-app budgets, what is left, and the vendor's own balance when it offers one (HasData). Refreshes after
 * a run, polls while the page is open, and hides itself when no live source is configured.
 */
export default function JobsUsageCard({ refreshKey = 0, compact = false }: { refreshKey?: unknown; compact?: boolean }) {
  const { can, navigate, dataVersion } = useApp();
  const [tick, setTick] = useState(0);
  const fetcher = useCallback(() => fetchJobsUsage(), []);
  const { data, reload } = useAsyncData<{ usage: JobsUsageOverview }>(fetcher, `${dataVersion}:${String(refreshKey)}:${tick}`);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const usage = data?.usage;
  if (!usage || !usage.configured) return null;
  const tones = usage.sources.map((source) => toneOf(source, usage.warnAtPercent));
  const overall: Tone = tones.includes("spent") ? "spent" : tones.includes("warn") ? "warn" : "ok";

  return (
    <section className={`panel maps-usage-card jobs-usage-card${compact ? " is-compact" : ""}`} aria-label="Job-source usage this month">
      <div className="panel-heading">
        <div>
          <h2><Briefcase size={14} /> Job listing sources this month <span className={`maps-usage-pill is-${overall}`}>{toneLabels[overall]}</span></h2>
          <p>Searches and hiring lookups stop asking a source when its budget is spent; the counters restart on {formatDate(usage.resetsOn)}.</p>
        </div>
        <div className="heading-actions">
          {can("manage_settings") && <button type="button" className="text-button" onClick={() => navigate("settings")}><SlidersHorizontal size={13} /> Budgets</button>}
          <button type="button" className="text-button" onClick={reload}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>
      <div className="maps-usage-grid">
        {usage.sources.map((source, index) => (
          <div key={source.id} className={`maps-usage-tile is-${tones[index]}`}>
            <div className="maps-usage-tile-head"><strong>{source.label}</strong><span>{source.percent}%</span></div>
            <div className="progress-track" role="progressbar" aria-label={`${source.label} monthly budget used`} aria-valuenow={Math.min(100, source.percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, source.percent)}%` }} /></div>
            <small>{source.usage.month} of {source.budget.monthly} calls used{source.creditsThisMonth !== null ? ` (${source.creditsThisMonth.toLocaleString()} credits)` : ""} · {source.remainingCalls} left{source.usage.today ? ` · ${source.usage.today} of ${source.budget.daily} today` : ""}</small>
            {source.account && <small>Account balance: {source.account.availableCredits.toLocaleString()} of {source.account.totalCredits.toLocaleString()} credits</small>}
            {!compact && <small className="field-hint">{source.note ?? summaryOf(source)}</small>}
          </div>
        ))}
      </div>
      {compact && usage.sources.length > 0 && <p className="maps-usage-summary">{usage.sources.map((source) => `${source.label}: ${source.note ?? summaryOf(source)}`).join(" ")}</p>}
    </section>
  );
}
