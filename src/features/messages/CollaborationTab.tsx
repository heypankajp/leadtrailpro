"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { CornerDownRight, MessageSquare, Paperclip, Pencil, Quote, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { LeadAttachment } from "@/features/attachments/model";
import { attachmentUrl } from "@/features/leads/client";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, EmptyState, ErrorText, Loading } from "@/features/shell/components";
import RichText from "@/features/shell/RichText";
import RichTextArea from "@/features/shell/RichTextArea";
import { fetchDirectory } from "@/features/users/client";
import type { UserSummary } from "@/features/users/model";
import { editMessage, fetchThreads, postMessage, removeMessage } from "./client";
import { maxMessageLength, type LeadMessage, type MessageThread } from "./model";

const pollSeconds = 20;

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

/** Message composer: the shared rich-text editor plus submit, cancel, and the character count (NOTE-03, COLL-02, COLL-06). */
function MessageEditor({ initial, directory, attachments, submitLabel, textareaRef, onSubmit, onCancel }: {
  initial: string; directory: UserSummary[]; attachments: LeadAttachment[]; submitLabel: string; textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (body: string, attachmentIds: number[]) => Promise<void>; onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [files, setFiles] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="message-form" onSubmit={submit}>
      <RichTextArea
        value={body}
        onChange={setBody}
        directory={directory}
        attachments={attachments}
        selectedAttachmentIds={files}
        onAttachmentsChange={setFiles}
        label="Message"
        rows={4}
        maxLength={maxMessageLength}
        textareaRef={textareaRef}
        placeholder="Write a message. Use @ to mention a colleague, **bold**, _italic_, - lists, and [links](https://…)."
        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
      />
      <ErrorText message={error} />
      <div className="message-form-actions">
        <small>{body.length ? `${body.length}/${maxMessageLength}` : "Ctrl+Enter to post"}</small>
        {onCancel && <button type="button" className="button button-outline button-small" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? "Posting..." : submitLabel}</button>
      </div>
    </form>
  );
}
