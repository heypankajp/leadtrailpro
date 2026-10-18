"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox, X } from "lucide-react";
import { avatarTone, initials, statusClass } from "@/lib/format";

export function Dialog({ title, eyebrow, onClose, children, size = "default", actions }: {
  title: ReactNode; eyebrow?: string; onClose: () => void; children: ReactNode; size?: "default" | "wide" | "narrow"; actions?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${size === "wide" ? "modal-wide" : size === "narrow" ? "modal-narrow" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <div className="modal-title-content">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="modal-header-actions">
            {actions}
            <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Avatar({ name, seed, className = "" }: { name: string; seed?: number | string; className?: string }) {
  return <span className={`avatar avatar-${avatarTone(seed ?? name)} ${className}`}>{initials(name)}</span>;
}

export function StatusPill({ status, code }: { status: string; code: string | null }) {
  return <span className={`status-pill ${statusClass(code)}`}><i />{status}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-block">
      {icon ?? <Inbox size={22} />}
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}

export function Loading({ text = "Loading..." }: { text?: string }) {
  return <p className="loading-text" role="status">{text}</p>;
}

export function ErrorText({ message }: { message: string }) {
  return message ? <p className="user-form-error" role="alert">{message}</p> : null;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={15} /></button>
      <span>Page {page} of {pages}</span>
      <button className="icon-button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={15} /></button>
    </div>
  );
}

export type TabOption<T extends string> = { id: T; label: string; count?: number; alert?: boolean };

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: TabOption<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="followup-tabs tab-strip" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={tab.id === active} className={`followup-tab ${tab.id === active ? "is-active" : ""}`} onClick={() => onChange(tab.id)}>
          {tab.label}{tab.count !== undefined && <span className={tab.alert && tab.count > 0 ? "tab-alert" : ""}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, wide, hint, required }: { label: string; children: ReactNode; wide?: boolean; hint?: string; required?: boolean }) {
  return (
    <label className={wide ? "field-wide" : undefined}>
      <span className="field-label">{label}{required && <em aria-hidden="true"> *</em>}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

/** A small dialog that asks for an optional or required text (reason, comment) before confirming an action. */
export function PromptDialog({ title, eyebrow, description, label, placeholder, confirmLabel, required, danger, onConfirm, onClose, children }: {
  title: string; eyebrow?: string; description?: string; label: string; placeholder?: string; confirmLabel: string; required?: boolean; danger?: boolean;
  onConfirm: (value: string) => Promise<void>; onClose: () => void; children?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (required && !value.trim()) { setError(`${label} is required.`); return; }
    setBusy(true);
    setError("");
    try {
      await onConfirm(value.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete the action.");
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} eyebrow={eyebrow} onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        {description && <p className="dialog-description">{description}</p>}
        {children}
        <Field label={label} required={required}>
          <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} placeholder={placeholder} maxLength={500} />
        </Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={busy}>{busy ? "Working..." : confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return <div><small>{label}</small>{typeof children === "string" || typeof children === "number" ? <strong>{children}</strong> : children}</div>;
}
