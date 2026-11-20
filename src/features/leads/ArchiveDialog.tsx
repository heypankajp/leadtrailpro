"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";

/**
 * Archive one deal or a selection (review of November 18, 2026): the Archival reason is picked from its List of values
 * (Approach Later, Not Interested, …) and Archival notes are optional. Both show in the archive.
 */
export default function ArchiveDialog({ title, description, confirmLabel = "Archive Deal", onConfirm, onClose }: {
  title: string; description?: string; confirmLabel?: string;
  onConfirm: (archiveReasonId: number, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const { reference } = useApp();
  const reasons = reference.listValues.archival_reason.filter((item) => item.active);
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reasonId) { setError("Choose the archival reason."); return; }
    setBusy(true);
    setError("");
    try {
      await onConfirm(Number(reasonId), notes.trim());
    } catch (caught) {
      setError(errorMessage(caught, "Could not archive."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} eyebrow="ARCHIVE" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">{description ?? "The deal leaves the board. It can be restored from the archive."}</p>
        <Field label="Archival Reason" required>
          <select value={reasonId} onChange={(event) => setReasonId(event.target.value)} required autoFocus>
            <option value="">Choose a reason</option>
            {reasons.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <Field label="Archival Notes (Optional)">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} placeholder="Anything the team should know before approaching them again" />
        </Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Archiving..." : confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}
