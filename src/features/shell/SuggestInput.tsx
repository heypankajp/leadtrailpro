"use client";

import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

export type Suggestion = { key: string; label: string; detail?: string; icon?: ReactNode };

/**
 * A text field with our own list of suggestions under it (the add-deal dialog, PD-15): a combobox the keyboard can drive
 * (↓ ↑ to move, Enter to pick, Esc to close). The parent fetches the suggestions for what was typed; `empty` is the line
 * shown when nothing matches (for example "a new organization will be created"), so the list also says what will happen.
 */
export default function SuggestInput({ value, onChange, suggestions, onPick, minChars = 2, loading = false, empty, ...input }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  onPick: (suggestion: Suggestion) => void;
  minChars?: number;
  loading?: boolean;
  empty?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = value.trim().length >= minChars;
  const open = focused && !dismissed && typed && (suggestions.length > 0 || Boolean(empty) || loading);
  const pick = (suggestion: Suggestion) => { onPick(suggestion); setDismissed(true); setActive(-1); };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setDismissed(false); setActive((current) => (current + 1) % suggestions.length); }
    else if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1)); }
    else if (event.key === "Enter" && open && active >= 0 && suggestions[active]) { event.preventDefault(); pick(suggestions[active]); }
    else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setDismissed(true); }
  };

  return (
    <div className="suggest-field">
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
      {open && (
        <ul className="suggest-list" id={listId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              // mousedown, not click: the field keeps its focus, so the list does not close before the pick.
              onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
              onMouseEnter={() => setActive(index)}
            >
              {suggestion.icon}
              <span className="suggest-text"><strong>{suggestion.label}</strong>{suggestion.detail && <small>{suggestion.detail}</small>}</span>
            </li>
          ))}
          {!suggestions.length && loading && <li className="suggest-empty" role="option" aria-selected="false" aria-disabled="true">Looking…</li>}
          {!suggestions.length && !loading && empty && <li className="suggest-empty" role="option" aria-selected="false" aria-disabled="true">{empty}</li>}
        </ul>
      )}
    </div>
  );
}
