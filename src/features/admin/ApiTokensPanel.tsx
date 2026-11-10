"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Copy, KeyRound, Plus, ShieldOff } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, EmptyState, ErrorText, Field, Loading } from "@/features/shell/components";
import { apiTokenExpiryChoices, apiTokenUsable, defaultApiTokenExpiryDays, maxApiTokenNameLength, type ApiToken } from "@/features/users/api-token-model";
import { createApiToken, fetchApiTokens, revokeApiToken } from "./client";

/** Administration → API access (SPEC §4): personal access tokens for scripts and administration from another machine. */
export default function ApiTokensPanel() {
  const { notify } = useApp();
  const fetcher = useCallback(() => fetchApiTokens().then((result) => result.tokens), []);
  const { data: tokens, error, reload } = useAsyncData<ApiToken[]>(fetcher);
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "revoke"; token: ApiToken } | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "https://your-host" : window.location.origin;

  const revoke = async (token: ApiToken) => {
    setBusy(true);
    try {
      await revokeApiToken(token.id);
      setDialog(null);
      reload();
      notify(`Token "${token.name}" revoked`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">ADMINISTRATION <span className="eyebrow-dot">·</span> {tokens ? `${tokens.length} ACTIVE` : "LOADING"}</div><h1>API access</h1><p>Personal access tokens for scripts and for administering the app from another machine.</p></div>
        <button className="button button-primary" onClick={() => setDialog({ kind: "create" })}><Plus size={17} /> Create token</button>
      </div>
      <ErrorText message={error} />
      {!tokens && !error && <Loading text="Loading tokens..." />}
      {tokens && (
        <section className="panel team-panel">
          <div className="form-note"><KeyRound size={14} /> <span>A token acts as the person who created it, with that account&apos;s privileges at the time of each request, until it expires or is revoked. Send it as <code>Authorization: Bearer ltp_…</code> to any <code>/api/…</code> endpoint, or put it in <code>.env.remote.local</code> and use <code>npm run remote -- …</code> from a checkout of the project. Tokens are shown once, at creation; only a hash is stored.</span></div>
          {tokens.length === 0 ? <EmptyState icon={<KeyRound size={20} />} title="No API tokens" text="Create one to call the API from a script or another machine." /> : (
            <div className="table-scroll">
              <table className="lead-table team-table">
                <thead><tr><th>NAME</th><th>TOKEN</th><th>OWNER</th><th>CREATED</th><th>EXPIRES</th><th>LAST USED</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td><strong>{token.name}</strong></td>
                      <td><code className="muted-cell">{token.prefix}…</code></td>
                      <td><span className="cell-stack"><strong>{token.userName}</strong><small>{token.userEmail}</small></span></td>
                      <td><span className="muted-cell">{formatDateTime(token.createdAt)}</span></td>
                      <td>{token.expiresAt ? <span className={`badge ${apiTokenUsable(token) ? "badge-muted" : "badge-off"}`}>{apiTokenUsable(token) ? formatDateTime(token.expiresAt) : `Expired ${relativeTime(token.expiresAt)}`}</span> : <span className="badge badge-on">Never</span>}</td>
                      <td><span className="muted-cell">{token.lastUsedAt ? relativeTime(token.lastUsedAt) : "Never"}</span></td>
                      <td><span className="row-actions"><button className="icon-button danger" title="Revoke" aria-label={`Revoke ${token.name}`} onClick={() => setDialog({ kind: "revoke", token })}><ShieldOff size={14} /></button></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {dialog?.kind === "create" && <CreateTokenDialog origin={origin} onClose={() => { setDialog(null); reload(); }} />}
      {dialog?.kind === "revoke" && (
        <Dialog title={`Revoke "${dialog.token.name}"?`} eyebrow="API ACCESS" onClose={() => setDialog(null)} size="narrow">
          <p className="dialog-description">Scripts using this token ({dialog.token.prefix}…) stop working at once. This cannot be undone; create a new token if it is needed again.</p>
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button>
            <button type="button" className="button button-danger" disabled={busy} onClick={() => void revoke(dialog.token)}>{busy ? "Revoking..." : "Revoke token"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function CreateTokenDialog({ origin, onClose }: { origin: string; onClose: () => void }) {
  const { notify } = useApp();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<string>(String(defaultApiTokenExpiryDays));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ token: string; apiToken: ApiToken } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCreated(await createApiToken({ name: name.trim(), expiresInDays: expiry === "never" ? null : Number(expiry) }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.token); notify("Token copied"); } catch { notify("Could not copy; select the token and copy it by hand.", "error"); }
  };

  if (created) {
    const usage = `# .env.remote.local in a checkout of the project (git-ignored)\nLTP_URL=${origin}\nLTP_TOKEN=${created.token}\n\nnpm run remote -- whoami\nnpm run remote -- import "docs/Sales Leads 2026.xlsx"        # preview; add --apply to import\n\n# or any HTTP client\ncurl -H "Authorization: Bearer ${created.token}" ${origin}/api/users`;
    return (
      <Dialog title={`Token "${created.apiToken.name}" created`} eyebrow="API ACCESS" onClose={onClose}>
        <p className="dialog-description">Copy the token now: it is not shown again. It acts as you{created.apiToken.expiresAt ? ` until ${formatDateTime(created.apiToken.expiresAt)}` : " and does not expire"}, or until it is revoked.</p>
        <div className="token-code"><code aria-label="API token">{created.token}</code><button type="button" className="button button-outline button-small" onClick={() => void copy()}><Copy size={13} /> Copy</button></div>
        <pre className="token-usage">{usage}</pre>
        <div className="modal-actions"><button type="button" className="button button-primary" onClick={onClose}>Done</button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Create API token" eyebrow="API ACCESS" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">The token acts as you, with your privileges. Give it a name you will recognise in the list, for example the machine or script it is for.</p>
        <Field label="Token name" required><input value={name} maxLength={maxApiTokenNameLength} placeholder="Manish's laptop" onChange={(event) => setName(event.target.value)} required autoFocus /></Field>
        <Field label="Expires after">
          <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            {apiTokenExpiryChoices.map((days) => <option key={days} value={days}>{days} days</option>)}
            <option value="never">Never (revoke it by hand)</option>
          </select>
        </Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><KeyRound size={15} /> {busy ? "Creating..." : "Create token"}</button>
        </div>
      </form>
    </Dialog>
  );
}
