import { getDatabasePool, toSqlDateTime, type Queryable } from "@/lib/db";
import { notifyUsers } from "@/features/notifications/repository";
import { getSettings } from "@/features/settings/repository";
import { listUsersWithPrivilege } from "@/features/users/repository";
import {
  emptyMapsUsage, mapsAlert, mapsFreeCaps, mapsSkuHints, mapsSkuIds, mapsSkuLabels, mapsSkuNote, mapsSkuUnits, monthKeyOf, nextResetYmd, reachedThresholds, usagePercent,
  type MapsMeter, type MapsOverview, type MapsSkuId, type MapsSkuStatus, type MapsSkuUsage,
} from "./model";

/**
 * The Google Maps usage meter behind the Sales Trip Planner (SPEC §10.8): calls are counted per SKU and day in
 * `maps_usage`, summed per calendar month, held under the monthly budgets in Settings, and administrators are told
 * once a month per SKU and level (claimed through `job_runs` like the digests) when a level is reached.
 */

const todayYmd = () => new Date().toISOString().slice(0, 10);

/** The key the Google adapter signs with: `MAPS_API_KEY`, or `GOOGLE_MAPS_API_KEY` as an alias. */
export function mapsApiKey(): { key: string; variable: "MAPS_API_KEY" | "GOOGLE_MAPS_API_KEY" | null } {
  const primary = process.env.MAPS_API_KEY?.trim();
  if (primary) return { key: primary, variable: "MAPS_API_KEY" };
  const alias = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (alias) return { key: alias, variable: "GOOGLE_MAPS_API_KEY" };
  return { key: "", variable: null };
}

export async function mapsUsage(db: Queryable = getDatabasePool()): Promise<Record<MapsSkuId, MapsSkuUsage>> {
  const today = todayYmd();
  const { rows } = await db.query(
    `SELECT sku, SUM(units)::int AS month, SUM(CASE WHEN day = ? THEN units ELSE 0 END)::int AS today, SUM(CASE WHEN day = ? THEN failures ELSE 0 END)::int AS "failuresToday"
     FROM maps_usage WHERE day >= ? GROUP BY sku`,
    [today, today, `${today.slice(0, 8)}01`],
  );
  const usage = Object.fromEntries(mapsSkuIds.map((id) => [id, emptyMapsUsage()])) as Record<MapsSkuId, MapsSkuUsage>;
  for (const row of rows as { sku: string; month: number; today: number; failuresToday: number }[]) {
    if (row.sku in usage) usage[row.sku as MapsSkuId] = { month: Number(row.month), today: Number(row.today), failuresToday: Number(row.failuresToday) };
  }
  return usage;
}

export async function recordMapsUsage(db: Queryable, sku: MapsSkuId, unitCount: number, failed: boolean): Promise<void> {
  await db.query(
    "INSERT INTO maps_usage (sku, day, calls, units, failures) VALUES (?, ?, 1, ?, ?) ON CONFLICT (sku, day) DO UPDATE SET calls = maps_usage.calls + 1, units = maps_usage.units + EXCLUDED.units, failures = maps_usage.failures + EXCLUDED.failures",
    [sku, todayYmd(), Math.max(0, Math.round(unitCount)), failed ? 1 : 0],
  );
}

/**
 * Tells every active administrator, once a month per SKU and level, that the warning level or the whole budget has
 * been reached. The `job_runs` row is claimed first so concurrent searches cannot send the alert twice.
 */
async function alertAdministrators(db: Queryable, sku: MapsSkuId, budget: number, warnAtPercent: number): Promise<void> {
  const used = (await mapsUsage(db))[sku].month;
  const month = monthKeyOf();
  for (const percent of reachedThresholds(used, budget, warnAtPercent)) {
    const now = toSqlDateTime(new Date());
    const claim = await db.query(
      "INSERT INTO job_runs (job, period_key, status, details, started_at, finished_at) VALUES (?, ?, 'success', ?, ?, ?) ON CONFLICT (job, period_key) DO NOTHING RETURNING id",
      [`maps:${sku}:${percent}`, month, `${used} of ${budget} ${mapsSkuUnits[sku]}`, now, now],
    );
    if (!claim.rows.length) continue;
    const administrators = (await listUsersWithPrivilege("manage_settings", db)).filter((user) => user.active);
    const alert = mapsAlert(sku, percent, used, budget, nextResetYmd());
    await notifyUsers(db, { userIds: administrators.map((user) => user.id), type: "maps_usage", title: alert.title, body: alert.body });
  }
}

/** The meter the Google adapter runs its calls through; one instance per search, settings read once. */
export function createMapsMeter(db: Queryable = getDatabasePool()): MapsMeter {
  let settings: Promise<{ budgets: Record<MapsSkuId, number>; warnAtPercent: number }> | null = null;
  const mapsSettings = () => (settings ??= getSettings(db).then((all) => all.maps));
  return {
    async remaining(sku) {
      const budget = (await mapsSettings()).budgets[sku];
      const used = (await mapsUsage(db))[sku].month;
      return { remaining: Math.max(0, budget - used), budget };
    },
    async record(sku, unitCount, failed) {
      await recordMapsUsage(db, sku, unitCount, failed);
      const { budgets, warnAtPercent } = await mapsSettings();
      await alertAdministrators(db, sku, budgets[sku], warnAtPercent).catch((error: unknown) => {
        console.error("Google Maps usage alert failed.", error instanceof Error ? error.message : error);
      });
    },
  };
}

/** Every SKU with its budget, usage, and state, for the Settings page (administrators). */
export async function mapsStatuses(db: Queryable = getDatabasePool()): Promise<MapsOverview> {
  const settings = (await getSettings(db)).maps;
  const usage = await mapsUsage(db);
  const key = mapsApiKey();
  const skus: MapsSkuStatus[] = mapsSkuIds.map((id) => {
    const budget = settings.budgets[id];
    return {
      id, label: mapsSkuLabels[id], hint: mapsSkuHints[id], unit: mapsSkuUnits[id], freeCap: mapsFreeCaps[id], budget, usage: usage[id],
      percent: usagePercent(usage[id].month, budget), remaining: Math.max(0, budget - usage[id].month), note: mapsSkuNote(budget, usage[id], settings.warnAtPercent),
    };
  });
  return {
    configured: Boolean(key.key),
    keyVariable: key.variable,
    live: Boolean(key.key) && (process.env.TRIPS_PROVIDER || "").trim().toLowerCase() !== "stub",
    monthKey: monthKeyOf(),
    resetsOn: nextResetYmd(),
    warnAtPercent: settings.warnAtPercent,
    skus,
  };
}

/** A sentence for the planner page when a budget is spent or past the warning level, or null. */
export async function mapsBudgetNote(db: Queryable = getDatabasePool()): Promise<string | null> {
  const overview = await mapsStatuses(db);
  const spent = overview.skus.filter((sku) => sku.budget <= 0 || sku.usage.month >= sku.budget);
  if (spent.length) {
    const onlyRoutes = spent.every((sku) => sku.id === "route_matrix");
    return `The Google Maps monthly budget for ${spent.map((sku) => sku.label).join(" and ")} is spent; ${onlyRoutes ? "searches by driving minutes are paused (a radius in km still works)" : "company searches are paused"} until ${overview.resetsOn} unless an administrator raises the budget under Settings → Google Maps usage.`;
  }
  const warned = overview.skus.filter((sku) => sku.note);
  if (warned.length) return `Google Maps usage this month: ${warned.map((sku) => `${sku.label} ${sku.percent}%`).join(", ")} of the budget (resets ${overview.resetsOn}).`;
  return null;
}
