"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarDays, Mail, Plus, RefreshCw, Save, Send, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Field, Loading } from "@/features/shell/components";
import { maxHolidayNameLength, maxInactivityDays, maxInactivityRules, type AppSettings, type InactivityRule } from "@/features/settings/model";
import { defaultRoleLabels, systemRoles } from "@/features/users/model";
import { fetchSettings, updateSettings, type MailStatus } from "./client";
import { runDigestNow } from "@/features/notifications/client";
import { weekdayNames, type DigestJob } from "@/features/notifications/model";

export default function SettingsPanel() {
  const { notify, refreshReference, reference, bumpData } = useApp();
  const [sending, setSending] = useState<DigestJob | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [meta, setMeta] = useState<{ mailerConfigured: boolean; timeZone: string; mail: MailStatus }>({ mailerConfigured: false, timeZone: "", mail: { provider: "off", outbox: [] } });
  const [openMail, setOpenMail] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayError, setHolidayError] = useState("");

  const load = useCallback(() => {
    fetchSettings().then((result) => { setSettings(result.settings); setMeta({ mailerConfigured: result.mailerConfigured, timeZone: result.timeZone, mail: result.mail }); }).catch((caught) => setError(errorMessage(caught)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    try {
      const result = await updateSettings({ roleLabels: settings.roleLabels, reminders: settings.reminders, digests: settings.digests, holidays: settings.holidays });
      setSettings(result.settings);
      await refreshReference();
      notify("Settings saved");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  };

  const addHoliday = () => {
    if (!settings) return;
    const date = holidayDate.trim();
    const name = holidayName.trim();
    if (!date) { setHolidayError("Choose the holiday date."); return; }
    if (!name) { setHolidayError("Enter a name for the holiday."); return; }
    const holidays = [...settings.holidays.filter((holiday) => holiday.date !== date), { date, name }].sort((a, b) => a.date.localeCompare(b.date));
    setSettings({ ...settings, holidays });
    setHolidayDate("");
    setHolidayName("");
    setHolidayError("");
  };

  const removeHoliday = (date: string) => {
    if (settings) setSettings({ ...settings, holidays: settings.holidays.filter((holiday) => holiday.date !== date) });
  };

  // TASK-06: send a digest to yourself right away (also records the run and the outbox entry).
  const sendDigest = async (job: DigestJob) => {
    setSending(job);
    try {
      const result = await runDigestNow(job);
      const run = result.ran[0];
      notify(run ? `${job === "daily" ? "Daily" : "Weekly"} digest sent${run.failures ? ` with ${run.failures} failure(s)` : ""}` : "Nothing was sent", run && !run.failures ? "success" : "error");
      bumpData();
      load();
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setSending(null);
    }
  };

  // TASK-05: needs-attention rules by status and BD action.
  const setRules = (rules: InactivityRule[]) => { if (settings) setSettings({ ...settings, reminders: { ...settings.reminders, rules } }); };
  const updateRule = (index: number, changes: Partial<InactivityRule>) => { if (settings) setRules(settings.reminders.rules.map((rule, position) => (position === index ? { ...rule, ...changes } : rule))); };

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Settings</h1><p>Role display names, reminder rules, the business calendar, and email delivery status.</p></div></div>
      <ErrorText message={error} />
      {!settings && !error && <Loading />}
      {settings && (
        <div className="settings-layout">
          <form className="panel settings-panel" onSubmit={submit}>
            <div className="panel-heading"><div><h2>Role display names</h2><p>Rename how each system role appears. Permissions do not change.</p></div></div>
            <div className="lead-form settings-form">
              {systemRoles.map((role) => (
                <Field key={role} label={`${defaultRoleLabels[role]} is shown as`}><input value={settings.roleLabels[role]} onChange={(event) => setSettings({ ...settings, roleLabels: { ...settings.roleLabels, [role]: event.target.value } })} maxLength={40} required /></Field>
              ))}
              <Field label="Inactivity reminder after (days)" hint="Default: leads with no recorded activity for this long appear under Needs attention."><input type="number" min={1} max={90} value={settings.reminders.inactivityDays} onChange={(event) => setSettings({ ...settings, reminders: { ...settings.reminders, inactivityDays: Number(event.target.value) } })} required /></Field>
              <fieldset className="user-privileges rules-editor">
                <legend><AlertTriangle size={12} /> Needs-attention rules by status and BD action</legend>
                <p className="field-hint">Override the default for particular statuses or BD actions. The most specific rule wins: status and BD action together, then BD action, then status.</p>
                {settings.reminders.rules.length === 0 && <p className="field-hint">No rules yet: every lead uses the default above.</p>}
                {settings.reminders.rules.map((rule, index) => (
                  <div className="rule-row" key={index}>
                    <select aria-label={`Rule ${index + 1} status`} value={rule.statusId ?? ""} onChange={(event) => updateRule(index, { statusId: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Any status</option>
                      {reference.listValues.status.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                    </select>
                    <select aria-label={`Rule ${index + 1} BD action`} value={rule.bdActionId ?? ""} onChange={(event) => updateRule(index, { bdActionId: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Any BD action</option>
                      {reference.listValues.bd_action.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                    </select>
                    <span className="rule-days"><input aria-label={`Rule ${index + 1} days`} type="number" min={1} max={maxInactivityDays} value={rule.days} onChange={(event) => updateRule(index, { days: Number(event.target.value) })} required /> days</span>
                    <button type="button" className="icon-button" aria-label={`Remove rule ${index + 1}`} onClick={() => setRules(settings.reminders.rules.filter((_, position) => position !== index))}><X size={12} /></button>
                  </div>
                ))}
                {settings.reminders.rules.length < maxInactivityRules && (
                  <button type="button" className="button button-outline button-small" onClick={() => setRules([...settings.reminders.rules, { statusId: null, bdActionId: null, days: settings.reminders.inactivityDays }])}><Plus size={13} /> Add rule</button>
                )}
                <small className="field-hint">A rule needs a status, a BD action, or both. Rules apply when you save settings.</small>
              </fieldset>
              <fieldset className="user-privileges digest-editor">
                <legend><Send size={12} /> Daily and weekly digests</legend>
                <p className="field-hint">Each person gets a summary of overdue and upcoming follow-ups, tasks, and their numbers, as an in-app notification and by email when delivery is configured. People can opt out under Notification preferences. Times are in the business timezone.</p>
                <label className="checklist-item"><input type="checkbox" checked={settings.digests.enabled} onChange={(event) => setSettings({ ...settings, digests: { ...settings.digests, enabled: event.target.checked } })} /><span>Send digests on schedule</span></label>
                <div className="rule-row">
                  <Field label="Daily digest at"><input type="time" value={settings.digests.dailyTime} onChange={(event) => setSettings({ ...settings, digests: { ...settings.digests, dailyTime: event.target.value } })} required /></Field>
                  <Field label="Weekly digest on"><select value={settings.digests.weeklyDay} onChange={(event) => setSettings({ ...settings, digests: { ...settings.digests, weeklyDay: Number(event.target.value) } })}>{weekdayNames.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></Field>
                  <Field label="Weekly digest at"><input type="time" value={settings.digests.weeklyTime} onChange={(event) => setSettings({ ...settings, digests: { ...settings.digests, weeklyTime: event.target.value } })} required /></Field>
                </div>
                <div className="digest-actions">
                  <button type="button" className="button button-outline button-small" disabled={sending !== null} onClick={() => void sendDigest("daily")}><Send size={13} /> {sending === "daily" ? "Sending..." : "Send me today's digest"}</button>
                  <button type="button" className="button button-outline button-small" disabled={sending !== null} onClick={() => void sendDigest("weekly")}><Send size={13} /> {sending === "weekly" ? "Sending..." : "Send me the weekly digest"}</button>
                </div>
                <small className="field-hint">The schedule applies when you save settings; the buttons send at once.</small>
              </fieldset>
              <fieldset className="user-privileges holiday-editor">
                <legend><CalendarDays size={12} /> Business calendar · public holidays</legend>
                <p className="field-hint">Non-working days besides weekends. Reports treat &ldquo;yesterday&rdquo; as the last working day, and due dates typed in words (&ldquo;in two weeks&rdquo;, &ldquo;January&rdquo;) skip these dates.</p>
                {settings.holidays.length === 0 ? <p className="field-hint">No holidays listed yet.</p> : (
                  <ul className="holiday-list">
                    {settings.holidays.map((holiday) => (
                      <li className="holiday-row" key={holiday.date}>
                        <strong>{formatDate(holiday.date)}</strong>
                        <span>{holiday.name}</span>
                        <button type="button" aria-label={`Remove ${holiday.name}`} onClick={() => removeHoliday(holiday.date)}><X size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="holiday-add">
                  <Field label="Holiday date"><input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} /></Field>
                  <Field label="Holiday name"><input value={holidayName} maxLength={maxHolidayNameLength} placeholder="Canada Day" onChange={(event) => setHolidayName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addHoliday(); } }} /></Field>
                  <button type="button" className="button button-outline button-small" onClick={addHoliday}><Plus size={13} /> Add holiday</button>
                </div>
                <ErrorText message={holidayError} />
                <small className="field-hint">Additions and removals apply when you save settings.</small>
              </fieldset>
              <div className="modal-actions"><button className="button button-primary" type="submit" disabled={busy}><Save size={15} /> {busy ? "Saving..." : "Save settings"}</button></div>
            </div>
          </form>
          <section className="panel settings-panel">
            <div className="panel-heading"><div><h2>Email delivery</h2><p>Used for password reset links and two-factor codes.</p></div><button type="button" className="text-button" onClick={load}><RefreshCw size={13} /> Refresh</button></div>
            <div className={`form-note ${meta.mailerConfigured ? "" : "note-warning"}`}><Mail size={14} /> {
              meta.mail.provider === "stub" ? "Stub mode (MAIL_PROVIDER=stub): nothing is sent. Reset links and sign-in codes are recorded in the outbox below so they can be tested. Switch to MAIL_PROVIDER=smtp once the Google Workspace mailbox is ready."
                : meta.mail.provider === "smtp" ? "SMTP is configured. Password resets and two-factor codes are emailed; deliveries are listed below."
                : "Email is not configured. Add the SMTP_* settings to .env.local (or MAIL_PROVIDER=stub to record messages without sending) and restart the app. Until then, administrators set passwords directly and two-factor cannot be enabled."}</div>
            {meta.mail.outbox.length > 0 && (
              <div className="table-scroll">
                <table className="lead-table outbox-table">
                  <thead><tr><th>WHEN</th><th>TO</th><th>SUBJECT</th><th>STATUS</th><th><span className="sr-only">Message</span></th></tr></thead>
                  <tbody>
                    {meta.mail.outbox.map((entry) => (
                      <tr key={entry.id} className={openMail === entry.id ? "row-open" : ""}>
                        <td><span className="muted-cell">{formatDateTime(entry.createdAt)}</span></td>
                        <td>{entry.to}</td>
                        <td><strong>{entry.subject}</strong>{openMail === entry.id && entry.text && <pre className="outbox-body">{entry.text}</pre>}{entry.error && <small className="muted-cell">{entry.error}</small>}</td>
                        <td><span className={`badge ${entry.status === "failed" ? "badge-off" : "badge-on"}`}>{entry.status}</span></td>
                        <td>{entry.text && <button type="button" className="text-button" aria-label={`${openMail === entry.id ? "Hide" : "Show"} message to ${entry.to}`} onClick={() => setOpenMail(openMail === entry.id ? null : entry.id)}>{openMail === entry.id ? "Hide" : "Show"}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel-heading"><div><h2>Business timezone</h2><p>Follow-up days, weekly targets, and each account&apos;s daily sign-out time use this zone.</p></div></div>
            <div className="form-note">{meta.timeZone} · change with BUSINESS_TIMEZONE in .env.local</div>
          </section>
        </div>
      )}
    </>
  );
}
