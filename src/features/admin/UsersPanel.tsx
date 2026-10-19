"use client";

import { useCallback, useState, type FormEvent } from "react";
import { KeyRound, Mail, Pencil, Plus, UserMinus, UserPlus } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatTimeOfDay } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, Dialog, ErrorText, Field, Loading } from "@/features/shell/components";
import { fetchUser, fetchUsers, sendResetLink, setUserPassword, terminateUser, updateUser } from "@/features/users/client";
import type { UserAccount } from "@/features/users/model";
import { stageLabels } from "@/features/users/model";
import type { LoginHistoryEntry } from "@/features/users/session-types";
import UserFormDialog from "./UserFormDialog";

export default function UsersPanel() {
  const { user: me, reference, refreshReference, roleLabel, notify } = useApp();
  const fetcher = useCallback(() => fetchUsers().then((result) => result.users), []);
  const { data: users, error, reload } = useAsyncData<UserAccount[]>(fetcher);
  const [dialog, setDialog] = useState<
    | { kind: "create" } | { kind: "edit"; user: UserAccount } | { kind: "password"; user: UserAccount } | { kind: "terminate"; user: UserAccount } | { kind: "history"; user: UserAccount; entries: LoginHistoryEntry[] | null }
    | null
  >(null);

  const after = async (message: string) => {
    setDialog(null);
    reload();
    await refreshReference();
    notify(message);
  };

  const reactivate = async (user: UserAccount) => {
    try {
      await updateUser(user.id, { active: true });
      await after(`${user.name} reactivated`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const resetLink = async (user: UserAccount) => {
    try {
      const result = await sendResetLink(user.id);
      notify(result.message);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const showHistory = async (user: UserAccount) => {
    setDialog({ kind: "history", user, entries: null });
    try {
      const result = await fetchUser(user.id);
      setDialog({ kind: "history", user, entries: result.loginHistory });
    } catch (caught) {
      notify(errorMessage(caught), "error");
      setDialog(null);
    }
  };

  const templateName = (id: number | null) => reference.targetTemplates.find((template) => template.id === id)?.name ?? "Stage default";

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">ADMINISTRATION <span className="eyebrow-dot">·</span> {users ? `${users.filter((user) => user.active).length} ACTIVE` : "LOADING"}</div><h1>User management</h1><p>Accounts, roles, stages, security options, and termination hand-offs.</p></div>
        <button className="button button-primary" onClick={() => setDialog({ kind: "create" })}><Plus size={17} /> Add user</button>
      </div>
      <ErrorText message={error} />
      {!users && !error && <Loading text="Loading users..." />}
      {users && (
        <section className="panel team-panel">
          <div className="table-scroll">
            <table className="lead-table team-table">
              <thead><tr><th>NAME</th><th>ROLE</th><th>STAGE</th><th>TARGETS</th><th>2FA</th><th>AUTO SIGN-OUT</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={user.active ? "" : "row-inactive"}>
                    <td><span className="owner-cell"><Avatar name={user.name} seed={user.id} /><span className="cell-stack"><strong>{user.name}</strong><small>{user.email}{user.phone ? ` · ${user.phone}` : ""}</small></span></span></td>
                    <td>{roleLabel(user.role)}{user.extraPrivileges.length > 0 && <small className="activity-time">+{user.extraPrivileges.length} extra privilege{user.extraPrivileges.length === 1 ? "" : "s"}</small>}</td>
                    <td>{stageLabels[user.stage]}</td>
                    <td><span className="muted-cell">{templateName(user.targetTemplateId)}</span></td>
                    <td><span className={`badge ${user.twoFactorEnabled ? "badge-on" : "badge-muted"}`}>{user.twoFactorEnabled ? "On" : "Off"}</span></td>
                    <td><span className={`badge ${user.autoLogoutEnabled ? "badge-on" : "badge-muted"}`}>{user.autoLogoutEnabled ? `On · ${formatTimeOfDay(user.autoLogoutTime)}` : "Off"}</span></td>
                    <td>{user.active ? <span className="badge badge-on">Active</span> : <span className="badge badge-off" title={user.terminatedAt ? `Terminated ${formatDateTime(user.terminatedAt)}` : undefined}>Terminated</span>}</td>
                    <td>
                      <span className="row-actions">
                        <button className="icon-button" title="Edit" aria-label={`Edit ${user.name}`} onClick={() => setDialog({ kind: "edit", user })}><Pencil size={14} /></button>
                        <button className="icon-button" title="Set password" aria-label={`Set password for ${user.name}`} onClick={() => setDialog({ kind: "password", user })}><KeyRound size={14} /></button>
                        {reference.mailerConfigured && user.active && <button className="icon-button" title="Email a set-password link" aria-label={`Email a set-password link to ${user.name}`} onClick={() => void resetLink(user)}><Mail size={14} /></button>}
                        <button className="text-button" onClick={() => void showHistory(user)}>Logins</button>
                        {user.active && user.id !== me.id && <button className="icon-button danger" title="Terminate" aria-label={`Terminate ${user.name}`} onClick={() => setDialog({ kind: "terminate", user })}><UserMinus size={14} /></button>}
                        {!user.active && <button className="icon-button" title="Reactivate" aria-label={`Reactivate ${user.name}`} onClick={() => void reactivate(user)}><UserPlus size={14} /></button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dialog?.kind === "create" && <UserFormDialog onClose={() => setDialog(null)} onSaved={(user) => after(`Account created for ${user.name}`)} />}
      {dialog?.kind === "edit" && <UserFormDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={(user) => after(`${user.name} updated`)} />}
      {dialog?.kind === "password" && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={() => after(`Password set for ${dialog.user.name}. Their other sessions were signed out.`)} />}
      {dialog?.kind === "terminate" && <TerminateDialog user={dialog.user} onClose={() => setDialog(null)} onDone={(message) => after(message)} />}
      {dialog?.kind === "history" && (
        <Dialog title={`Login history · ${dialog.user.name}`} eyebrow="SECURITY" onClose={() => setDialog(null)}>
          {!dialog.entries ? <Loading /> : dialog.entries.length === 0 ? <p className="dialog-description">No sign-ins recorded yet.</p> : (
            <div className="table-scroll"><table className="lead-table"><thead><tr><th>WHEN</th><th>RESULT</th><th>ADDRESS</th><th>BROWSER</th></tr></thead><tbody>
              {dialog.entries.map((entry) => <tr key={entry.id}><td>{formatDateTime(entry.createdAt)}</td><td><span className={`badge ${entry.succeeded ? "badge-on" : "badge-off"}`}>{entry.succeeded ? "Signed in" : "Failed"}</span></td><td>{entry.ipAddress}</td><td><span className="muted-cell agent-cell" title={entry.userAgent}>{entry.userAgent.slice(0, 60) || "—"}</span></td></tr>)}
            </tbody></table></div>
          )}
        </Dialog>
      )}
    </>
  );
}

function PasswordDialog({ user, onClose, onSaved }: { user: UserAccount; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    setError("");
    try { await setUserPassword(user.id, password); onSaved(); } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  };
  return (
    <Dialog title={`Set password · ${user.name}`} eyebrow="SECURITY" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">Use this until email delivery is configured. Share the password with the person directly and ask them to change it after signing in.</p>
        <Field label="New password" required hint="At least 12 characters."><input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></Field>
        <Field label="Confirm password" required><input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></Field>
        <ErrorText message={error} />
        <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Set password"}</button></div>
      </form>
    </Dialog>
  );
}

function TerminateDialog({ user, onClose, onDone }: { user: UserAccount; onClose: () => void; onDone: (message: string) => void }) {
  const { reference, user: me } = useApp();
  const successors = reference.users.filter((person) => person.role !== "recruiter" && person.id !== user.id);
  const [successor, setSuccessor] = useState(String(successors.find((person) => person.id === me.id)?.id ?? successors[0]?.id ?? ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!successor) { setError("Choose who receives the leads."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await terminateUser(user.id, Number(successor), reason.trim());
      onDone(`${user.name} terminated. ${result.leadsReassigned} lead(s) and ${result.tasksReassigned} open task(s) moved to ${successors.find((person) => person.id === Number(successor))?.name ?? "the successor"}.`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Terminate ${user.name}`} eyebrow="ACCOUNT TERMINATION" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">The account loses sign-in access immediately and stays in audit history. Every lead and open task they own moves to the person you choose.</p>
        <Field label="Reassign leads and tasks to" required>
          <select value={successor} onChange={(event) => setSuccessor(event.target.value)}>{successors.map((person) => <option key={person.id} value={person.id}>{person.name}{person.id === me.id ? " (me)" : ""}</option>)}</select>
        </Field>
        <Field label="Reason (optional)"><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></Field>
        <ErrorText message={error} />
        <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-danger" disabled={busy}>{busy ? "Terminating..." : "Terminate and reassign"}</button></div>
      </form>
    </Dialog>
  );
}
