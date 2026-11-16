"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Check, ChevronDown, ListFilter, X } from "lucide-react";
import { useApp } from "@/features/shell/AppContext";
import { quickFilterLabel, quickFilters, type QuickFilterKey } from "./quick-filters";

/**
 * The Filter menu at the top right of the boards and the deal list (PD-30), after Pipedrive's: ready-made filters, then
 * DATA CLEANUP. The chosen filter shows on the button with an × to clear it. Archived deals open the archive view.
 */
export default function QuickFilterMenu({ value, onChange }: { value: QuickFilterKey | null; onChange: (key: QuickFilterKey | null) => void }) {
  const { navigate } = useApp();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "mousedown" && anchor.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const pick = (key: QuickFilterKey | null) => { setOpen(false); onChange(key); };
  const label = quickFilterLabel(value);
  const item = (key: QuickFilterKey, text: string, hint: string) => (
    <button key={key} type="button" role="menuitemradio" aria-checked={value === key} title={hint} onClick={() => pick(value === key ? null : key)}>
      {value === key ? <Check size={13} /> : <span className="card-menu-gap" />} {text}
    </button>
  );
  return (
    <div className="menu-anchor quick-filter" ref={anchor}>
      <button type="button" className={`button button-outline button-small ${value ? "is-active" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <ListFilter size={14} /> {label ? <span className="quick-filter-label">{label}</span> : "Filter"} <ChevronDown size={13} />
      </button>
      {value && <button type="button" className="icon-button quick-filter-clear" aria-label="Clear the filter" title="Clear the filter" onClick={() => onChange(null)}><X size={13} /></button>}
      {open && (
        <div className="menu-dropdown quick-filter-menu" role="menu" aria-label="Filter deals">
          <div className="card-menu-label">Filters</div>
          {quickFilters.filter((filter) => filter.group === "ready").map((filter) => item(filter.key, filter.label, filter.hint))}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("deals", "archive"); }}><Archive size={13} /> Archived deals</button>
          <div className="card-menu-rule" />
          <div className="card-menu-label">Data cleanup</div>
          {quickFilters.filter((filter) => filter.group === "cleanup").map((filter) => item(filter.key, filter.label, filter.hint))}
          <p className="quick-filter-tip">Open a clean-up filter in the list view to archive, reassign or move the deals it finds in one go.</p>
        </div>
      )}
    </div>
  );
}
