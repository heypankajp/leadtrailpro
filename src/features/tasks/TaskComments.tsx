"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Paperclip, Pencil, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { LeadAttachment } from "@/features/attachments/model";
import { attachmentUrl, fetchLead } from "@/features/leads/client";
import { maxMessageLength } from "@/features/messages/model";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, ErrorText, Loading } from "@/features/shell/components";
import RichText from "@/features/shell/RichText";
import RichTextArea from "@/features/shell/RichTextArea";
import { fetchDirectory } from "@/features/users/client";
import type { UserSummary } from "@/features/users/model";
import { addTaskComment, editTaskComment, fetchTaskComments, removeTaskComment } from "./client";
import type { Task, TaskComment } from "./model";

/** Comments on a task (TASK-04): rich text, @mentions, references to the lead's files (COLL-06), own edits, Admin removal. */
export default function TaskComments({ task }: { task: Task }) {
  const { user, can, roleLabel, notify, bumpData } = useApp();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [directory, setDirectory] = useState<UserSummary[]>([]);
  const [attachments, setAttachments] = useState<LeadAttachment[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<number[]>([]);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canPost = can("collaborate");

  const load = useCallback(async () => {
    try { setComments((await fetchTaskComments(task.id)).comments); setError(""); } catch (caught) { setError(errorMessage(caught)); }
  }, [task.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void fetchDirectory().then((result) => setDirectory(result.users)).catch(() => undefined);
      if (task.leadId) void fetchLead(task.leadId).then((detail) => setAttachments(detail.attachments.filter((file) => !file.deletedAt))).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, task.leadId]);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      const message = await work();
      await load();
      bumpData();
      notify(message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const post = () => {
    const text = body.trim();
    if (!text) { setError("Write a comment first."); return; }
    void run(async () => {
      const result = await addTaskComment(task.id, { body: text, attachmentIds: files });
      setBody("");
      setFiles([]);
      return result.comment.mentions.length ? "Comment posted and mentions notified" : "Comment posted";
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const text = editing.body.trim();
    if (!text) { setError("Write a comment first."); return; }
    void run(async () => { await editTaskComment(editing.id, text); setEditing(null); return "Comment updated"; });
  };

  const remove = (id: number) => void run(async () => { await removeTaskComment(id); setRemoving(null); return "Comment removed"; });

  return (
    <section className="task-comments" aria-label="Comments">
      <h3><MessageSquare size={14} /> Comments{comments ? ` (${comments.filter((comment) => !comment.deletedAt).length})` : ""}</h3>
      {comments === null && !error && <Loading text="Loading comments..." />}
      {comments && comments.length === 0 && <p className="muted-note">No comments yet.{canPost ? " Mention a colleague with @ to notify them." : ""}</p>}
      <div className="message-threads">
        {comments?.map((comment) => (
          <article className={`message ${comment.deletedAt ? "is-removed" : ""}`} key={comment.id} aria-label={`Comment from ${comment.authorName}`}>
            <Avatar name={comment.authorName} seed={comment.authorId} className="message-avatar" />
            <div className="message-body">
              <div className="message-head">
                <strong>{comment.authorName}</strong>
                <span className="badge badge-muted">{roleLabel(comment.authorRole as UserSummary["role"])}</span>
                <small title={formatDateTime(comment.createdAt)}>{relativeTime(comment.createdAt)}{comment.editedAt ? " · edited" : ""}</small>
              </div>
              {comment.deletedAt ? (
                <p className="message-removed">Comment removed by {comment.deletedByName ?? "an administrator"} {relativeTime(comment.deletedAt)}.</p>
              ) : editing?.id === comment.id ? (
                <div className="message-form">
                  <RichTextArea value={editing.body} onChange={(value) => setEditing({ id: comment.id, body: value })} directory={directory} label="Edit comment" rows={3} maxLength={maxMessageLength} />
                  <div className="message-form-actions">
                    <button type="button" className="button button-outline button-small" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="button button-primary button-small" disabled={busy} onClick={saveEdit}>Save changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <RichText text={comment.body} className="message-text" />
                  {comment.attachments.length > 0 && (
                    <ul className="message-files">
                      {comment.attachments.map((file) => <li key={file.id}><Paperclip size={11} /> <a href={attachmentUrl(file.id)} target="_blank" rel="noopener noreferrer">{file.fileName}</a> <span>{file.label}</span></li>)}
                    </ul>
                  )}
                  <div className="message-actions">
                    {canPost && comment.authorId === user.id && <button type="button" className="link-button" onClick={() => { setEditing({ id: comment.id, body: comment.body }); setRemoving(null); }}><Pencil size={12} /> Edit</button>}
                    {can("moderate_messages") && (removing === comment.id
                      ? <><button type="button" className="link-button danger-text" onClick={() => remove(comment.id)}>Confirm removal</button><button type="button" className="link-button" onClick={() => setRemoving(null)}>Keep</button></>
                      : <button type="button" className="link-button" aria-label={`Remove comment from ${comment.authorName}`} onClick={() => { setRemoving(comment.id); setEditing(null); }}><Trash2 size={12} /> Remove</button>)}
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {canPost ? (
        <div className="message-form task-comment-composer">
          <RichTextArea
            value={body}
            onChange={setBody}
            directory={directory}
            attachments={attachments}
            selectedAttachmentIds={files}
            onAttachmentsChange={setFiles}
            label="Comment"
            rows={3}
            maxLength={maxMessageLength}
            placeholder={task.leadId ? "Add a comment. Use @ to mention a colleague and the paperclip to reference the lead's files." : "Add a comment. Use @ to mention a colleague."}
            onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); post(); } }}
          />
          <ErrorText message={error} />
          <div className="message-form-actions">
            <small>Ctrl+Enter to post</small>
            <button type="button" className="button button-primary button-small" disabled={busy} onClick={post}>{busy ? "Posting..." : "Post comment"}</button>
          </div>
        </div>
      ) : <ErrorText message={error} />}
    </section>
  );
}
