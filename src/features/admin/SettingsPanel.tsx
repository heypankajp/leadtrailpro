"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import ReleasesCard from "@/features/deploy/ReleasesCard";
import { stageChoices } from "@/features/pipeline/model";
import { AlertTriangle, ArrowDown, ArrowUp, Briefcase, BriefcaseBusiness, CalendarDays, Kanban, Mail, MapPinned, Plus, RefreshCw, Save, Send, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Field, Loading } from "@/features/shell/components";
import { maxFollowUpBusinessDays, maxHolidayNameLength, maxInactivityDays, maxInactivityRules, stageFollowUpActivities, type AppSettings, type InactivityRule, type StageFollowUp, type StageFollowUpActivity } from "@/features/settings/model";
import { activityTitles } from "@/features/pipeline/model";
import { defaultRoleLabels, systemRoles } from "@/features/users/model";
import { jobSourceLabels, maxCacheHours, maxPrefetch, type JobSourceId, type JobSourceStatus } from "@/features/jobs/model";
import { mapsSkuHints, mapsSkuIds, mapsSkuLabels, mapsSkuUnits, maxMapsBudget, type MapsOverview } from "@/features/maps/model";
import { maxMaxListings, maxPostedWithinDays, maxSearchTitles, minMaxListings, minPostedWithinDays, opportunitySourceIds } from "@/features/opportunities/model";
import { fetchSettings, updateSettings, type MailStatus } from "./client";
import { runDigestNow, runKpiReportNow } from "@/features/notifications/client";
import { weekdayNames, type DigestJob } from "@/features/notifications/model";
import { kpiReportKinds, kpiReportLabels, type KpiReportKind } from "@/features/reports/kpi-model";

export default function SettingsPanel() {
  const { notify, refreshReference, reference, bumpData } = useApp();
  const [sending, setSending] = useState<DigestJob | null>(null);
  const [sendingKpi, setSendingKpi] = useState<KpiReportKind | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [meta, setMeta] = useState<{ mailerConfigured: boolean; timeZone: string; mail: MailStatus; jobSources: JobSourceStatus[]; maps: MapsOverview | null }>({ mailerConfigured: false, timeZone: "", mail: { provider: "off", outbox: [], senders: [] }, jobSources: [], maps: null });
  const [openMail, setOpenMail] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayError, setHolidayError] = useState("");

  const load = useCallback(() => {
    fetchSettings().then((result) => { setSettings(result.settings); setMeta({ mailerConfigured: result.mailerConfigured, timeZone: result.timeZone, mail: result.mail, jobSources: result.jobSources ?? [], maps: result.maps ?? null }); }).catch((caught) => setError(errorMessage(caught)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    try {
      const result = await updateSettings({ roleLabels: settings.roleLabels, reminders: settings.reminders, digests: settings.digests, pipeline: settings.pipeline, jobSources: settings.jobSources, opportunities: settings.opportunities, email: settings.email, maps: settings.maps, holidays: settings.holidays });
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

  const sendKpiReport = async (kind: KpiReportKind) => {
    setSendingKpi(kind);
    try {
      const run = (await runKpiReportNow(kind)).ran[0];
      if (run?.recipients) notify(`${kpiReportLabels[kind]} KPI report sent${run.failures ? ` with ${run.failures} failure(s)` : ""}`);
      else notify(run?.failures ? "The KPI report could not be sent." : "Nothing was sent: choose a sending mailbox first.", "error");
      load();
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setSendingKpi(null);
    }
  };

  // TASK-05: needs-attention rules by status and BD action.
  const setRules = (rules: InactivityRule[]) => { if (settings) setSettings({ ...settings, reminders: { ...settings.reminders, rules } }); };
  const updateRule = (index: number, changes: Partial<InactivityRule>) => { if (settings) setRules(settings.reminders.rules.map((rule, position) => (position === index ? { ...rule, ...changes } : rule))); };
  // PIPE-09: the next step each stage suggests.
  const setFollowUp = (code: string, value: StageFollowUp | null) => {
    if (!settings) return;
    const followUps = { ...settings.pipeline.followUps };
    if (value) followUps[code] = value; else delete followUps[code];
    setSettings({ ...settings, pipeline: { ...settings.pipeline, followUps } });
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
              <Field label="Inactivity reminder after (days)" hint="Default: deals with no recorded activity for this long appear under Needs attention."><input type="number" min={1} max={90} value={settings.reminders.inactivityDays} onChange={(event) => setSettings({ ...settings, reminders: { ...settings.reminders, inactivityDays: Number(event.target.value) } })} required /></Field>
              <fieldset className="user-privileges rules-editor">
                <legend><AlertTriangle size={12} /> Needs-attention rules by status, BD action, or stage</legend>
                <p className="field-hint">Override the default for particular statuses, BD actions, or pipeline stages. The most specific rule wins: status and BD action together, then BD action, then status and stage, then stage, then status.</p>
                {settings.reminders.rules.length === 0 && <p className="field-hint">No rules yet: every deal uses the default above.</p>}
                {settings.reminders.rules.map((rule, index) => (
                  <div className="rule-row rule-row-stage" key={index}>
                    <select aria-label={`Rule ${index + 1} status`} value={rule.statusId ?? ""} onChange={(event) => updateRule(index, { statusId: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Any status</option>
                      {reference.listValues.status.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                    </select>
                    <select aria-label={`Rule ${index + 1} BD action`} value={rule.bdActionId ?? ""} onChange={(event) => updateRule(index, { bdActionId: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Any BD action</option>
                      {reference.listValues.bd_action.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                    </select>
                    <select aria-label={`Rule ${index + 1} stage`} value={rule.stageId ?? ""} onChange={(event) => updateRule(index, { stageId: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Any stage</option>
                      {stageChoices(reference.listValues.stage, reference.pipelines).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                    </select>
                    <span className="rule-days"><input aria-label={`Rule ${index + 1} days`} type="number" min={1} max={maxInactivityDays} value={rule.days} onChange={(event) => updateRule(index, { days: Number(event.target.value) })} required /> days</span>
                    <button type="button" className="icon-button" aria-label={`Remove rule ${index + 1}`} onClick={() => setRules(settings.reminders.rules.filter((_, position) => position !== index))}><X size={12} /></button>
                  </div>
                ))}
                {settings.reminders.rules.length < maxInactivityRules && (
                  <button type="button" className="button button-outline button-small" onClick={() => setRules([...settings.reminders.rules, { statusId: null, bdActionId: null, stageId: null, days: settings.reminders.inactivityDays }])}><Plus size={13} /> Add rule</button>
                )}
                <small className="field-hint">A rule needs a status, a BD action, a stage, or a combination. Rules apply when you save settings.</small>
              </fieldset>
              <fieldset className="user-privileges pipeline-editor">
                <legend><Kanban size={12} /> Pipeline next steps</legend>
                <p className="field-hint">The next step each stage suggests when a deal reaches it. The prompt after a logged call, email, or visit, a BD action, or a move on the board is pre-filled with it; due dates count business days from the business calendar.</p>
                {stageChoices(reference.listValues.stage, reference.pipelines).map((stage) => {
                  const item = settings.pipeline.followUps[stage.code];
                  return (
                    <div className="stage-step-row" key={stage.id}>
                      <span className="rule-label">{stage.value}</span>
                      <select aria-label={`${stage.value} next step`} value={item?.activity ?? ""} onChange={(event) => setFollowUp(stage.code, event.target.value ? { activity: event.target.value as StageFollowUpActivity, businessDays: item?.businessDays ?? 1 } : null)}>
                        <option value="">No suggestion</option>
                        {stageFollowUpActivities.map((activity) => <option key={activity} value={activity}>{activity === "task" ? "Task" : activityTitles[activity]}</option>)}
                      </select>
                      <span className="rule-days"><input aria-label={`${stage.value} business days`} type="number" min={0} max={maxFollowUpBusinessDays} value={item?.businessDays ?? 1} disabled={!item} onChange={(event) => item && setFollowUp(stage.code, { ...item, businessDays: Number(event.target.value) })} /> business days later</span>
                    </div>
                  );
                })}
                <label className="checklist-item"><input type="checkbox" checked={settings.pipeline.promptNextStep} onChange={(event) => setSettings({ ...settings, pipeline: { ...settings.pipeline, promptNextStep: event.target.checked } })} /><span>Ask for the next step after a logged call, email, or visit, a BD action, or a stage move</span></label>
                <label className="checklist-item"><input type="checkbox" checked={settings.pipeline.autoFollowUp} onChange={(event) => setSettings({ ...settings, pipeline: { ...settings.pipeline, autoFollowUp: event.target.checked } })} /><span>Create the stage&apos;s suggested task automatically when a deal reaches the stage, assigned to the owner, without asking</span></label>
              </fieldset>
              <fieldset className="user-privileges digest-editor">
                <legend><Send size={12} /> Summary emails</legend>
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
              <fieldset className="user-privileges digest-editor email-editor">
                <legend><Mail size={12} /> Email delivery</legend>
                <p className="field-hint">The app sends through the Google account chosen here: notifications, summary emails, and anything else it emails. People who have signed in with Google appear in the list. Report emails stay off until switched on.</p>
                <div className="rule-row">
                  <Field label="Send from" hint={meta.mail.senders.length ? "A user whose Google mailbox is connected." : "Nobody has signed in with Google yet."}>
                    <select value={settings.email.senderUserId ?? ""} onChange={(event) => setSettings({ ...settings, email: { ...settings.email, senderUserId: event.target.value ? Number(event.target.value) : null } })}>
                      <option value="">Not chosen (nothing is sent)</option>
                      {meta.mail.senders.map((sender) => <option key={sender.userId} value={sender.userId}>{sender.name} · {sender.email}</option>)}
                    </select>
                  </Field>
                </div>
                <label className="checklist-item"><input type="checkbox" checked={settings.email.reportEmails} onChange={(event) => setSettings({ ...settings, email: { ...settings.email, reportEmails: event.target.checked } })} /> Send report emails (the weekly stalled-leads report to administrators)</label>
                <div className="kpi-reports">
                  <span className="field-label">KPI reports to administrators</span>
                  <small className="field-hint">Where every Sales Manager&apos;s deals stand when the email is sent: how many, split by status, and what is waiting on the person (overdue follow-ups, stalled deals, client replies), with the totals and the pipeline by stage. Daily on business days at the daily digest time. The weekly report (on the digest day) and the monthly one (on the first of the month) add what was recorded last week or last month.</small>
                  {kpiReportKinds.map((kind) => (
                    <label key={kind} className="checklist-item"><input type="checkbox" checked={settings.email.kpiReports[kind]} onChange={(event) => setSettings({ ...settings, email: { ...settings.email, kpiReports: { ...settings.email.kpiReports, [kind]: event.target.checked } } })} /> {kpiReportLabels[kind]} KPI report</label>
                  ))}
                  <div className="digest-actions">
                    {kpiReportKinds.map((kind) => (
                      <button key={kind} type="button" className="button button-outline button-small" disabled={sendingKpi !== null} onClick={() => void sendKpiReport(kind)}><Send size={13} /> {sendingKpi === kind ? "Sending..." : `Send me the ${kind} KPI report`}</button>
                    ))}
                  </div>
                </div>
                <label className="checklist-item"><input type="checkbox" checked={settings.email.watchMailboxes} onChange={(event) => setSettings({ ...settings, email: { ...settings.email, watchMailboxes: event.target.checked } })} /> Watch connected mailboxes for client emails (every 5 minutes; stamps each deal with the last email from the client and tells the owner about new replies)</label>
              </fieldset>
              <fieldset className="user-privileges job-sources-editor">
                <legend><BriefcaseBusiness size={12} /> Job listing sources</legend>
                <p className="field-hint">The Hiring column of the Sales Trip Planner asks these sources in order, free tiers first, and stops at the first answer. Each source stays within its daily and monthly call budget; listings are cached per company. Keys are set in <code>.env.local</code>.</p>
                <div className="job-source-list">
                  {settings.jobSources.order.map((id, index) => {
                    const status = meta.jobSources.find((entry) => entry.id === id);
                    const budget = settings.jobSources.budgets[id];
                    const setBudget = (changes: Partial<typeof budget>) => setSettings({ ...settings, jobSources: { ...settings.jobSources, budgets: { ...settings.jobSources.budgets, [id]: { ...budget, ...changes } } } });
                    const move = (direction: -1 | 1) => {
                      const order = [...settings.jobSources.order] as JobSourceId[];
                      const target = index + direction;
                      if (target < 0 || target >= order.length) return;
                      [order[index], order[target]] = [order[target], order[index]];
                      setSettings({ ...settings, jobSources: { ...settings.jobSources, order } });
                    };
                    return (
                      <div className="job-source-row" key={id}>
                        <div className="job-source-name">
                          <label className="checklist-item"><input type="checkbox" aria-label={`${jobSourceLabels[id]} enabled`} checked={budget.enabled} onChange={(event) => setBudget({ enabled: event.target.checked })} /><strong>{jobSourceLabels[id]}</strong></label>
                          <small className={status?.note ? "job-source-note" : "job-source-ready"}>{status ? (status.note ?? "Ready") : "…"}</small>
                        </div>
                        <span className="rule-days"><input aria-label={`${jobSourceLabels[id]} daily budget`} type="number" min={0} value={budget.daily} onChange={(event) => setBudget({ daily: Number(event.target.value) })} /> / day</span>
                        <span className="rule-days"><input aria-label={`${jobSourceLabels[id]} monthly budget`} type="number" min={0} value={budget.monthly} onChange={(event) => setBudget({ monthly: Number(event.target.value) })} /> / month</span>
                        <small className="job-source-usage">{status ? `${status.usage.today} today · ${status.usage.month} this month${status.creditsPerCall ? ` · ${status.usage.month * status.creditsPerCall} credits` : ""}${status.usage.failuresToday ? ` · ${status.usage.failuresToday} failed today` : ""}${status.account ? ` · account: ${status.account.availableCredits.toLocaleString()} of ${status.account.totalCredits.toLocaleString()} credits left` : ""}` : ""}</small>
                        <span className="job-source-move">
                          <button type="button" className="icon-button" aria-label={`Move ${jobSourceLabels[id]} up`} disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={12} /></button>
                          <button type="button" className="icon-button" aria-label={`Move ${jobSourceLabels[id]} down`} disabled={index === settings.jobSources.order.length - 1} onClick={() => move(1)}><ArrowDown size={12} /></button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="digest-grid">
                  <Field label="Warn administrators at (%)" hint="Of a source's monthly call budget; a second alert goes out when it is spent."><input type="number" min={1} max={100} value={settings.jobSources.warnAtPercent} onChange={(event) => setSettings({ ...settings, jobSources: { ...settings.jobSources, warnAtPercent: Number(event.target.value) } })} /></Field>
                  <Field label="Keep listings for (hours)" hint={`1 to ${maxCacheHours}. A company is not asked about again within this time.`}><input type="number" min={1} max={maxCacheHours} value={settings.jobSources.cacheHours} onChange={(event) => setSettings({ ...settings, jobSources: { ...settings.jobSources, cacheHours: Number(event.target.value) } })} required /></Field>
                  <Field label="Companies checked per trip" hint={`0 to ${maxPrefetch}. The nearest ones are checked when a trip is created; the rest on demand.`}><input type="number" min={0} max={maxPrefetch} value={settings.jobSources.prefetch} onChange={(event) => setSettings({ ...settings, jobSources: { ...settings.jobSources, prefetch: Number(event.target.value) } })} required /></Field>
                </div>
              </fieldset>
              <fieldset className="user-privileges maps-usage-editor">
                <legend><MapPinned size={12} /> Google Maps usage</legend>
                <p className="field-hint">
                  The Sales Trip Planner&apos;s Google calls are counted per month and stop at these budgets, which default to 90% of Google&apos;s free allowance per SKU (Geocoding and Route matrix 10,000, Places text search 1,000 a month). The counters and the allowance start over on the 1st of each month{meta.maps ? ` (next reset ${formatDate(meta.maps.resetsOn)})` : ""}; administrators are notified at the warning level and when a budget is spent.
                  {meta.maps && (meta.maps.configured ? ` Key: ${meta.maps.keyVariable}${meta.maps.live ? "" : " (the sample provider is active, so no live call is made)"}.` : " No key yet: set MAPS_API_KEY in .env.local.")}
                </p>
                <div className="maps-usage-list">
                  {mapsSkuIds.map((id) => {
                    const status = meta.maps?.skus.find((entry) => entry.id === id);
                    const budget = settings.maps.budgets[id];
                    const percent = status?.percent ?? 0;
                    return (
                      <div className="maps-usage-row" key={id}>
                        <div className="job-source-name">
                          <strong>{mapsSkuLabels[id]}</strong>
                          <small className="field-hint">{mapsSkuHints[id]}</small>
                          <small className={status?.note ? "job-source-note" : "job-source-ready"}>{status ? (status.note ?? "Ready") : "…"}</small>
                        </div>
                        <span className="rule-days"><input aria-label={`${mapsSkuLabels[id]} monthly budget`} type="number" min={0} max={maxMapsBudget} value={budget} onChange={(event) => setSettings({ ...settings, maps: { ...settings.maps, budgets: { ...settings.maps.budgets, [id]: Number(event.target.value) } } })} /> / month</span>
                        <div className="maps-usage-meter">
                          <small className="job-source-usage">{status ? `${status.usage.month} of ${status.budget} ${mapsSkuUnits[id]} this month (${percent}%) · ${status.usage.today} today${status.usage.failuresToday ? ` · ${status.usage.failuresToday} failed today` : ""} · free allowance ${status.freeCap.toLocaleString()}` : ""}</small>
                          <div className="progress-track" role="progressbar" aria-label={`${mapsSkuLabels[id]} budget used`} aria-valuenow={Math.min(100, percent)} aria-valuemin={0} aria-valuemax={100}>
                            <i className={percent >= 100 ? "is-spent" : percent >= settings.maps.warnAtPercent ? "is-warn" : undefined} style={{ width: `${Math.min(100, percent)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="digest-grid">
                  <Field label="Warn administrators at (%)" hint="One in-app notification (and an email to those who opted in) per allowance and month at this level, and again when the budget is spent."><input type="number" min={1} max={100} value={settings.maps.warnAtPercent} onChange={(event) => setSettings({ ...settings, maps: { ...settings.maps, warnAtPercent: Number(event.target.value) } })} required /></Field>
                </div>
                <small className="field-hint">The surest guard is on Google&apos;s side: cap each API&apos;s requests per day in the Cloud console (APIs &amp; Services → Quotas &amp; System Limits) and set a Cloud Billing budget alert. The app&apos;s counters are a second line and can trail Google&apos;s by a little.</small>
              </fieldset>
              <fieldset className="user-privileges digest-editor opportunity-editor">
                <legend><Briefcase size={12} /> Lead searches</legend>
                <p className="field-hint">The keyword searches under Leads → Searches &amp; runs run on these days at this time (business time zone) and fill the leads inbox. Every enabled job source answers each search up to the listings cap, within the budgets above. Two or three runs a week keep the Indeed calls low.</p>
                <label className="checklist-item"><input type="checkbox" checked={settings.opportunities.enabled} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, enabled: event.target.checked } })} /> Run the searches on a schedule</label>
                <div className="weekday-picks">
                  {weekdayNames.map((name, day) => (
                    <label key={name} className="checklist-item">
                      <input type="checkbox" checked={settings.opportunities.days.includes(day)} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, days: event.target.checked ? [...settings.opportunities.days, day].sort((a, b) => a - b) : settings.opportunities.days.filter((item) => item !== day) } })} /> {name.slice(0, 3)}
                    </label>
                  ))}
                </div>
                <div className="rule-row">
                  <Field label="Run at"><input type="time" value={settings.opportunities.time} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, time: event.target.value } })} /></Field>
                  <Field label="Listings per search and source" hint={`${minMaxListings} to ${maxMaxListings}; a search can set its own cap.`}><input type="number" min={minMaxListings} max={maxMaxListings} value={settings.opportunities.maxListings} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, maxListings: Number(event.target.value) } })} /></Field>
                </div>
                <div className="rule-row">
                  <Field label="Default job titles" hint={`One per line, up to ${maxSearchTitles}. Pre-filled on a new search; a search sends its titles to Indeed as one query, so a group costs one call per page.`}><textarea rows={4} value={settings.opportunities.defaultTitles.join("\n")} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, defaultTitles: event.target.value.split("\n") } })} /></Field>
                  <Field label="Default location" hint="One city, region, or province per search, for example Ontario."><input value={settings.opportunities.defaultLocation} maxLength={160} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, defaultLocation: event.target.value } })} /></Field>
                  <Field label="Posted within (days)" hint={`${minPostedWithinDays} to ${maxPostedWithinDays}; how far back each search looks. Indeed via HasData looks back at most 14 days.`}><input type="number" min={minPostedWithinDays} max={maxPostedWithinDays} value={settings.opportunities.postedWithinDays} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, postedWithinDays: Number(event.target.value) } })} /></Field>
                </div>
                <div className="weekday-picks" aria-label="Job sources for the searches">
                  {opportunitySourceIds.map((id) => (
                    <label key={id} className="checklist-item">
                      <input type="checkbox" checked={settings.opportunities.sources.includes(id)} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, sources: event.target.checked ? [...settings.opportunities.sources, id] : settings.opportunities.sources.filter((item) => item !== id) } })} /> {jobSourceLabels[id]}
                    </label>
                  ))}
                </div>
                <small className="field-hint">Which job sources answer the searches (Indeed through HasData by default; the sample source only exists on a stack running the sample provider). Each source must also be enabled above.</small>
                <label className="checklist-item"><input type="checkbox" checked={settings.opportunities.notify} onChange={(event) => setSettings({ ...settings, opportunities: { ...settings.opportunities, notify: event.target.checked } })} /> Tell salespeople when a run adds new companies to the pool</label>
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
          <ReleasesCard />
          <section className="panel settings-panel">
            <div className="panel-heading"><div><h2>Email log</h2><p>What the app sent, or recorded in stub mode.</p></div><button type="button" className="text-button" onClick={load}><RefreshCw size={13} /> Refresh</button></div>
            <div className={`form-note ${meta.mailerConfigured ? "" : "note-warning"}`}><Mail size={14} /> {
              meta.mail.provider === "gmail" ? (settings.email.senderUserId ? `Sending through Gmail from ${meta.mail.senders.find((sender) => sender.userId === settings.email.senderUserId)?.email ?? "the chosen mailbox"}.` : "Gmail delivery: choose a sending mailbox above and save settings; until then nothing is sent.")
                : meta.mail.provider === "stub" ? "Stub mode (MAIL_PROVIDER=stub): nothing is sent; every message is recorded below so it can be checked."
                : meta.mail.provider === "smtp" ? "SMTP is configured (legacy); deliveries are listed below."
                : "Email is not configured. Set MAIL_PROVIDER=gmail with the Google OAuth client (or MAIL_PROVIDER=stub to record messages without sending) and restart the app."}</div>
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
