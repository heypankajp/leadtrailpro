"use client";

import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";

export type Suggestion = { key: string; label: string; detail?: string; icon?: ReactNode };

const createKey = "__create__";

/**
 * A text field with our own list of suggestions under it (the add-deal dialog, PD-15): a combobox the keyboard can drive
 * (↓ ↑ to move, Enter to pick, Esc to close). The parent fetches the suggestions for what was typed; `empty` is the line
 * shown when nothing matches, so the list also says what will happen.
 *
 * After Pipedrive (request of November 18, 2026): `icon` sits inside the field on the left; `create` adds a last line
 * "+ Add 'Acme' as new organization" that the user picks to add a new record; once picked (`isNew`), the field shows a
 * blue NEW badge and an × that clears it (`onClear`).
 */
export default function SuggestInput({ value, onChange, suggestions, onPick, minChars = 2, loading = false, empty, icon, create, isNew = false, onClear, ...input }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  onPick: (suggestion: Suggestion) => void;
  minChars?: number;
  loading?: boolean;
  empty?: string;
  icon?: ReactNode;
  /** The "+ Add … as new …" line, offered while what was typed is not an existing record. */
  create?: { label: string; onCreate: () => void } | null;
  isNew?: boolean;
  onClear?: () => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = value.trim().length >= minChars;
  // The create line is the last option, so ↓ ↑ and Enter reach it like the others.
  const options: Suggestion[] = create && !isNew ? [...suggestions, { key: createKey, label: create.label }] : suggestions;
  const open = focused && !dismissed && !isNew && typed && (options.length > 0 || Boolean(empty) || loading);
  const pick = (suggestion: Suggestion) => {
    if (suggestion.key === createKey) create?.onCreate(); else onPick(suggestion);
    setDismissed(true);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setDismissed(false); setActive((current) => (current + 1) % options.length); }
    else if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setActive((current) => (current <= 0 ? options.length - 1 : current - 1)); }
    else if (event.key === "Enter" && open && active >= 0 && options[active]) { event.preventDefault(); pick(options[active]); }
    else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setDismissed(true); }
  };

  return (
    <div className={`suggest-field ${icon ? "has-icon" : ""} ${isNew ? "is-new" : ""}`}>
      {icon && <span className="suggest-field-icon" aria-hidden="true">{icon}</span>}
      <input
        {...input}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(event) => { onChange(event.target.value); setDismissed(false); setActive(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
      />
      {isNew && (
        <span className="suggest-new">
          <span className="suggest-new-badge">NEW</span>
          {onClear && <button type="button" className="suggest-clear" aria-label={`Clear ${value}`} title="Clear" onClick={onClear}><X size={15} /></button>}
        </span>
      )}
      {open && (
        <ul className="suggest-list" id={listId} role="listbox">
          {options.map((suggestion, index) => (
            <li
              key={suggestion.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`${index === active ? "is-active" : ""} ${suggestion.key === createKey ? "suggest-create" : ""}`}
              // mousedown, not click: the field keeps its focus, so the list does not close before the pick.
              onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
              onMouseEnter={() => setActive(index)}
            >
              {suggestion.key === createKey ? <Plus size={15} /> : suggestion.icon}
              <span className="suggest-text"><strong>{suggestion.label}</strong>{suggestion.detail && <small>{suggestion.detail}</small>}</span>
            </li>
          ))}
          {!options.length && loading && <li className="suggest-empty" role="option" aria-selected="false" aria-disabled="true">Looking…</li>}
          {!options.length && !loading && empty && <li className="suggest-empty" role="option" aria-selected="false" aria-disabled="true">{empty}</li>}
        </ul>
      )}
    </div>
  );
}
