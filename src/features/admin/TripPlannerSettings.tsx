"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { listKeyLabels, numericListBounds, type ListKey, type ListValuesByKey } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import { updateListValue } from "./client";

const settings: { key: ListKey; hint: string }[] = [
  { key: "trip_max_radius_km", hint: "The largest radius in kilometres a search may use. Google looks at most 50 km around the address." },
  { key: "trip_max_results", hint: "The most companies a search may return. Google gives 60 at most." },
  { key: "recent_trips_limit", hint: "How many of the latest trips Recent Planned Trips shows on the planner, ten to a page." },
];

/**
 * List of Values → Sales Trip Planner (request of November 18, 2026): the planner's numbers, each in its own tab next to
 * the Business Type tab (`only` picks the one shown). Each number is the single value of its own list, saved in its
 * range (the server checks it too).
 */
export default function TripPlannerSettings({ values, only, onSaved }: { values: ListValuesByKey; only?: ListKey; onSaved: (message: string) => Promise<void> }) {
  const { notify } = useApp();
  const [drafts, setDrafts] = useState<Partial<Record<ListKey, string>>>({});
  const [saving, setSaving] = useState<ListKey | null>(null);

  const save = async (key: ListKey) => {
    const entry = values[key]?.[0];
    const bounds = numericListBounds[key];
    const typed = (drafts[key] ?? entry?.value ?? "").trim();
    if (!entry || !bounds) return;
    if (!/^\d+$/.test(typed) || Number(typed) < bounds.min || Number(typed) > bounds.max) {
      notify(`${listKeyLabels[key]}: enter a whole number from ${bounds.min} to ${bounds.max}.`, "error");
      return;
    }
    setSaving(key);
    try {
      await updateListValue(entry.id, { value: typed });
      setDrafts((current) => ({ ...current, [key]: undefined }));
      await onSaved(`${listKeyLabels[key]} set to ${typed}`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="planner-settings">
      {settings.filter((item) => !only || item.key === only).map(({ key, hint }) => {
        const entry = values[key]?.[0];
        const bounds = numericListBounds[key]!;
        const value = drafts[key] ?? entry?.value ?? "";
        const changed = drafts[key] !== undefined && drafts[key] !== entry?.value;
        return (
          <form key={key} className="planner-setting" onSubmit={(event) => { event.preventDefault(); void save(key); }}>
            <label>
              <span className="field-label">{listKeyLabels[key]}</span>
              <input type="number" min={bounds.min} max={bounds.max} step={1} value={value} disabled={!entry} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} />
              <small className="field-hint">{hint} From {bounds.min} to {bounds.max}.</small>
            </label>
            <button type="submit" className="button button-outline button-small" disabled={!entry || !changed || saving === key}><Save size={13} /> {saving === key ? "Saving..." : "Save"}</button>
          </form>
        );
      })}
    </div>
  );
}
