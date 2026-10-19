"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Mail, Plus, Save, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Field, Loading } from "@/features/shell/components";
import { maxHolidayNameLength, type AppSettings } from "@/features/settings/model";
import { defaultRoleLabels, systemRoles } from "@/features/users/model";
import { fetchSettings, updateSettings } from "./client";

export default function SettingsPanel() {
  const { notify, refreshReference } = useApp();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [meta, setMeta] = useState({ mailerConfigured: false, timeZone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayError, setHolidayError] = useState("");

  useEffect(() => {
    fetchSettings().then((result) => { setSettings(result.settings); setMeta({ mailerConfigured: result.mailerConfigured, timeZone: result.timeZone }); }).catch((caught) => setError(errorMessage(caught)));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    try {
      const result = await updateSettings({ roleLabels: settings.roleLabels, reminders: settings.reminders, holidays: settings.holidays });
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
              <Field label="Inactivity reminder after (days)" hint="Leads with no recorded activity for this long appear under Needs attention."><input type="number" min={1} max={90} value={settings.reminders.inactivityDays} onChange={(event) => setSettings({ ...settings, reminders: { inactivityDays: Number(event.target.value) } })} required /></Field>
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
            <div className="panel-heading"><div><h2>Email delivery</h2><p>Used for password reset links and two-factor codes.</p></div></div>
            <div className={`form-note ${meta.mailerConfigured ? "" : "note-warning"}`}><Mail size={14} /> {meta.mailerConfigured ? "SMTP is configured. Password resets and two-factor codes will be emailed." : "SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM to .env.local and restart the app. Until then, administrators set passwords directly and two-factor cannot be enabled."}</div>
            <div className="panel-heading"><div><h2>Business timezone</h2><p>Follow-up days, weekly targets, and each account&apos;s daily sign-out time use this zone.</p></div></div>
            <div className="form-note">{meta.timeZone} · change with BUSINESS_TIMEZONE in .env.local</div>
          </section>
        </div>
      )}
    </>
  );
}
