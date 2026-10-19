"use client";

import { useCallback, useState } from "react";
import { Mail, Unplug } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState, ErrorText, Loading } from "@/features/shell/components";
import { disconnectGmail, fetchGmailStatus, fetchLeadEmails, gmailConnectUrl } from "./client";

/**
 * Emails tab on the lead (MAIL-01, MAIL-03): recent messages exchanged with the lead's client addresses, read
 * through the signed-in user's connected Gmail account, or every connected mailbox for team-report viewers.
 */
export default function LeadEmails({ leadId, addresses }: { leadId: number; addresses: string[] }) {
  const { notify } = useApp();
  const [version, setVersion] = useState(0);
  const statusFetcher = useCallback(() => fetchGmailStatus(), []);
  const { data: status, error: statusError } = useAsyncData(statusFetcher, version);
  const connected = Boolean(status?.connectedEmail);
  const canLoad = Boolean(status?.configured && (connected || status?.allMailboxes) && addresses.length);
  const emailsFetcher = useCallback(() => (canLoad ? fetchLeadEmails(leadId) : Promise.resolve({ emails: [], failures: 0 })), [canLoad, leadId]);
  const { data: result, error: emailsError, loading } = useAsyncData(emailsFetcher, `${addresses.join(",")}|${version}`);

  const disconnect = async () => {
    try {
      await disconnectGmail();
      notify("Gmail disconnected");
      setVersion((value) => value + 1);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
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
          {status.allMailboxes && <small className="field-hint">You see messages from every connected mailbox.</small>}
        </div>
      )}
      {status?.configured && addresses.length === 0 && <p className="no-attachments">Add a client email address to the lead to see messages.</p>}
      {status?.configured && addresses.length > 0 && !connected && !status.allMailboxes && <p className="no-attachments">Connect your Gmail to see emails exchanged with this client.</p>}
      {canLoad && loading && <Loading text="Loading emails..." />}
      <ErrorText message={emailsError} />
      {canLoad && !loading && result && (
        <>
          {result.failures > 0 && <div className="form-note note-warning"><Mail size={14} /> Some mailboxes could not be read. Those users may need to reconnect Gmail.</div>}
          {result.emails.length === 0
            ? <EmptyState icon={<Mail size={22} />} title="No recent emails found" text="Messages to or from the lead's email addresses appear here." />
            : (
              <div className="email-list">
                {result.emails.map((email) => (
                  <article className="email-entry" key={email.id}>
                    <div className="email-head">
                      <span className={`badge ${email.direction === "sent" ? "badge-on" : "badge-muted"}`}>{email.direction === "sent" ? "Sent" : "Received"}</span>
                      <strong>{email.subject}</strong>
                      <small>{formatDateTime(email.date)}</small>
                    </div>
                    <small>From {email.from} · To {email.to || "—"}{email.cc ? ` · Cc ${email.cc}` : ""}{status?.allMailboxes ? ` · Mailbox ${email.mailbox}` : ""}</small>
                    <p className="email-body">{email.snippet}</p>
                  </article>
                ))}
              </div>
            )}
        </>
      )}
    </section>
  );
}
