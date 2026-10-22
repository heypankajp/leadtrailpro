"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { AtSign, Bold, CornerDownRight, Italic, Link2, List, MessageSquare, Paperclip, Pencil, Quote, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { LeadAttachment } from "@/features/attachments/model";
import { attachmentUrl } from "@/features/leads/client";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, EmptyState, ErrorText, Loading } from "@/features/shell/components";
import RichText from "@/features/shell/RichText";
import { fetchDirectory } from "@/features/users/client";
import type { UserSummary } from "@/features/users/model";
import { editMessage, fetchThreads, postMessage, removeMessage } from "./client";
import { maxMessageLength, mentionGroups, type LeadMessage, type MessageThread } from "./model";

const pollSeconds = 20;
const groupLabels: Record<(typeof mentionGroups)[number], string> = { all: "Everyone", admin: "All administrators", recruiter: "All recruiters", salesmanager: "All sales managers" };

type Composer = { parentId: number | null; quotedMessageId: number | null; quotedBy: string | null };

/** Lead collaboration (COLL-01..06): threads, replies, quotes, mentions, rich text, file references, own edits, Admin removal. */
export default function CollaborationTab({ leadId, attachments, canPost, onChanged }: { leadId: number; attachments: LeadAttachment[]; canPost: boolean; onChanged: () => void }) {
  const { user, can, roleLabel, notify } = useApp();
  const [threads, setThreads] = useState<MessageThread[] | null>(null);
  const [directory, setDirectory] = useState<UserSummary[]>([]);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState<Composer>({ parentId: null, quotedMessageId: null, quotedBy: null });
  const [editing, setEditing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const result = await fetchThreads(leadId);
      setThreads(result.threads);
      setError("");
    } catch (caught) {
      if (!quiet) setError(errorMessage(caught));
    }
  }, [leadId]);

  // COLL-05 (live updates): the thread list refreshes on a short interval while the tab is open.
  useEffect(() => {
    const first = window.setTimeout(() => { void load(); void fetchDirectory().then((result) => setDirectory(result.users)).catch(() => undefined); }, 0);
    const timer = window.setInterval(() => void load(true), pollSeconds * 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  const startReply = (message: LeadMessage, quote: boolean) => {
    setEditing(null);
    setComposer({ parentId: message.parentId ?? message.id, quotedMessageId: quote ? message.id : null, quotedBy: quote ? message.authorName : null });
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  const posted = async (message: LeadMessage) => {
    setComposer({ parentId: null, quotedMessageId: null, quotedBy: null });
    await load();
    onChanged();
    notify(message.mentions.length ? "Message posted and mentions notified" : "Message posted");
  };

  const remove = async (id: number) => {
    try {
      await removeMessage(id);
      setRemoving(null);
      await load();
      onChanged();
      notify("Message removed");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const renderMessage = (message: LeadMessage, reply: boolean) => (
    <article className={`message ${reply ? "message-reply" : ""} ${message.deletedAt ? "is-removed" : ""}`} key={message.id} aria-label={`Message from ${message.authorName}`}>
      <Avatar name={message.authorName} seed={message.authorId} className="message-avatar" />
      <div className="message-body">
        <div className="message-head">
          <strong>{message.authorName}</strong>
          <span className="badge badge-muted">{roleLabel(message.authorRole as UserSummary["role"])}</span>
          <small title={formatDateTime(message.createdAt)}>{relativeTime(message.createdAt)}{message.editedAt ? " · edited" : ""}</small>
        </div>
        {message.deletedAt ? (
          <p className="message-removed">Message removed by {message.deletedByName ?? "an administrator"} {relativeTime(message.deletedAt)}.</p>
        ) : editing === message.id ? (
          <MessageEditor
            key={`edit-${message.id}`}
            initial={message.body}
            directory={directory}
            attachments={[]}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => { await editMessage(message.id, body); setEditing(null); await load(); notify("Message updated"); }}
          />
        ) : (
          <>
            {message.quoted && <blockquote className="message-quote"><strong>{message.quoted.authorName}</strong> {message.quoted.excerpt}</blockquote>}
            <RichText text={message.body} className="message-text" />
            {message.attachments.length > 0 && (
              <ul className="message-files">
                {message.attachments.map((file) => <li key={file.id}><Paperclip size={11} /> <a href={attachmentUrl(file.id)} target="_blank" rel="noopener noreferrer">{file.fileName}</a> <span>{file.label}</span></li>)}
              </ul>
            )}
            <div className="message-actions">
              {canPost && <button className="link-button" onClick={() => startReply(message, false)}><CornerDownRight size={12} /> Reply</button>}
              {canPost && <button className="link-button" onClick={() => startReply(message, true)}><Quote size={12} /> Quote</button>}
              {canPost && message.authorId === user.id && <button className="link-button" onClick={() => { setEditing(message.id); setRemoving(null); }}><Pencil size={12} /> Edit</button>}
              {can("moderate_messages") && (removing === message.id
                ? <><button className="link-button danger-text" onClick={() => void remove(message.id)}>Confirm removal</button><button className="link-button" onClick={() => setRemoving(null)}>Keep</button></>
                : <button className="link-button" aria-label={`Remove message from ${message.authorName}`} onClick={() => { setRemoving(message.id); setEditing(null); }}><Trash2 size={12} /> Remove</button>)}
            </div>
          </>
        )}
      </div>
    </article>
  );

  const replyTarget = composer.parentId === null ? null : threads?.find((thread) => thread.root.id === composer.parentId)?.root ?? null;

  return (
    <div className="collaboration-tab">
      {canPost && (
        <section className="message-composer" aria-label={replyTarget ? `Reply to ${replyTarget.authorName}` : "New message"}>
          <div className="message-composer-head">
            <strong>{replyTarget ? `Replying to ${replyTarget.authorName}` : "New message"}{composer.quotedBy ? ` · quoting ${composer.quotedBy}` : ""}</strong>
            {replyTarget && <button className="link-button" onClick={() => setComposer({ parentId: null, quotedMessageId: null, quotedBy: null })}>Start a new thread instead</button>}
          </div>
          <MessageEditor
            key={`${composer.parentId ?? "root"}-${composer.quotedMessageId ?? "none"}`}
            textareaRef={composerRef}
            initial=""
            directory={directory}
            attachments={attachments}
            submitLabel={replyTarget ? "Post reply" : "Post message"}
            onSubmit={async (body, attachmentIds) => { const result = await postMessage(leadId, { body, parentId: composer.parentId, quotedMessageId: composer.quotedMessageId, attachmentIds }); await posted(result.message); }}
          />
        </section>
      )}
      <ErrorText message={error} />
      {threads === null && !error && <Loading text="Loading messages..." />}
      {threads && threads.length === 0 && <EmptyState icon={<MessageSquare size={22} />} title="No messages yet" text={canPost ? "Start a thread for this lead. Mention a colleague with @ to notify them." : "Nobody has posted on this lead yet."} />}
      <div className="message-threads">
        {threads?.map((thread) => (
          <section className="message-thread" key={thread.root.id}>
            {renderMessage(thread.root, false)}
            {thread.replies.length > 0 && <div className="message-replies">{thread.replies.map((reply) => renderMessage(reply, true))}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}

type Suggestion = { key: string; label: string; detail: string; insert: string };

/** Textarea with a formatting toolbar, @mention suggestions, and file references (NOTE-03, COLL-02, COLL-06). */
function MessageEditor({ initial, directory, attachments, submitLabel, textareaRef, onSubmit, onCancel }: {
  initial: string; directory: UserSummary[]; attachments: LeadAttachment[]; submitLabel: string; textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (body: string, attachmentIds: number[]) => Promise<void>; onCancel?: () => void;
}) {
  const { roleLabel } = useApp();
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  const [body, setBody] = useState(initial);
  const [files, setFiles] = useState<number[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    const groups: Suggestion[] = mentionGroups.filter((group) => group.startsWith(query) || groupLabels[group].toLowerCase().startsWith(query)).map((group) => ({ key: group, label: `@${group}`, detail: groupLabels[group], insert: `@${group} ` }));
    const people: Suggestion[] = directory.filter((person) => person.active && person.name.toLowerCase().includes(query)).slice(0, 8).map((person) => ({ key: `u${person.id}`, label: person.name, detail: roleLabel(person.role), insert: `@${person.name} ` }));
    return [...groups, ...people].slice(0, 10);
  }, [mention, directory, roleLabel]);

  const detectMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = /(^|[\s(])@([^\s@]{0,40}(?: [^\s@]{0,40}){0,2})$/.exec(before);
    if (!match) { setMention(null); return; }
    setMention({ start: caret - match[2].length - 1, query: match[2] });
    setHighlight(0);
  };

  const applySuggestion = (suggestion: Suggestion) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, mention.start)}${suggestion.insert}${body.slice(caret)}`;
    setBody(next);
    setMention(null);
    const position = mention.start + suggestion.insert.length;
    window.setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(position, position); }, 0);
  };

  const wrap = (before: string, after = before, placeholder = "text") => {
    const element = ref.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;
    const selected = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    setBody(next);
    window.setTimeout(() => { element?.focus(); element?.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
  };

  const prefixLines = (prefix: (index: number) => string) => {
    const element = ref.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;
    const lineStart = body.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = body.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? body.length : lineEndIndex;
    const lines = (body.slice(lineStart, lineEnd) || "item").split("\n").map((line, index) => `${prefix(index)}${line}`);
    const next = `${body.slice(0, lineStart)}${lines.join("\n")}${body.slice(lineEnd)}`;
    setBody(next);
    window.setTimeout(() => { element?.focus(); element?.setSelectionRange(lineStart, lineStart + lines.join("\n").length); }, 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && suggestions.length) {
      if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => (current + 1) % suggestions.length); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); applySuggestion(suggestions[highlight]); return; }
      if (event.key === "Escape") { event.preventDefault(); setMention(null); return; }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) { setError("Write a message first."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit(text, files);
      setBody("");
      setFiles([]);
      setShowFiles(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="message-form" onSubmit={submit}>
      <div className="message-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" aria-label="Bold" title="Bold (**text**)" onClick={() => wrap("**")}><Bold size={13} /></button>
        <button type="button" aria-label="Italic" title="Italic (_text_)" onClick={() => wrap("_")}><Italic size={13} /></button>
        <button type="button" aria-label="Bulleted list" title="Bulleted list (- item)" onClick={() => prefixLines(() => "- ")}><List size={13} /></button>
        <button type="button" aria-label="Numbered list" title="Numbered list (1. item)" onClick={() => prefixLines((index) => `${index + 1}. `)}><span className="toolbar-text">1.</span></button>
        <button type="button" aria-label="Link" title="Link ([text](https://…))" onClick={() => wrap("[", "](https://)", "link text")}><Link2 size={13} /></button>
        <button type="button" aria-label="Mention someone" title="Mention (@name, @all, @admin, @recruiter, @salesmanager)" onClick={() => { const caret = ref.current?.selectionStart ?? body.length; const needsSpace = caret > 0 && !/\s/.test(body[caret - 1] ?? ""); const insert = `${needsSpace ? " " : ""}@`; const next = `${body.slice(0, caret)}${insert}${body.slice(caret)}`; setBody(next); const position = caret + insert.length; setMention({ start: position - 1, query: "" }); setHighlight(0); window.setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(position, position); }, 0); }}><AtSign size={13} /></button>
        {attachments.length > 0 && <button type="button" aria-label="Reference a file" title="Reference a file from this lead" aria-pressed={showFiles} onClick={() => setShowFiles((current) => !current)}><Paperclip size={13} />{files.length ? <span className="toolbar-count">{files.length}</span> : null}</button>}
      </div>
      <div className="message-input">
        <textarea
          ref={ref}
          aria-label="Message"
          rows={4}
          value={body}
          maxLength={maxMessageLength}
          placeholder="Write a message. Use @ to mention a colleague, **bold**, _italic_, - lists, and [links](https://…)."
          onChange={(event) => { setBody(event.target.value); detectMention(event.target.value, event.target.selectionStart ?? event.target.value.length); }}
          onKeyDown={onKeyDown}
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
      {showFiles && attachments.length > 0 && (
        <fieldset className="message-file-picker">
          <legend>Reference files</legend>
          {attachments.map((file) => (
            <label key={file.id} className="checklist-item">
              <input type="checkbox" checked={files.includes(file.id)} onChange={(event) => setFiles((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} />
              <span>{file.fileName} <small>({file.label})</small></span>
            </label>
          ))}
        </fieldset>
      )}
      <ErrorText message={error} />
      <div className="message-form-actions">
        <small>{body.length ? `${body.length}/${maxMessageLength}` : "Ctrl+Enter to post"}</small>
        {onCancel && <button type="button" className="button button-outline button-small" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? "Posting..." : submitLabel}</button>
      </div>
    </form>
  );
}
