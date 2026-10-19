"use client";

import { useState, type ReactNode } from "react";
import { formatDate, formatTimeOfDay } from "@/lib/format";
import { parseNaturalDate, type NaturalDateResult } from "@/lib/natural-dates";
import { useApp } from "@/features/shell/AppContext";

type Props = {
  label?: string;
  placeholder?: string;
  /** Calendar date that relative phrases count from; defaults to the business-day today. */
  anchor?: string;
  /** Time used when the text names none. */
  defaultTime?: string;
  /** Called each time the text resolves to a date (TASK-03: the caller shows it for confirmation). */
  onResolve: (result: NaturalDateResult, time: string) => void;
};

export const naturalDateExamples = "“next Monday at 10am”, “in two weeks”, “Feb 1”, “end of month”, “January”";

/** "Mon, Oct 26, 2026 at 10:00 AM (moved to the next working day)". */
export function describeNaturalDate(date: string, time: string | null, adjusted = false): string {
  return `${formatDate(date)}${time ? ` at ${formatTimeOfDay(time)}` : ""}${adjusted ? " (moved to the next working day)" : ""}`;
}

/** A free-text date field: "tomorrow", "next Friday 3pm", "six months", "January". Resolves against the business calendar. */
export default function NaturalDateField({ label = "Type a due date", placeholder, anchor, defaultTime = "09:00", onResolve }: Props) {
  const { reference } = useApp();
  const [text, setText] = useState("");
  const [result, setResult] = useState<NaturalDateResult | null>(null);

  const change = (value: string) => {
    setText(value);
    const base = anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : reference.today;
    const parsed = value.trim() ? parseNaturalDate(value, { anchor: base, holidays: reference.holidays }) : null;
    setResult(parsed);
    if (parsed) onResolve(parsed, parsed.time ?? defaultTime);
  };

  let hint: ReactNode = `Try ${naturalDateExamples}.`;
  let tone = "";
  if (text.trim() && result) {
    hint = <>Understood &ldquo;{result.matched}&rdquo; as <strong>{describeNaturalDate(result.date, result.time ?? defaultTime, result.adjusted)}</strong>.</>;
    tone = "is-resolved";
  } else if (text.trim()) {
    hint = `Not understood yet. Try ${naturalDateExamples}.`;
    tone = "is-unresolved";
  }

  return (
    <label className="field-wide natural-date-field">
      <span className="field-label">{label}</span>
      <input value={text} onChange={(event) => change(event.target.value)} placeholder={placeholder ?? "next Monday at 10am, in two weeks, Feb 1, January..."} maxLength={200} autoComplete="off" />
      <small className={`field-hint natural-date-hint ${tone}`}>{hint}</small>
    </label>
  );
}
