"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

/** YYYY-MM-DD helpers on UTC dates, so the picker never shifts a day with the browser's timezone. */
const parse = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const format = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (ymd: string, days: number) => { const date = parse(ymd); date.setUTCDate(date.getUTCDate() + days); return format(date); };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The popover's width and the height it needs, for placing it inside the window. */
const popoverWidth = 272;
const popoverHeight = 372;
const monthTitle = (year: number, month: number) => new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (ymd: string, withYear: boolean) => parse(ymd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

/** "Wed, Nov 18, 2026" for one day; "Mon, Nov 16 – Fri, Nov 20, 2026" for a range (the year once when both share it). */
export function periodLabel(from: string, to: string): string {
  if (!from) return "";
  if (!to || to === from) return dayLabel(from, true);
  return from.slice(0, 4) === to.slice(0, 4) ? `${dayLabel(from, false)} – ${dayLabel(to, true)}` : `${dayLabel(from, true)} – ${dayLabel(to, true)}`;
}

/** The 42 days (six weeks, Sunday first) shown for a month. */
function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = addDays(format(first), -first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** Where the calendar goes: under `anchor`, or above it when there is more room there, never past the window's edges. */
function placeNear(anchor: HTMLElement): { top?: number; bottom?: number; left: number } {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(popoverWidth, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  return below >= popoverHeight || below >= above ? { top: rect.bottom + 6, left } : { bottom: window.innerHeight - rect.top + 6, left };
}

/**
 * The month calendar of "By Period" (review of November 18, 2026), drawn over the page next to `anchor`. A click picks
 * one day; a second click picks the other end of a range; Apply hands the period over. Cancel, Escape, a click outside,
 * a scroll or a resize close it without changing anything. Mount it only while it is open.
 */
export function PeriodCalendar({ anchor, from, to, today, label, onApply, onClose }: {
  anchor: HTMLElement; from: string; to: string; today: string; label: string;
  onApply: (from: string, to: string) => void; onClose: () => void;
}) {
  const [place] = useState(() => placeNear(anchor));
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to && to !== from ? to : "");
  const [hover, setHover] = useState("");
  const [view, setView] = useState(() => { const date = parse(from || today); return { year: date.getUTCFullYear(), month: date.getUTCMonth() }; });
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      const target = event.target as Node;
      // A click on the anchor is the anchor's own business (it toggles the calendar).
      if (event.type === "mousedown" && (anchor.contains(target) || popover.current?.contains(target))) return;
      if (event.type === "scroll" && popover.current?.contains(target)) return;
      onClose();
      if (event.type === "keydown") anchor.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, onClose]);

  const days = useMemo(() => monthGrid(view.year, view.month), [view]);
  const step = (months: number) => setView((current) => {
    const index = current.year * 12 + current.month + months;
    return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
  });
  const pick = (day: string) => {
    if (!start || end) { setStart(day); setEnd(""); return; }
    if (day === start) return;
    if (day < start) { setEnd(start); setStart(day); } else setEnd(day);
  };
  // While only the first day is picked, the range follows the pointer.
  const rangeEnd = end || (start && hover && hover !== start ? hover : "");
  const [low, high] = rangeEnd && rangeEnd < start ? [rangeEnd, start] : [start, rangeEnd || start];

  return createPortal(
    <div ref={popover} className="period-popover" role="dialog" aria-label={label} style={{ top: place.top ?? "auto", bottom: place.bottom ?? "auto", left: place.left }}>
      <div className="period-head">
        <strong>{label}</strong>
        <span>{start ? periodLabel(start, end || start) : "Pick a day or a range"}</span>
      </div>
      <div className="period-month">
        <button type="button" className="icon-button" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
        <strong aria-live="polite">{monthTitle(view.year, view.month)}</strong>
        <button type="button" className="icon-button" aria-label="Next month" onClick={() => step(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="period-grid" role="grid" onMouseLeave={() => setHover("")}>
        {weekdays.map((day) => <span key={day} className="period-weekday" role="columnheader">{day}</span>)}
        {days.map((day) => {
          const outside = parse(day).getUTCMonth() !== view.month;
          const edge = Boolean(start) && (day === low || day === high);
          const inRange = Boolean(start) && day > low && day < high;
          const classes = ["period-day", outside && "is-outside", inRange && "in-range", edge && "is-edge", day === today && "is-today",
            start && rangeEnd && day === low && "range-start", start && rangeEnd && day === high && "range-end"].filter(Boolean).join(" ");
          return (
            <button
              key={day} type="button" className={classes} aria-pressed={edge} aria-label={`${dayLabel(day, true)}${day === today ? " (today)" : ""}`}
              onClick={() => pick(day)} onMouseEnter={() => setHover(day)} onFocus={() => setHover(day)}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="period-hint">Click a day for one date, then another for a range.</p>
      <div className="period-actions">
        <button type="button" className="button button-outline button-small" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-primary button-small" disabled={!start} onClick={() => { if (start) onApply(start, end || start); }}>Apply</button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "By Period" (review of November 18, 2026): a button that opens the calendar. `from`/`to` are YYYY-MM-DD ("" = no
 * period), `to` equals `from` for a single day.
 */
export default function DateRangePicker({ from, to, today, label = "By Period", onChange }: {
  from: string; to: string; today: string; label?: string; onChange: (from: string, to: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const applied = Boolean(from);
  return (
    <div className="period-picker">
      <button type="button" className={`period-trigger ${applied ? "is-set" : ""}`} aria-haspopup="dialog" aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
        <CalendarRange size={15} />
        <span>{applied ? periodLabel(from, to) : label}</span>
        <ChevronDown size={14} />
      </button>
      {applied && <button type="button" className="icon-button period-clear" aria-label={`Clear ${label}`} title="Clear the period" onClick={() => onChange("", "")}><X size={13} /></button>}
      {anchor && (
        <PeriodCalendar
          anchor={anchor} from={from} to={to} today={today} label={label}
          onApply={(start, end) => { onChange(start, end); setAnchor(null); }} onClose={() => setAnchor(null)}
        />
      )}
    </div>
  );
}
