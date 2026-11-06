"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPinned, RefreshCw, SlidersHorizontal } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { fetchMapsUsage } from "./client";
import type { MapsOverview, MapsSkuStatus } from "./model";

const pollSeconds = 30;

type Tone = "ok" | "warn" | "spent";
const toneOf = (sku: MapsSkuStatus, warnAtPercent: number): Tone => (sku.budget <= 0 || sku.usage.month >= sku.budget ? "spent" : sku.percent >= warnAtPercent ? "warn" : "ok");
const toneLabels: Record<Tone, string> = { ok: "Within budget", warn: "Running low", spent: "Budget spent" };

/** What is left in plain terms: the Places allowance is the scarcest, so it sets the number of searches. */
function summaryOf(usage: MapsOverview): string | null {
  const places = usage.skus.find((sku) => sku.id === "places_text_search");
  const geocoding = usage.skus.find((sku) => sku.id === "geocoding");
  if (!places || !geocoding) return null;
  if (places.remaining <= 0 || geocoding.remaining <= 0) return null;
  const atLeast = Math.min(Math.floor(places.remaining / 3), geocoding.remaining);
  return `Company searches left this month: at least ${atLeast} (${places.remaining} result pages; a search spends 1 to 3 pages, one geocode for a new address, and one route element per company when the radius is in driving minutes).`;
}

/**
 * Live Google Maps usage for everyone who plans trips (SPEC §10.8): the month's calls against each in-app budget,
 * what is left, and when it resets. Refreshes after every search and polls while the page is open, so a budget
 * another person is spending shows up here too. Hidden until a Maps key is configured.
 */
export default function MapsUsageCard({ refreshKey = 0, compact = false }: { refreshKey?: unknown; compact?: boolean }) {
  const { can, navigate, dataVersion } = useApp();
  const [tick, setTick] = useState(0);
  const fetcher = useCallback(() => fetchMapsUsage(), []);
  const { data, reload } = useAsyncData<{ usage: MapsOverview }>(fetcher, `${dataVersion}:${String(refreshKey)}:${tick}`);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const usage = data?.usage;
  if (!usage || !usage.configured) return null;
  const tones = usage.skus.map((sku) => toneOf(sku, usage.warnAtPercent));
  const overall: Tone = tones.includes("spent") ? "spent" : tones.includes("warn") ? "warn" : "ok";
  const summary = overall === "spent" ? null : summaryOf(usage);

  return (
    <section className={`panel maps-usage-card${compact ? " is-compact" : ""}`} aria-label="Google Maps usage this month">
      <div className="panel-heading">
        <div>
          <h2><MapPinned size={14} /> Google Maps usage this month <span className={`maps-usage-pill is-${overall}`}>{toneLabels[overall]}</span></h2>
          <p>Searches stop automatically when a budget is spent; the counters and Google&apos;s free allowance start over on {formatDate(usage.resetsOn)}.{usage.live ? "" : " The sample provider is active, so no live Google call is made."}</p>
        </div>
        <div className="heading-actions">
          {can("manage_settings") && <button type="button" className="text-button" onClick={() => navigate("settings")}><SlidersHorizontal size={13} /> Budgets</button>}
          <button type="button" className="text-button" onClick={reload}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>
      <div className="maps-usage-grid">
        {usage.skus.map((sku, index) => (
          <div key={sku.id} className={`maps-usage-tile is-${tones[index]}`}>
            <div className="maps-usage-tile-head"><strong>{sku.label}</strong><span>{sku.percent}%</span></div>
            <div className="progress-track" role="progressbar" aria-label={`${sku.label} budget used`} aria-valuenow={Math.min(100, sku.percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, sku.percent)}%` }} /></div>
            <small>{sku.usage.month} of {sku.budget} {sku.unit} used · {sku.remaining} left{sku.usage.today ? ` · ${sku.usage.today} today` : ""}</small>
            {!compact && <small className="field-hint">{sku.note ?? sku.hint}</small>}
          </div>
        ))}
      </div>
      {summary && <p className="maps-usage-summary">{summary}</p>}
    </section>
  );
}
