"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, CalendarClock, Check, ChevronDown, ListFilter, X } from "lucide-react";
import { useApp } from "@/features/shell/AppContext";
import { PeriodCalendar, periodLabel } from "@/features/shell/DateRangePicker";
import { quickFilterLabel, quickFilters, quickFilterText, type QuickFilterKey } from "./quick-filters";

/** The follow-up period of "Followup": YYYY-MM-DD ("" = none), and how to change it. */
export type FollowUpPeriod = { from: string; to: string; onChange: (from: string, to: string) => void };

/**
 * The Filter menu at the top right of the boards and the deal list (PD-30), after Pipedrive's: ready-made filters, then
 * DATA CLEANUP. The chosen filter shows on the button with an × to clear it. Archived deals open the archive view.
 * "Followup" (review of November 18, 2026) opens the By Period calendar for the follow-up date; the period picked
 * shows next to the button and works together with the other filters.
 */
export default function QuickFilterMenu({ value, onChange, followUp }: { value: QuickFilterKey | null; onChange: (key: QuickFilterKey | null) => void; followUp?: FollowUpPeriod }) {
  const { navigate, reference } = useApp();
  const [open, setOpen] = useState(false);
  const [calendar, setCalendar] = useState<HTMLElement | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
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
  const label = quickFilterLabel(value, reference.today);
  const item = (key: QuickFilterKey, text: string, hint: string) => (
    <button key={key} type="button" role="menuitemradio" aria-checked={value === key} title={hint} onClick={() => pick(value === key ? null : key)}>
      {value === key ? <Check size={13} /> : <span className="card-menu-gap" />} {text}
    </button>
  );
  const followUpSet = Boolean(followUp?.from);
  const byFollowUp = followUp && (
    <button key="by-follow-up" type="button" role="menuitem" title="Deals whose follow-up date is in a period you pick on the calendar" onClick={() => { setOpen(false); setCalendar(button.current); }}>
      {followUpSet ? <Check size={13} /> : <CalendarClock size={13} />} Followup
    </button>
  );
  return (
    <div className="menu-anchor quick-filter" ref={anchor}>
      <button ref={button} type="button" className={`button button-outline button-small ${value ? "is-active" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <ListFilter size={14} /> {label ? <span className="quick-filter-label">{label}</span> : "Filter"} <ChevronDown size={13} />
      </button>
      {value && <button type="button" className="icon-button quick-filter-clear" aria-label="Clear the filter" title="Clear the filter" onClick={() => onChange(null)}><X size={13} /></button>}
      {followUp && followUpSet && (
        <span className="follow-up-chip">
          <button type="button" className="period-trigger is-set" title="Change the follow-up period" onClick={(event) => setCalendar(event.currentTarget)}>
            <CalendarClock size={14} /> <span>Follow-up: {periodLabel(followUp.from, followUp.to)}</span>
          </button>
          <button type="button" className="icon-button period-clear" aria-label="Clear the follow-up period" title="Clear the follow-up period" onClick={() => followUp.onChange("", "")}><X size={13} /></button>
        </span>
      )}
      {open && (
        <div className="menu-dropdown quick-filter-menu" role="menu" aria-label="Filter deals">
          <div className="card-menu-label">Filters</div>
          {quickFilters.filter((filter) => filter.group === "ready").flatMap((filter) => [item(filter.key, filter.label, filter.hint), filter.key === "open" ? byFollowUp : null])}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("deals", "archive"); }}><Archive size={13} /> Archived deals</button>
          <div className="card-menu-rule" />
          {/* Review of November 18, 2026: the deals by quarter of their first contact, generated from today's date. */}
          <div className="card-menu-label">By quarter</div>
          {quickFilters.filter((filter) => filter.group === "period").map((filter) => item(filter.key, quickFilterText(filter.key, reference.today), filter.hint))}
          <div className="card-menu-rule" />
          <div className="card-menu-label">Data cleanup</div>
          {quickFilters.filter((filter) => filter.group === "cleanup").map((filter) => item(filter.key, filter.label, filter.hint))}
          <p className="quick-filter-tip">Open a clean-up filter in the list view to archive, reassign or move the deals it finds in one go.</p>
        </div>
      )}
      {followUp && calendar && (
        <PeriodCalendar
          anchor={calendar} from={followUp.from} to={followUp.to} today={reference.today} label="Followup"
          onApply={(from, to) => { followUp.onChange(from, to); setCalendar(null); }} onClose={() => setCalendar(null)}
        />
      )}
    </div>
  );
}
