"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Mail, Reply, Send, Unplug } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { fileSize, formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import type { LeadAttachment } from "@/features/attachments/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, EmptyState, ErrorText, Field, Loading } from "@/features/shell/components";
import { disconnectGmail, fetchGmailStatus, fetchLeadEmails, gmailConnectUrl, sendLeadEmail } from "./client";
import type { LeadEmail } from "./model";

type Compose = { to: string; cc: string; subject: string; body: string; threadId: string | null; inReplyTo: string | null };

/**
 * Emails tab on the lead (MAIL-01, MAIL-02, MAIL-03): the messages exchanged with the lead's client addresses, read
 * through the signed-in person's connected Gmail (every connected mailbox for team-report viewers), grouped by
 * thread, with Send email and Reply going out from the person's own mailbox.
 */
export default function LeadEmails({ leadId, addresses, attachments }: { leadId: number; addresses: string[]; attachments: LeadAttachment[] }) {
  const { notify, bumpData } = useApp();
  const [version, setVersion] = useState(0);
  const statusFetcher = useCallback(() => fetchGmailStatus(), []);
  const { data: status, error: statusError } = useAsyncData(statusFetcher, version);
  const connected = Boolean(status?.connectedEmail);
  // Loads even without an own mailbox: colleagues' mailboxes matched to this lead by the mailbox watch are searched too.
  const canLoad = Boolean(status?.configured && addresses.length);
  const ownMailbox = (email: LeadEmail) => email.mailbox.toLowerCase() === (status?.connectedEmail ?? "").toLowerCase();
  const emailsFetcher = useCallback(() => (canLoad ? fetchLeadEmails(leadId) : Promise.resolve({ emails: [], failures: 0 })), [canLoad, leadId]);
  const { data: result, error: emailsError, loading } = useAsyncData(emailsFetcher, `${addresses.join(",")}|${version}`);
  const [compose, setCompose] = useState<Compose | null>(null);

  const threads = useMemo(() => {
    const byThread = new Map<string, LeadEmail[]>();
    for (const email of result?.emails ?? []) {
      const key = email.threadId || email.id;
      const list = byThread.get(key) ?? [];
      if (!byThread.has(key)) byThread.set(key, list);
      list.push(email);
    }
    return [...byThread.values()].map((list) => list.sort((a, b) => a.date.localeCompare(b.date))).sort((a, b) => b[b.length - 1].date.localeCompare(a[a.length - 1].date));
  }, [result]);

  const disconnect = async () => {
    try {
      await disconnectGmail();
      notify("Gmail disconnected");
      setVersion((value) => value + 1);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const startCompose = () => setCompose({ to: addresses.join(", "), cc: "", subject: "", body: "", threadId: null, inReplyTo: null });
  const startReply = (email: LeadEmail) => {
    const replyTo = email.direction === "received" ? (email.from.match(/[^\s<>,;"']+@[^\s<>,;"']+/)?.[0] ?? email.from) : addresses[0] ?? "";
    // A thread id only exists inside the mailbox that holds it; a reply to a colleague's thread relies on the In-Reply-To header instead.
    setCompose({ to: replyTo, cc: "", subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`, body: "", threadId: ownMailbox(email) ? email.threadId || null : null, inReplyTo: email.messageId || null });
  };

  if (!status && !statusError) return <Loading text="Checking Gmail..." />;

  return (
    <section className="lead-emails" aria-label="Recent emails">
      <ErrorText message={statusError} />
      {status && !status.configured && (
        <div className="form-note note-warning"><Mail size={14} /> Gmail is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_TOKEN_KEY to .env.local and restart the app. Until then, log emails on the Timeline.</div>
      )}
      {status?.configured && (
        <div className="section-actions gmail-controls">
          {connected
            ? <><span className="chip-value"><Mail size={13} /> {status.connectedEmail}</span><button className="button button-outline button-small" onClick={() => void disconnect()}><Unplug size={14} /> Disconnect Gmail</button></>
            : <a className="button button-primary button-small" href={gmailConnectUrl}><Mail size={14} /> Connect Gmail</a>}
          {connected && <button className="button button-primary button-small" onClick={startCompose}><Send size={14} /> Send email</button>}
          {status.allMailboxes && <small className="field-hint">You see messages from every connected mailbox.</small>}
        </div>
      )}
      {status?.configured && addresses.length === 0 && <p className="no-attachments">Add a client email address to the lead to see messages.</p>}
      {status?.configured && addresses.length > 0 && !connected && !status.allMailboxes && <p className="no-attachments">Connect your Gmail to see and answer emails from your own mailbox. Emails that colleagues&apos; connected mailboxes exchanged with this client are listed below.</p>}
      {canLoad && loading && <Loading text="Loading emails..." />}
      <ErrorText message={emailsError} />
      {canLoad && !loading && result && (
        <>
          {result.failures > 0 && <div className="form-note note-warning"><Mail size={14} /> Some mailboxes could not be read. Those users may need to reconnect Gmail.</div>}
          {threads.length === 0
            ? <EmptyState icon={<Mail size={22} />} title="No recent emails found" text="Messages to or from the lead's email addresses appear here." />
            : (
              <div className="email-list">
                {threads.map((thread) => (
                  <div className="email-thread" key={thread[0].threadId || thread[0].id}>
                    {thread.length > 1 && <div className="email-thread-head"><strong>{thread[thread.length - 1].subject}</strong><small>{thread.length} messages</small></div>}
                    {thread.map((email) => (
                      <article className="email-entry" key={email.id}>
                        <div className="email-head">
                          <span className={`badge ${email.direction === "sent" ? "badge-on" : "badge-muted"}`}>{email.direction === "sent" ? "Sent" : "Received"}</span>
                          <strong>{email.subject}</strong>
                          <small>{formatDateTime(email.date)}</small>
                          {connected && <button type="button" className="text-button email-reply" onClick={() => startReply(email)}><Reply size={12} /> Reply</button>}
                        </div>
                        <small>From {email.from} · To {email.to || "—"}{email.cc ? ` · Cc ${email.cc}` : ""}{!ownMailbox(email) ? ` · Mailbox ${email.mailbox}` : ""}</small>
                        <p className="email-body">{email.snippet}</p>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            )}
        </>
      )}
      {compose && (
        <ComposeDialog
          leadId={leadId}
          initial={compose}
          attachments={attachments.filter((item) => !item.deletedAt)}
          onClose={() => setCompose(null)}
          onSent={() => { setCompose(null); notify("Email sent"); bumpData(); setVersion((value) => value + 1); }}
        />
      )}
    </section>
  );
}

function ComposeDialog({ leadId, initial, attachments, onClose, onSent }: { leadId: number; initial: Compose; attachments: LeadAttachment[]; onClose: () => void; onSent: () => void }) {
  const [form, setForm] = useState(initial);
  const [attached, setAttached] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Compose) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sendLeadEmail(leadId, { to: form.to, cc: form.cc, subject: form.subject, body: form.body, attachmentIds: attached, threadId: form.threadId, inReplyTo: form.inReplyTo });
      onSent();
    } catch (caught) {
      setError(errorMessage(caught, "The email could not be sent."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={form.threadId ? "Reply" : "Send email"} eyebrow="FROM YOUR MAILBOX" onClose={onClose} size="wide">
      <form className="lead-form" onSubmit={submit}>
        <Field label="To" required wide hint="Separate several addresses with commas."><input value={form.to} onChange={set("to")} required placeholder="name@company.com" /></Field>
        <Field label="Cc" wide><input value={form.cc} onChange={set("cc")} placeholder="Optional" /></Field>
        <Field label="Subject" required wide><input value={form.subject} onChange={set("subject")} required maxLength={200} /></Field>
        <Field label="Message" required wide><textarea value={form.body} onChange={set("body")} rows={10} maxLength={20000} required /></Field>
        {attachments.length > 0 && (
          <fieldset className="user-privileges email-attachments">
            <legend>Attach documents of this lead</legend>
            {attachments.map((item) => (
              <label key={item.id} className="checklist-item">
                <input type="checkbox" checked={attached.includes(item.id)} onChange={(event) => setAttached((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                {item.label || item.fileName} <small className="muted-cell">{item.fileName} · {fileSize(item.sizeBytes)}</small>
              </label>
            ))}
          </fieldset>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><Send size={14} /> {busy ? "Sending..." : "Send"}</button>
        </div>
      </form>
    </Dialog>
  );
}
