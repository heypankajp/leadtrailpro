"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { AtSign, Bold, Italic, Link2, List, Mic, MicOff, Paperclip } from "lucide-react";
import type { LeadAttachment } from "@/features/attachments/model";
import { mentionGroups } from "@/features/messages/model";
import type { UserSummary } from "@/features/users/model";
import { useApp } from "./AppContext";

const groupLabels: Record<(typeof mentionGroups)[number], string> = { all: "Everyone", admin: "All administrators", recruiter: "All recruiters", salesmanager: "All sales managers" };

type Suggestion = { key: string; label: string; detail: string; insert: string };

// The Web Speech API (NOTE-04): Chrome, Edge, and Safari expose it; the button only appears where it exists.
type RecognitionEvent = { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
};
const recognitionClass = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};
const dictationErrors: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow the microphone for this site and try again.",
  "service-not-allowed": "Dictation is not available in this browser.",
  "audio-capture": "No microphone was found.",
  network: "The speech service could not be reached.",
  "language-not-supported": "Dictation does not support this language.",
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** People to offer after "@"; without it the mention button and suggestions are hidden. */
  directory?: UserSummary[];
  /** Files of the lead that can be referenced (COLL-06). */
  attachments?: LeadAttachment[];
  selectedAttachmentIds?: number[];
  onAttachmentsChange?: (ids: number[]) => void;
  placeholder?: string;
  rows?: number;
  /** Accessible name when the textarea is not wrapped in a Field label. */
  label?: string;
  autoFocus?: boolean;
  required?: boolean;
  maxLength?: number;
  /** Voice-to-text button (NOTE-04); on by default where the browser supports it. */
  dictation?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/** Textarea with a formatting toolbar for the rich-text format (NOTE-03), @mention suggestions (COLL-02), file references, and dictation. */
export default function RichTextArea({ value, onChange, directory, attachments = [], selectedAttachmentIds = [], onAttachmentsChange, placeholder, rows = 4, label, autoFocus, required, maxLength, dictation = true, textareaRef, onKeyDown }: Props) {
  const { roleLabel } = useApp();
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const [showFiles, setShowFiles] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [dictationSupported, setDictationSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [dictationError, setDictationError] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDictationSupported(dictation && recognitionClass() !== null), 0);
    return () => { window.clearTimeout(timer); recognitionRef.current?.abort(); };
  }, [dictation]);

  const focusAt = (position: number) => window.setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(position, position); }, 0);

  const insertAtCaret = (text: string) => {
    const current = valueRef.current;
    const start = ref.current?.selectionStart ?? current.length;
    const end = ref.current?.selectionEnd ?? start;
    const before = current.slice(0, start);
    const piece = `${before.length && !/\s$/.test(before) ? " " : ""}${text}`;
    onChange(`${before}${piece}${current.slice(end)}`);
    focusAt(start + piece.length);
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!mention || !directory) return [];
    const query = mention.query.toLowerCase();
    const groups: Suggestion[] = mentionGroups.filter((group) => group.startsWith(query) || groupLabels[group].toLowerCase().startsWith(query)).map((group) => ({ key: group, label: `@${group}`, detail: groupLabels[group], insert: `@${group} ` }));
    const people: Suggestion[] = directory.filter((person) => person.active && person.name.toLowerCase().includes(query)).slice(0, 8).map((person) => ({ key: `u${person.id}`, label: person.name, detail: roleLabel(person.role), insert: `@${person.name} ` }));
    return [...groups, ...people].slice(0, 10);
  }, [mention, directory, roleLabel]);

  const detectMention = (text: string, caret: number) => {
    if (!directory) return;
    const match = /(^|[\s(])@([^\s@]{0,40}(?: [^\s@]{0,40}){0,2})$/.exec(text.slice(0, caret));
    if (!match) { setMention(null); return; }
    setMention({ start: caret - match[2].length - 1, query: match[2] });
    setHighlight(0);
  };

  const applySuggestion = (suggestion: Suggestion) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? value.length;
    onChange(`${value.slice(0, mention.start)}${suggestion.insert}${value.slice(caret)}`);
    setMention(null);
    focusAt(mention.start + suggestion.insert.length);
  };

  const wrap = (before: string, after = before, placeholderText = "text") => {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholderText;
    onChange(`${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`);
    window.setTimeout(() => { element?.focus(); element?.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
  };

  const prefixLines = (prefix: (index: number) => string) => {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const lines = (value.slice(lineStart, lineEnd) || "item").split("\n").map((line, index) => `${prefix(index)}${line}`).join("\n");
    onChange(`${value.slice(0, lineStart)}${lines}${value.slice(lineEnd)}`);
    window.setTimeout(() => { element?.focus(); element?.setSelectionRange(lineStart, lineStart + lines.length); }, 0);
  };

  const startMention = () => {
    const caret = ref.current?.selectionStart ?? value.length;
    const insert = `${caret > 0 && !/\s/.test(value[caret - 1] ?? "") ? " " : ""}@`;
    onChange(`${value.slice(0, caret)}${insert}${value.slice(caret)}`);
    setMention({ start: caret + insert.length - 1, query: "" });
    setHighlight(0);
    focusAt(caret + insert.length);
  };

  const toggleDictation = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Recognizer = recognitionClass();
    if (!Recognizer) return;
    const recognition = new Recognizer();
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) insertAtCaret(result[0].transcript.trim());
        else pending += result[0].transcript;
      }
      setInterim(pending.trim());
    };
    recognition.onerror = (event) => { if (event.error !== "no-speech" && event.error !== "aborted") setDictationError(dictationErrors[event.error] ?? "Dictation stopped unexpectedly."); };
    recognition.onend = () => { setListening(false); setInterim(""); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setDictationError("");
    setListening(true);
    try { recognition.start(); } catch { setListening(false); setDictationError("Dictation could not start."); }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && suggestions.length) {
      if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => (current + 1) % suggestions.length); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); applySuggestion(suggestions[highlight]); return; }
      if (event.key === "Escape") { event.preventDefault(); setMention(null); return; }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="rich-editor">
      <div className="message-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" aria-label="Bold" title="Bold (**text**)" onClick={() => wrap("**")}><Bold size={13} /></button>
        <button type="button" aria-label="Italic" title="Italic (_text_)" onClick={() => wrap("_")}><Italic size={13} /></button>
        <button type="button" aria-label="Bulleted list" title="Bulleted list (- item)" onClick={() => prefixLines(() => "- ")}><List size={13} /></button>
        <button type="button" aria-label="Numbered list" title="Numbered list (1. item)" onClick={() => prefixLines((index) => `${index + 1}. `)}><span className="toolbar-text">1.</span></button>
        <button type="button" aria-label="Link" title="Link ([text](https://…))" onClick={() => wrap("[", "](https://)", "link text")}><Link2 size={13} /></button>
        {directory && <button type="button" aria-label="Mention someone" title="Mention (@name, @all, @admin, @recruiter, @salesmanager)" onClick={startMention}><AtSign size={13} /></button>}
        {attachments.length > 0 && onAttachmentsChange && (
          <button type="button" aria-label="Reference a file" title="Reference a file from this lead" aria-pressed={showFiles} onClick={() => setShowFiles((current) => !current)}>
            <Paperclip size={13} />{selectedAttachmentIds.length ? <span className="toolbar-count">{selectedAttachmentIds.length}</span> : null}
          </button>
        )}
        {dictationSupported && (
          <button type="button" className={listening ? "is-listening" : ""} aria-label={listening ? "Stop dictation" : "Start dictation"} aria-pressed={listening} title="Dictate (voice to text); edit the words before saving" onClick={toggleDictation}>
            {listening ? <MicOff size={13} /> : <Mic size={13} />}
          </button>
        )}
      </div>
      <div className="message-input">
        <textarea
          ref={ref}
          aria-label={label}
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          onChange={(event) => { onChange(event.target.value); detectMention(event.target.value, event.target.selectionStart ?? event.target.value.length); }}
          onKeyDown={handleKeyDown}
          onClick={(event) => detectMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
          onBlur={() => window.setTimeout(() => setMention(null), 150)}
        />
        {mention && suggestions.length > 0 && (
          <div className="mention-menu" aria-label="Mention suggestions">
            {suggestions.map((suggestion, index) => (
              <button type="button" key={suggestion.key} className={`mention-option ${index === highlight ? "is-active" : ""}`} onMouseDown={(event) => { event.preventDefault(); applySuggestion(suggestion); }}>
                <strong>{suggestion.label}</strong><span>{suggestion.detail}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {(listening || interim || dictationError) && (
        <small className={`dictation-status ${dictationError ? "is-error" : ""}`} role="status" aria-live="polite">
          {dictationError || (interim ? `Hearing: ${interim}` : "Listening… speak now, then stop and edit the text.")}
        </small>
      )}
      {showFiles && attachments.length > 0 && onAttachmentsChange && (
        <fieldset className="message-file-picker">
          <legend>Reference files</legend>
          {attachments.map((file) => (
            <span key={file.id} className="checklist-item">
              <input type="checkbox" id={`file-ref-${file.id}`} checked={selectedAttachmentIds.includes(file.id)} onChange={(event) => onAttachmentsChange(event.target.checked ? [...selectedAttachmentIds, file.id] : selectedAttachmentIds.filter((id) => id !== file.id))} />
              <label htmlFor={`file-ref-${file.id}`}>{file.fileName} <small>({file.label})</small></label>
            </span>
          ))}
        </fieldset>
      )}
    </div>
  );
}
