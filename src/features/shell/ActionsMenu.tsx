"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/** The Actions menu of a lead's row (request of November 20, 2026): every action on the lead in one drop-down. */
/** Each action has its colour (request of November 20, 2026): convert green, edit blue, not relevant red, back to the inbox teal, archive amber. */
export type ActionTone = "convert" | "edit" | "dismiss" | "restore" | "archive" | "delete";

export default function ActionsMenu({ name, items, align = "right" }: { name: string; align?: "left" | "right"; items: { tone: ActionTone; label: string; icon: ReactNode; run: () => void }[] }) {
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
  if (!items.length) return null;
  return (
    <div className={`menu-anchor opp-row-actions ${align === "left" ? "is-left" : ""}`} ref={anchor}>
      <button type="button" className="button button-soft button-small" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${name}`} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal size={14} /> Actions <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu-dropdown opp-actions-menu" role="menu">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={`is-${item.tone}`} onClick={() => { setOpen(false); item.run(); }}>{item.icon} {item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
