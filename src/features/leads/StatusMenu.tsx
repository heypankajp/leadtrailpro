"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

type StatusOption = { id: number; value: string; code: string | null };

/**
 * The deal's status on its page (request of November 20, 2026): the pill opens a styled menu in place of the browser's
 * drop-down, each status in its colour (Hot red, Warm amber, Cold blue, Lost grey, Disqualified rose), the current one ticked.
 */
export default function StatusMenu({ current, code, label, options, onPick, variant = "pill" }: { current: number; code: string; label: string; options: StatusOption[]; onPick: (id: number) => void; /** "field": a form field's width and look (the deal dialog). */ variant?: "pill" | "field" }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div className={`menu-anchor status-menu ${variant === "field" ? "is-field" : ""}`} ref={anchor}>
      <button type="button" className={variant === "field" ? `status-field-button status-text-${code || "none"}` : `status-pill status-${code} status-menu-button`} aria-haspopup="listbox" aria-expanded={open} aria-label={`Status: ${label}. Change the status`} onClick={() => setOpen((value) => !value)}>
        {variant === "field" ? <><span className={`status-menu-dot status-${code || "none"}`}><i /></span><span className="status-menu-label">{label}</span><ChevronDown size={15} /></> : <><i /> {label} <ChevronDown size={13} /></>}
      </button>
      {open && (
        <div className="menu-dropdown status-menu-list" role="listbox" aria-label="Deal status">
          {options.map((option) => (
            <button key={option.id} type="button" role="option" aria-selected={option.id === current} className={`status-menu-item status-text-${option.code ?? "none"} ${option.id === current ? "is-current" : ""}`}
              onClick={() => { setOpen(false); if (option.id !== current) onPick(option.id); }}>
              <span className={`status-menu-dot status-${option.code ?? "none"}`}><i /></span>
              <span className="status-menu-label">{option.value}</span>
              {option.id === current && <Check size={14} className="status-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
