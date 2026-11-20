"use client";

import { useState } from "react";
import { Info, RotateCcw, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText } from "@/features/shell/components";
import { restoreDaysOf } from "./model";

/** "Are you sure you want to delete this deal?" (request of November 20, 2026), for a deal or a lead. */
export function DeleteConfirmDialog({ kind, name, onConfirm, onClose }: { kind: "deal" | "lead"; name: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const { navigate, reference } = useApp();
  const restoreDays = restoreDaysOf(reference.listValues.restore_days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (caught) {
      setError(errorMessage(caught, `The ${kind} could not be deleted.`));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Are you sure you want to delete this ${kind}?`} eyebrow={name.toUpperCase()} onClose={onClose}>
      <div className="delete-dialog">
        <p>{kind === "deal" ? "Its notes, activities, tasks, emails and files go with it." : "Its contacts list, job listings and notes go with it."}</p>
        <div className="delete-note">
          <Info size={16} />
          <span>You can restore deleted {kind}s from the <button type="button" className="text-button" onClick={() => { onClose(); navigate("restore-data", kind === "deal" ? "deals" : "leads"); }}>Restore Data</button> page within {restoreDays} days.</span>
        </div>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-danger" disabled={busy} onClick={() => void confirm()}><Trash2 size={14} /> {busy ? "Deleting..." : `Delete ${kind === "deal" ? "Deal" : "Lead"}`}</button>
        </div>
      </div>
    </Dialog>
  );
}

/** "Are you sure you want to restore …?" for one or several deleted deals or leads. */
export function RestoreConfirmDialog({ kind, names, onConfirm, onClose }: { kind: "deal" | "lead"; names: string[]; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const one = names.length === 1;
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (caught) {
      setError(errorMessage(caught, "Nothing could be restored."));
      setBusy(false);
    }
  };
  return (
    <Dialog title={one ? `Are you sure you want to restore this ${kind} (${names[0]})?` : `Are you sure you want to restore the selected ${kind}s [${names.length}]?`} eyebrow="RESTORE DATA" onClose={onClose}>
      <div className="delete-dialog">
        <p>{kind === "deal" ? `This also restores ${one ? "its" : "their"} notes, activities, tasks, emails and files.` : `This also restores ${one ? "its" : "their"} contacts, job listings and notes.`}</p>
        <p>{kind === "deal"
          ? <>{one ? "The deal goes back" : "The deals go back"} to <strong>where {one ? "it was" : "they were"}</strong>: its stage on the board, or the Archive or the approval queue.</>
          : <>{one ? "The lead goes back" : "The leads go back"} to <strong>where {one ? "it was" : "they were"}</strong>: the Leads inbox, or the Archive.</>}</p>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-success" disabled={busy} onClick={() => void confirm()}><RotateCcw size={14} /> {busy ? "Restoring..." : "Restore"}</button>
        </div>
      </div>
    </Dialog>
  );
}
