"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import type { LeadEmail } from "./gmail";

type GmailStatus = { configured: boolean; connectedEmail: string | null; isAdmin: boolean };

export function LeadEmails({ leadId, emailKey, hasAddress, summary }: { leadId: number; emailKey: string; hasAddress: boolean; summary: (controls: ReactNode) => ReactNode }) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [emails, setEmails] = useState<LeadEmail[]>([]);
  const [message, setMessage] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gmail", { cache: "no-store" })
      .then(async (response) => { if (response.ok && !cancelled) setStatus(await response.json() as GmailStatus); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [reload]);

  const connected = Boolean(status?.connectedEmail);
  const canLoad = Boolean(status?.configured && (connected || status.isAdmin) && hasAddress);
  const requestKey = `${leadId}|${emailKey}|${reload}`;
  const loading = canLoad && loadedKey !== requestKey;

  useEffect(() => {
    if (!canLoad) return;
    let cancelled = false;
    fetch(`/api/leads/${leadId}/emails`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { emails?: LeadEmail[]; failures?: number; error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Emails could not be loaded.");
        setEmails(data.emails ?? []);
        setMessage(data.failures ? "Some mailboxes could not be read. Those users may need to reconnect Gmail." : "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEmails([]);
        setMessage(error instanceof Error ? error.message : "Emails could not be loaded.");
      })
      .finally(() => { if (!cancelled) setLoadedKey(requestKey); });
    return () => { cancelled = true; };
  }, [canLoad, leadId, requestKey]);

  const disconnect = async () => {
    await fetch("/api/gmail", { method: "DELETE" });
    setEmails([]);
    setReload((value) => value + 1);
  };

  return (
    <>
      {summary(status?.configured ? <div className="gmail-controls">
            {connected
              ? <><span>{status.connectedEmail}</span> · <button className="gmail-disconnect" type="button" onClick={disconnect}>Disconnect Gmail</button></>
              : <a className="gmail-connect" href="/api/gmail/connect"><Mail size={11} aria-hidden="true" /> Connect Gmail</a>}
          </div> : null)}
      <section className="lead-emails" aria-label="Recent emails">
      {status && !status.configured && <p className="detail-missing">Gmail is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GMAIL_TOKEN_KEY in .env.local.</p>}
      {status?.configured && !connected && !status.isAdmin && <p className="detail-missing">Connect your Gmail to see emails exchanged with this client.</p>}
      {status?.configured && !hasAddress && <p className="detail-missing">Add an executive or alternate email to see messages.</p>}
      {loading && <p>Loading emails…</p>}
      {message && <p className="detail-missing">{message}</p>}
      {canLoad && !loading && emails.length === 0 && !message && <p className="detail-missing">No recent emails found.</p>}
      <ul>
        {emails.map((email) => (
          <li key={email.id}>
            <span className={`email-direction ${email.direction}`}>{email.direction === "sent" ? "Sent" : "Received"}</span>
            <strong>{email.subject}</strong>
            <small>{email.date ? new Date(email.date).toLocaleString() : ""}{status?.isAdmin ? ` · Mailbox ${email.mailbox}` : ""}</small>
            <small>From: {email.from}</small>
            <small>To: {email.to || "—"}</small>
            {email.cc && <small>Cc: {email.cc}</small>}
            <p className="email-body" tabIndex={0}>{email.snippet}</p>
          </li>
        ))}
      </ul>
    </section>
    </>
  );
}
