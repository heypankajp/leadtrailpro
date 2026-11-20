"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import { changePassword } from "./client";

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { notify } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (next !== confirm) { setError("The new passwords do not match."); return; }
    setBusy(true);
    setError("");
    try {
      await changePassword(current, next);
      notify("Password changed. Other sessions were signed out.");
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Change Your Password" eyebrow="SECURITY" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <Field label="Current Password" required><input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required maxLength={200} autoFocus /></Field>
        <Field label="New Password" required hint="At least 12 characters."><input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={next} onChange={(event) => setNext(event.target.value)} required /></Field>
        <Field label="Confirm New Password" required><input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></Field>
        <ErrorText message={error} />
        <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Change Password"}</button></div>
      </form>
    </Dialog>
  );
}
