"use client";

import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText } from "@/features/shell/components";
import type { NotificationPrefs } from "@/features/users/model";
import { updateMyPreferences } from "./client";

/** The signed-in user's notification preferences (NTF-05). */
export default function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const { user, setUser, notify, reference } = useApp();
  const [prefs, setPrefs] = useState<NotificationPrefs>({ ...user.notificationPrefs });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (key: keyof NotificationPrefs) => setPrefs((current) => ({ ...current, [key]: !current[key] }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await updateMyPreferences(prefs);
      setUser(result.user);
      notify("Notification preferences saved");
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Notification preferences" eyebrow="YOUR ACCOUNT" onClose={onClose} size="narrow">
      <form className="stack-form prefs-form" onSubmit={submit}>
        <p className="dialog-description">In-app notifications are always on. Choose what is also sent by email{reference.mailerConfigured ? "" : " (email delivery is not configured yet, so these only apply once it is)"}.</p>
        <label className="checklist-item"><input type="checkbox" checked={prefs.dailyDigest} onChange={() => toggle("dailyDigest")} /><span>Daily digest of overdue and upcoming follow-ups, tasks, and yesterday&apos;s activity</span></label>
        <label className="checklist-item"><input type="checkbox" checked={prefs.weeklyDigest} onChange={() => toggle("weeklyDigest")} /><span>Weekly digest with last week&apos;s numbers and target progress</span></label>
        <label className="checklist-item"><input type="checkbox" checked={prefs.emailEvents} onChange={() => toggle("emailEvents")} /><span>Email me each event too (task assignments, status changes, transfers, queued leads, file uploads)</span></label>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><Save size={15} /> {busy ? "Saving..." : "Save preferences"}</button>
        </div>
      </form>
    </Dialog>
  );
}
