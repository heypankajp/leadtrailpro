"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import { StatusPill } from "./components";

/**
 * The status filter of the Pipeline board and list (request of November 19, 2026), after the Priority picker of Schedule
 * an Activity: a button showing "All" or the chosen status as its coloured chip, and a menu of the statuses as chips
 * with a check on the chosen one. Closes on a pick, a click outside, or Escape.
 */
export default function StatusFilter({ statuses, value, onChange }: {
  statuses: { id: number; value: string; code: string | null }[];
  value: string;
  onChange: (value: string) => void;
}) {
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
  const chosen = statuses.find((item) => String(item.id) === value);
  const pick = (next: string) => { onChange(next); setOpen(false); };

  return (
    <div className="priority-picker status-filter" ref={anchor}>
      <button type="button" className="priority-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label="Status" title="Status" onClick={() => setOpen((current) => !current)}>
        <Filter size={15} />
        {chosen ? <StatusPill status={chosen.value} code={chosen.code} /> : <span>All</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="priority-menu" role="listbox" aria-label="Status">
          <li role="option" aria-selected={!chosen}>
            <button type="button" onClick={() => pick("")}><span className="priority-none">All</span>{!chosen && <Check size={15} className="priority-check" />}</button>
          </li>
          {statuses.map((item) => (
            <li key={item.id} role="option" aria-selected={String(item.id) === value}>
              <button type="button" onClick={() => pick(String(item.id))}>
                <StatusPill status={item.value} code={item.code} />
                {String(item.id) === value && <Check size={15} className="priority-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
