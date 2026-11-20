"use client";

import { useCallback, useState } from "react";
import { Save, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Loading } from "@/features/shell/components";

type StageReminder = { stageId: number; stage: string; pipeline: string | null; days: number; count: number; active: boolean };
const fetchReminders = () => api<{ reminders: StageReminder[] }>("/api/list-values/stage-reminders");
const sendSample = (to: string) => api<{ deals: number }>("/api/list-values/stage-reminders/sample", { method: "POST", json: { to } });
const saveReminder = (input: { stageId: number; days: number; count: number; active: boolean }) => api<{ reminders: StageReminder[] }>("/api/list-values/stage-reminders", { method: "PUT", json: input });

/**
 * List of Values → Auto Reminder (request of November 20, 2026): for each pipeline stage, how many days after a deal moves into
 * it its owner gets a reminder (in the app and by email), and whether the reminder is active.
 */
export default function StageReminderSettings() {
  const { notify, user } = useApp();
  // A sample of the email (request of November 20, 2026), to any address.
  const [sampleTo, setSampleTo] = useState(user.email);
  const [sending, setSending] = useState(false);
  const sample = async () => {
    setSending(true);
    try { const result = await sendSample(sampleTo); notify(`Sample sent to ${sampleTo} with ${result.deals} ${result.deals === 1 ? "deal" : "deals"}`); } catch (caught) { notify(errorMessage(caught), "error"); } finally { setSending(false); }
  };
  const fetcher = useCallback(() => fetchReminders(), []);
  const { data, error, reload } = useAsyncData(fetcher);
  const [drafts, setDrafts] = useState<Record<number, { days?: string; count?: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const save = async (row: StageReminder, changes: { days?: number; count?: number; active?: boolean }) => {
    const days = changes.days ?? row.days;
    const count = changes.count ?? row.count;
    if (!Number.isInteger(days) || days < 1 || days > 365) { notify("Days must be a whole number from 1 to 365.", "error"); return; }
    if (!Number.isInteger(count) || count < 1 || count > 10) { notify("The number of reminders must be a whole number from 1 to 10.", "error"); return; }
    setBusy(row.stageId);
    try {
      await saveReminder({ stageId: row.stageId, days, count, active: changes.active ?? row.active });
      setDrafts((current) => { const next = { ...current }; delete next[row.stageId]; return next; });
      notify(changes.active === undefined ? `${row.stage}: ${count} ${count === 1 ? "reminder" : "reminders"}, every ${days} ${days === 1 ? "day" : "days"}` : `${row.stage}: reminder ${changes.active ? "activated" : "deactivated"}`);
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="panel-heading"><div><h2>Auto Reminder</h2><p>For each pipeline stage, the deal&apos;s owner is reminded once the deal has been in the stage this many days, and again at the same interval up to the number of reminders (in the app, and by email for those who receive event emails). Clients, lost and disqualified deals are left out.</p></div></div>
      <form className="stage-reminder-sample" onSubmit={(event) => { event.preventDefault(); void sample(); }}>
        <label><span className="field-label">Send a Sample Email To</span><input type="email" value={sampleTo} onChange={(event) => setSampleTo(event.target.value)} required maxLength={254} /></label>
        <button type="submit" className="button button-soft button-small" disabled={sending}><Send size={13} /> {sending ? "Sending..." : "Send a Sample Email"}</button>
      </form>
      <ErrorText message={error} />
      {!data && !error ? <Loading /> : data && (
        <div className="table-scroll">
          <table className="lead-table values-table stage-reminder-table">
            <thead><tr><th>PIPELINE STAGE</th><th>REMIND AFTER (DAYS)</th><th>NO. OF REMINDERS</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.reminders.map((row) => {
                const draft = drafts[row.stageId] ?? {};
                const daysValue = draft.days ?? String(row.days);
                const countValue = draft.count ?? String(row.count);
                const changed = daysValue !== String(row.days) || countValue !== String(row.count);
                const saveRow = () => void save(row, { days: Number(daysValue), count: Number(countValue) });
                return (
                  <tr key={row.stageId} className={row.active ? "" : "row-inactive"}>
                    <td><strong>{row.stage}</strong>{row.pipeline && <small className="muted-cell">{row.pipeline}</small>}</td>
                    <td>
                      <form className="stage-reminder-days" onSubmit={(event) => { event.preventDefault(); saveRow(); }}>
                        <input type="number" min={1} max={365} step={1} aria-label={`Days for ${row.stage}`} value={daysValue} onChange={(event) => setDrafts((current) => ({ ...current, [row.stageId]: { ...current[row.stageId], days: event.target.value } }))} />
                        <span className="muted-cell">days</span>
                      </form>
                    </td>
                    <td>
                      {/* No. of Reminders (request of November 20, 2026): the next one comes one interval after the one before. */}
                      <form className="stage-reminder-days" onSubmit={(event) => { event.preventDefault(); saveRow(); }}>
                        <input type="number" min={1} max={10} step={1} aria-label={`Number of reminders for ${row.stage}`} value={countValue} onChange={(event) => setDrafts((current) => ({ ...current, [row.stageId]: { ...current[row.stageId], count: event.target.value } }))} />
                        {changed && <button type="button" className="button button-primary button-small" disabled={busy === row.stageId} onClick={saveRow}><Save size={13} /> Save</button>}
                      </form>
                    </td>
                    <td><span className={`status-chip ${row.active ? "is-active" : ""}`}>{row.active ? "Active" : "Inactive"}</span></td>
                    <td>
                      <button type="button" className="text-button" disabled={busy === row.stageId} onClick={() => void save(row, { active: !row.active })}>{row.active ? "Deactivate" : "Activate"}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
