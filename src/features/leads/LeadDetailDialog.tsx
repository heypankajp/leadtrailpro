"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive, ArrowLeft, CalendarCheck2, Check, Download, ExternalLink, FileText, History, Mail, MapPin, MessageSquare, Paperclip, Pencil, Phone, Plus, RotateCcw, Trash2, UserRound, Users,
} from "lucide-react";
import mammoth from "mammoth";
import { errorMessage } from "@/lib/api";
import { fileSize, formatDate, formatDateTime, formatTimeOfDay, fromLocalInput, relativeTime, toLocalInput } from "@/lib/format";
import { suggestFollowUp } from "@/lib/natural-dates";
import { useAsyncData } from "@/lib/useAsyncData";
import { documentLabels, previewableMimeTypes, type LeadAttachment } from "@/features/attachments/model";
import LeadEmails from "@/features/gmail/LeadEmails";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, Dialog, EmptyState, ErrorText, Field, KeyValue, Loading, PromptDialog, StatusPill, Tabs } from "@/features/shell/components";
import { createTask, updateTask } from "@/features/tasks/client";
import NaturalDateField from "@/features/tasks/NaturalDateField";
import TaskFormDialog from "@/features/tasks/TaskFormDialog";
import type { Task } from "@/features/tasks/model";
import UserDirectoryDialog from "@/features/users/UserDirectoryDialog";
import type { UserSummary } from "@/features/users/model";
import { attachmentUrl, fetchLead, logActivity, removeAttachment, reviewLead, setLeadState, transferLead, updateLead, uploadAttachment, type LeadDetail } from "./client";
import LeadFormDialog from "./LeadFormDialog";
import { activityLabels, type LeadActivity, type LoggableActivityType } from "./model";

type Tab = "overview" | "timeline" | "emails" | "files" | "profiles" | "tasks" | "history";

const activityIcon = (type: LeadActivity["type"]) => {
  switch (type) {
    case "call": return <Phone size={13} />;
    case "email": return <Mail size={13} />;
    case "visit": return <MapPin size={13} />;
    case "note": return <MessageSquare size={13} />;
    case "task": return <CalendarCheck2 size={13} />;
    case "file": return <Paperclip size={13} />;
    case "transfer": return <Users size={13} />;
    default: return <History size={13} />;
  }
};

export default function LeadDetailDialog({ leadId, onClose }: { leadId: number; onClose: () => void }) {
  const { user, can, reference, notify, bumpData } = useApp();
  const fetcher = useCallback(() => fetchLead(leadId), [leadId]);
  const { data: detail, error, reload } = useAsyncData<LeadDetail>(fetcher);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "transfer-pick" } | { kind: "transfer-reason"; user: UserSummary } | { kind: "archive" } | { kind: "restore" } | { kind: "review"; approve: boolean } | { kind: "task"; task?: Task }
    | null
  >(null);

  const refresh = async (message?: string) => {
    reload();
    bumpData();
    if (message) notify(message);
  };

  if (error && !detail) {
    return <Dialog title="Lead" onClose={onClose} size="narrow"><ErrorText message={error} /></Dialog>;
  }
  if (!detail) return <Dialog title="Loading lead..." onClose={onClose} size="wide"><Loading /></Dialog>;

  const { lead, permissions } = detail;
  const canEdit = permissions.edit;
  const canTransfer = can("reassign_leads") || (can("transfer_leads") && lead.ownerId === user.id);
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const documents = detail.attachments.filter((file) => file.category === "document");
  const profiles = detail.attachments.filter((file) => file.category === "profile");

  const changeStatus = async (statusId: number) => {
    try {
      await updateLead(lead.id, { statusId });
      await refresh("Status updated");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const quickUpdate = async (changes: Parameters<typeof updateLead>[1], message: string) => {
    try {
      await updateLead(lead.id, changes);
      await refresh(message);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const headerActions = (
    <>
      {canEdit && lead.recordState !== "archived" && <button className="button button-outline button-small" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}
      {canTransfer && lead.recordState === "active" && <button className="button button-outline button-small" onClick={() => setDialog({ kind: "transfer-pick" })}><UserRound size={14} /> Transfer</button>}
      {can("review_queued") && lead.recordState === "queued" && (
        <>
          <button className="button button-primary button-small" onClick={() => setDialog({ kind: "review", approve: true })}><Check size={14} /> Approve</button>
          <button className="button button-outline button-small" onClick={() => setDialog({ kind: "review", approve: false })}>Reject</button>
        </>
      )}
      {can("archive_leads") && lead.recordState === "active" && <button className="button button-outline button-small" onClick={() => setDialog({ kind: "archive" })}><Archive size={14} /> Archive</button>}
      {can("archive_leads") && lead.recordState === "archived" && <button className="button button-outline button-small" onClick={() => setDialog({ kind: "restore" })}><RotateCcw size={14} /> Restore</button>}
    </>
  );

  return (
    <>
      <Dialog
        onClose={onClose}
        size="wide"
        eyebrow={lead.recordState === "queued" ? "QUEUED FOR APPROVAL" : lead.recordState === "archived" ? "ARCHIVED LEAD" : "LEAD OVERVIEW"}
        title={
          <span className="lead-title">
            {lead.companyUrl
              ? <a className="company-link-icon" href={lead.companyUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${lead.clientName} website`} title="Open company website"><ExternalLink size={14} /></a>
              : null}
            {lead.clientName}
          </span>
        }
      >
        <div className="detail-summary">
          <Avatar name={lead.clientName} seed={lead.id} />
          <div>
            {canEdit && lead.recordState !== "archived" ? (
              <label className={`status-pill status-${lead.statusCode} status-select-pill`}>
                <i />
                <select aria-label="Update lead status" value={lead.statusId} onChange={(event) => void changeStatus(Number(event.target.value))}>
                  {reference.listValues.status.map((status) => <option key={status.id} value={status.id}>{status.value}</option>)}
                </select>
              </label>
            ) : <StatusPill status={lead.status} code={lead.statusCode} />}
            <p>{lead.leadType}{lead.industry ? ` · ${lead.industry}` : ""}{lead.city ? ` · ${lead.city}` : ""}</p>
          </div>
          <div className="detail-owner"><small>OWNER</small><strong>{lead.ownerName}</strong></div>
          <div className="detail-header-actions">{headerActions}</div>
        </div>
        {lead.stateReason && <div className="form-note state-note"><History size={14} /> {lead.stateReason}</div>}

        <Tabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "timeline", label: "Timeline", count: detail.activities.length },
            { id: "emails", label: "Emails" },
            { id: "files", label: "Documents", count: documents.length },
            { id: "profiles", label: "Profiles shared", count: profiles.length },
            { id: "tasks", label: "Tasks", count: detail.tasks.filter((task) => task.status === "open").length },
            ...(detail.audit.length ? [{ id: "history" as const, label: "Audit", count: detail.audit.length }] : []),
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "overview" && (
          <OverviewTab detail={detail} canEdit={canEdit} onQuickUpdate={quickUpdate} onScheduleFollowUp={async (date, time, note) => {
            await updateLead(lead.id, { followUpDate: date });
            await createTask({ leadId: lead.id, title: `Follow up with ${lead.clientExecutive || lead.clientName}`, description: note, assigneeId: lead.ownerId, dueAt: fromLocalInput(`${date}T${time}`), priority: "normal", checklist: [] });
            await refresh("Follow-up scheduled and added to tasks");
          }} />
        )}
        {tab === "timeline" && <TimelineTab detail={detail} onLogged={(message) => refresh(message ?? "Activity recorded")} />}
        {tab === "emails" && <LeadEmails leadId={lead.id} addresses={lead.clientEmails} />}
        {(tab === "files" || tab === "profiles") && (
          <FilesTab key={tab} category={tab === "files" ? "document" : "profile"} files={tab === "files" ? documents : profiles} leadId={lead.id} onChanged={(message) => refresh(message)} />
        )}
        {tab === "tasks" && (
          <div className="detail-tasks">
            {can("manage_tasks") && <div className="section-actions"><button className="button button-outline button-small" onClick={() => setDialog({ kind: "task" })}><Plus size={14} /> Create task</button></div>}
            {detail.tasks.length === 0 ? <EmptyState icon={<CalendarCheck2 size={22} />} title="No tasks for this lead yet" /> : detail.tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <button className={`task-checkbox ${task.status === "done" ? "is-done" : ""}`} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={!can("manage_tasks")} onClick={async () => { try { await updateTask(task.id, { status: task.status === "done" ? "open" : "done" }); await refresh(task.status === "done" ? "Task reopened" : "Task completed"); } catch (caught) { notify(errorMessage(caught), "error"); } }}><Check size={13} /></button>
                <div className="task-card-content">
                  <strong className={task.status === "done" ? "is-done" : ""}>{task.title}</strong>
                  <small>{task.assigneeName} · {task.dueAt ? formatDateTime(task.dueAt) : "No due date"}{task.checklist.length ? ` · ${task.checklist.filter((item) => item.done).length}/${task.checklist.length} checklist` : ""}</small>
                  <span className={`priority priority-${task.priority}`}>{task.priority} priority</span>
                </div>
                {can("manage_tasks") && <button className="row-more" aria-label={`Edit ${task.title}`} onClick={() => setDialog({ kind: "task", task })}><Pencil size={15} /></button>}
              </article>
            ))}
          </div>
        )}
        {tab === "history" && (
          <div className="audit-list">
            {detail.audit.map((entry) => (
              <article className="audit-entry" key={entry.id}>
                <div className="audit-meta"><strong>{entry.action.replace(/^lead\./, "").replaceAll("_", " ")}</strong><small>{entry.actorName ?? "System"} · {formatDateTime(entry.createdAt)}</small></div>
                {entry.details && <p>{entry.details}</p>}
                {entry.after && Object.keys(entry.after).length > 0 && (
                  <dl className="audit-diff">
                    {Object.keys(entry.after).map((key) => (
                      <div key={key}><dt>{key}</dt><dd>{entry.before && key in entry.before ? <><s>{String(entry.before[key] ?? "—")}</s> → </> : null}{String(entry.after?.[key] ?? "—")}</dd></div>
                    ))}
                  </dl>
                )}
              </article>
            ))}
          </div>
        )}
      </Dialog>

      {editing && <LeadFormDialog lead={lead} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh("Lead updated"); }} />}
      {dialog?.kind === "transfer-pick" && (
        <UserDirectoryDialog title="Transfer lead" description={`Choose who will own ${lead.clientName}. Open tasks on this lead move with it.`} users={owners} excludeIds={[lead.ownerId]} confirmLabel="Transfer" onClose={() => setDialog(null)} onPick={(picked) => setDialog({ kind: "transfer-reason", user: picked })} />
      )}
      {dialog?.kind === "transfer-reason" && (
        <PromptDialog title={`Transfer to ${dialog.user.name}`} eyebrow="OWNERSHIP" label="Reason (optional)" confirmLabel="Transfer lead" onClose={() => setDialog(null)} onConfirm={async (reason) => { await transferLead(lead.id, dialog.user.id, reason); setDialog(null); await refresh(`${lead.clientName} transferred to ${dialog.user.name}`); }} />
      )}
      {dialog?.kind === "archive" && (
        <PromptDialog title={`Archive ${lead.clientName}`} eyebrow="ARCHIVE" label="Reason (optional)" confirmLabel="Archive lead" onClose={() => setDialog(null)} onConfirm={async (reason) => { await setLeadState(lead.id, "archived", reason); setDialog(null); await refresh("Lead archived"); }} />
      )}
      {dialog?.kind === "restore" && (
        <PromptDialog title={`Restore ${lead.clientName}`} eyebrow="ARCHIVE" label="Note (optional)" confirmLabel="Restore lead" onClose={() => setDialog(null)} onConfirm={async (reason) => { await setLeadState(lead.id, "active", reason); setDialog(null); await refresh("Lead restored"); }} />
      )}
      {dialog?.kind === "review" && (
        <PromptDialog title={dialog.approve ? `Approve ${lead.clientName}` : `Reject ${lead.clientName}`} eyebrow="QUEUED LEAD" label={dialog.approve ? "Comment (optional)" : "Reason"} required={!dialog.approve} danger={!dialog.approve} confirmLabel={dialog.approve ? "Approve" : "Reject"} onClose={() => setDialog(null)} onConfirm={async (comment) => { await reviewLead(lead.id, dialog.approve, comment); setDialog(null); await refresh(dialog.approve ? "Lead approved" : "Lead rejected"); }} />
      )}
      {dialog?.kind === "task" && (
        <TaskFormDialog task={dialog.task} leadId={lead.id} leadName={lead.clientName} defaultAssigneeId={lead.ownerId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void refresh(dialog.task ? "Task updated" : "Task created"); }} />
      )}
    </>
  );
}

function OverviewTab({ detail, canEdit, onQuickUpdate, onScheduleFollowUp }: {
  detail: LeadDetail; canEdit: boolean;
  onQuickUpdate: (changes: { bdActionId?: number | null; clientResponseId?: number | null }, message: string) => Promise<void>;
  onScheduleFollowUp: (date: string, time: string, note: string) => Promise<void>;
}) {
  const { reference, can } = useApp();
  const { lead } = detail;
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState(lead.followUpDate ?? reference.today);
  const [time, setTime] = useState("09:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const overdue = Boolean(lead.followUpDate && lead.followUpDate < reference.today && lead.recordState === "active");

  const schedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onScheduleFollowUp(date, time, note); setScheduling(false); setNote(""); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="detail-grid">
        <KeyValue label="CLIENT EXECUTIVE"><strong className="client-executive-name">{lead.clientExecutive || "Not provided"}</strong></KeyValue>
        <KeyValue label="CLIENT EMAIL">{lead.clientEmails.length ? <span className="email-list">{lead.clientEmails.map((email) => <a key={email} href={`mailto:${email}`}>{email}</a>)}</span> : <strong className="detail-missing">Not provided</strong>}</KeyValue>
        <KeyValue label="CONTACT NUMBER">{lead.contactPhone ? <a href={`tel:${lead.contactPhone}`}>{lead.contactPhone}</a> : <strong className="detail-missing">Not provided</strong>}</KeyValue>
        <KeyValue label="EXT. / ALTERNATE">{lead.contactAltPhone ? <a href={`tel:${lead.contactAltPhone}`}>{lead.contactAltPhone}</a> : <strong className="detail-missing">Not provided</strong>}</KeyValue>
        <div>
          <small>BD ACTION</small>
          {canEdit ? (
            <select className="inline-select" aria-label="BD action" value={lead.bdActionId ?? ""} onChange={(event) => void onQuickUpdate({ bdActionId: event.target.value ? Number(event.target.value) : null }, "BD action updated")}>
              <option value="">Not set</option>
              {reference.listValues.bd_action.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          ) : <strong>{lead.bdAction ?? "Not set"}</strong>}
        </div>
        <div>
          <small>CLIENT RESPONSE</small>
          {canEdit ? (
            <select className="inline-select" aria-label="Client response" value={lead.clientResponseId ?? ""} onChange={(event) => void onQuickUpdate({ clientResponseId: event.target.value ? Number(event.target.value) : null }, "Client response updated")}>
              <option value="">Not set</option>
              {reference.listValues.client_response.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          ) : <strong>{lead.clientResponse ?? "Not set"}</strong>}
        </div>
        <KeyValue label="NEXT FOLLOW-UP"><strong className={overdue ? "overdue" : lead.followUpDate === reference.today ? "due-today" : ""}>{formatDate(lead.followUpDate)}{overdue ? " · overdue" : ""}</strong></KeyValue>
        <KeyValue label="FIRST CONTACT">{formatDate(lead.firstContactDate)}</KeyValue>
        <KeyValue label="CONTRACT SIGNED">{formatDate(lead.contractSignedDate, "Not signed")}</KeyValue>
        <KeyValue label="LEAD CATEGORY">{lead.leadCategory ?? "Not set"}</KeyValue>
        <KeyValue label="COMPANY SIZE">{lead.companySize ?? "Not set"}</KeyValue>
        <KeyValue label="ADDRESS">{lead.address || "Not provided"}</KeyValue>
        <KeyValue label="CONTACT REMARK">{lead.contactRemark || "—"}</KeyValue>
        <KeyValue label="CREATED">{`${formatDateTime(lead.createdAt)} by ${lead.createdByName}`}</KeyValue>
        {lead.positions && <div className="field-wide"><small>POSITIONS</small><p className="detail-text">{lead.positions}</p></div>}
        {lead.comments && <div className="field-wide"><small>COMMENTS</small><p className="detail-text">{lead.comments}</p></div>}
      </div>
      {canEdit && can("manage_tasks") && lead.recordState === "active" && (
        scheduling ? (
          <form className="lead-form follow-up-form" onSubmit={schedule}>
            <p className="follow-up-intro field-wide">Set the next step for <strong>{lead.clientName}</strong>. The reminder goes to the owner&apos;s task list.</p>
            <NaturalDateField label="Type the follow-up date" placeholder="next Tuesday at 2pm, in a week, end of month..." onResolve={(result, resolvedTime) => { setDate(result.date); setTime(resolvedTime); }} />
            <Field label="Follow-up date" required><input type="date" value={date} min={reference.today} onChange={(event) => setDate(event.target.value)} required autoFocus /></Field>
            <Field label="Follow-up time" required><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></Field>
            <Field label="What needs to happen?" wide><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Call back about the revised proposal..." /></Field>
            <ErrorText message={error} />
            <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setScheduling(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><CalendarCheck2 size={15} /> {busy ? "Scheduling..." : "Schedule follow-up"}</button></div>
          </form>
        ) : (
          <div className="section-actions"><button className="button button-primary button-small" onClick={() => setScheduling(true)}><CalendarCheck2 size={14} /> Schedule follow-up</button></div>
        )
      )}
    </>
  );
}

type FollowUpDraft = { key: string; enabled: boolean; title: string; date: string; time: string };

function TimelineTab({ detail, onLogged }: { detail: LeadDetail; onLogged: (message?: string) => Promise<void> }) {
  const { can, reference } = useApp();
  const { lead } = detail;
  const [type, setType] = useState<LoggableActivityType | null>(null);
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date().toISOString()));
  const [taskDraft, setTaskDraft] = useState<FollowUpDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canLog = can("log_activities") && lead.recordState === "active";
  const canNote = can("add_notes") && lead.recordState !== "archived";
  const canSuggest = can("manage_tasks") && lead.recordState === "active";

  // NOTE-05: a follow-up instruction with a date in the note offers a task; relative periods count from the interaction date.
  const suggestion = useMemo(() => {
    if (!canSuggest || !type) return null;
    const anchor = /^\d{4}-\d{2}-\d{2}/.test(occurredAt) ? occurredAt.slice(0, 10) : reference.today;
    return suggestFollowUp(`${summary}\n${body}`, { anchor, today: reference.today, holidays: reference.holidays, person: lead.clientExecutive, company: lead.clientName });
  }, [canSuggest, type, summary, body, occurredAt, reference.today, reference.holidays, lead.clientExecutive, lead.clientName]);
  const suggestionKey = suggestion ? `${suggestion.date}|${suggestion.time ?? ""}|${suggestion.title}` : "";
  const draft: FollowUpDraft | null = suggestion
    ? (taskDraft?.key === suggestionKey ? taskDraft : { key: suggestionKey, enabled: true, title: suggestion.title, date: suggestion.date, time: suggestion.time ?? "09:00" })
    : null;
  const updateDraft = (changes: Partial<FollowUpDraft>) => { if (draft) setTaskDraft({ ...draft, ...changes }); };

  const open = (next: LoggableActivityType) => { setType(next); setSummary(""); setBody(""); setOccurredAt(toLocalInput(new Date().toISOString())); setTaskDraft(null); setError(""); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!type) return;
    setBusy(true);
    setError("");
    const followUpTask = draft?.enabled && suggestion
      ? { title: draft.title.trim() || suggestion.title, description: suggestion.sentence, dueAt: fromLocalInput(`${draft.date}T${draft.time}`), setFollowUpDate: true }
      : undefined;
    try {
      await logActivity(lead.id, { type, summary, body, occurredAt: fromLocalInput(occurredAt), followUpTask });
      setType(null);
      setTaskDraft(null);
      await onLogged(followUpTask ? "Activity recorded and follow-up task created" : undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="timeline-tab">
      {(canLog || canNote) && (
        <div className="section-actions log-actions">
          {canLog && <button className={`button button-outline button-small ${type === "call" ? "is-active" : ""}`} onClick={() => open("call")}><Phone size={14} /> Log call</button>}
          {canLog && <button className={`button button-outline button-small ${type === "email" ? "is-active" : ""}`} onClick={() => open("email")}><Mail size={14} /> Log email</button>}
          {canLog && <button className={`button button-outline button-small ${type === "visit" ? "is-active" : ""}`} onClick={() => open("visit")}><MapPin size={14} /> Log visit</button>}
          {canNote && <button className={`button button-primary button-small ${type === "note" ? "is-active" : ""}`} onClick={() => open("note")}><MessageSquare size={14} /> Add note</button>}
        </div>
      )}
      {type && (
        <form className="lead-form activity-form" onSubmit={submit}>
          {type !== "note" && <Field label="Summary" wide><input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} placeholder={type === "call" ? "Spoke with HR about the Q1 hiring plan" : type === "email" ? "Sent the introduction email" : "On-site meeting with the plant manager"} autoFocus /></Field>}
          <Field label={type === "note" ? "Interaction note" : "Notes (optional)"} wide required={type === "note"} hint={canSuggest ? "Mention the next step with a date (\u201cfollow up next Tuesday\u201d, \u201csend the proposal by Friday\u201d) and a task will be offered." : undefined}><textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} placeholder="What was discussed, commitments, next steps..." autoFocus={type === "note"} required={type === "note"} /></Field>
          <Field label="When"><input type="datetime-local" value={occurredAt} max={toLocalInput(new Date().toISOString())} onChange={(event) => setOccurredAt(event.target.value)} required /></Field>
          {draft && suggestion && (
            <div className="form-note follow-up-suggestion field-wide">
              <CalendarCheck2 size={14} />
              <div className="follow-up-suggestion-body">
                <label className="checklist-item">
                  <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} />
                  <span>Create a follow-up task from this {type === "note" ? "note" : type}: understood &ldquo;{suggestion.matched}&rdquo; as <strong>{formatDate(draft.date)} at {formatTimeOfDay(draft.time)}</strong>{suggestion.adjusted ? " (moved to the next working day)" : ""}. The lead&apos;s next follow-up date moves there too.</span>
                </label>
                {draft.enabled && (
                  <div className="follow-up-suggestion-fields">
                    <input aria-label="Follow-up task title" value={draft.title} maxLength={200} onChange={(event) => updateDraft({ title: event.target.value })} />
                    <input aria-label="Follow-up task date" type="date" value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} />
                    <input aria-label="Follow-up task time" type="time" value={draft.time} onChange={(event) => updateDraft({ time: event.target.value })} />
                  </div>
                )}
              </div>
            </div>
          )}
          <ErrorText message={error} />
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setType(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : type === "note" ? "Add note" : `Save ${type}`}</button></div>
        </form>
      )}
      <div className="timeline-list">
        {detail.activities.map((activity) => (
          <article className={`timeline-entry type-${activity.type}`} key={activity.id}>
            <span className="timeline-dot">{activityIcon(activity.type)}</span>
            <div>
              <div className="timeline-head"><strong>{activity.summary}</strong><span className="badge badge-muted">{activityLabels[activity.type]}</span></div>
              {activity.body && <p className="timeline-body">{activity.body}</p>}
              <small>{activity.userName} · {formatDateTime(activity.occurredAt)} ({relativeTime(activity.occurredAt)})</small>
            </div>
          </article>
        ))}
        {!detail.activities.length && <EmptyState icon={<History size={22} />} title="No activity yet" text="Log a call, email, visit, or note to start the timeline." />}
      </div>
    </div>
  );
}

function FilesTab({ category, files, leadId, onChanged }: { category: "document" | "profile"; files: LeadAttachment[]; leadId: number; onChanged: (message: string) => Promise<void> }) {
  const { can, notify } = useApp();
  const [label, setLabel] = useState(category === "profile" ? "Candidate profile" : "JD");
  const [customLabel, setCustomLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<LeadAttachment | null>(null);
  const [docxText, setDocxText] = useState<{ id: number; text?: string; error?: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (!preview || !preview.fileName.toLowerCase().endsWith(".docx")) return;
    let cancelled = false;
    fetch(attachmentUrl(preview.id), { credentials: "same-origin" })
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => mammoth.extractRawText({ arrayBuffer }))
      .then((result) => { if (!cancelled) setDocxText({ id: preview.id, text: result.value }); })
      .catch((caught: unknown) => { if (!cancelled) setDocxText({ id: preview.id, error: caught instanceof Error ? caught.message : "The document could not be read." }); });
    return () => { cancelled = true; };
  }, [preview]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setError("Choose a file to upload."); return; }
    const finalLabel = label === "Other" ? customLabel.trim() : label;
    if (!finalLabel) { setError("Enter a name for this file."); return; }
    setBusy(true);
    setError("");
    try {
      await uploadAttachment(leadId, file, category, finalLabel);
      setFile(null);
      setCustomLabel("");
      setInputKey((key) => key + 1);
      await onChanged(category === "profile" ? "Profile shared" : "Document attached");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachment: LeadAttachment) => {
    try {
      await removeAttachment(attachment.id);
      if (preview?.id === attachment.id) setPreview(null);
      await onChanged("File removed (kept in audit history)");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  if (preview) {
    const previewable = previewableMimeTypes.includes(preview.mimeType);
    const isDocx = preview.fileName.toLowerCase().endsWith(".docx");
    return (
      <section className="attachment-preview">
        <div className="attachment-preview-toolbar">
          <button className="button button-outline button-small" onClick={() => { setPreview(null); setDocxText(null); }}><ArrowLeft size={14} /> All files</button>
          <span>{preview.label} · v{preview.version} · {fileSize(preview.sizeBytes)}</span>
          <a className="button button-outline button-small" href={attachmentUrl(preview.id, true)}><Download size={14} /> Download</a>
        </div>
        <div className="attachment-preview-canvas">
          {previewable ? <iframe className="attachment-preview-frame" src={attachmentUrl(preview.id)} title={`Preview of ${preview.fileName}`} sandbox="" />
            : isDocx ? (docxText?.id === preview.id ? (docxText.error ? <p className="attachment-preview-message">Preview failed: {docxText.error}</p> : <pre className="docx-preview-text">{docxText.text || "This document contains no readable text."}</pre>) : <p className="attachment-preview-message">Loading document preview…</p>)
            : <div className="attachment-preview-message"><FileText size={30} /><strong>Preview isn&apos;t available for this file type.</strong><span>Download the file to view it.</span></div>}
        </div>
      </section>
    );
  }

  return (
    <section className="lead-attachments">
      {can("upload_files") && (
        <form className="attachment-form" onSubmit={upload}>
          <Field label={category === "profile" ? "Profile name" : "Document type"}>
            {category === "profile"
              ? <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="Candidate name or role" />
              : <select value={label} onChange={(event) => setLabel(event.target.value)}>{documentLabels.map((option) => <option key={option}>{option}</option>)}</select>}
          </Field>
          {category === "document" && label === "Other" && <Field label="Specify name"><input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} maxLength={120} required placeholder="Enter document name" /></Field>}
          <Field label="Choose file" hint="PDF, Word, Excel, PowerPoint, image, or text · 15 MB max. Re-uploading the same file name creates a new version.">
            <input key={inputKey} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
          </Field>
          <ErrorText message={error} />
          <div className="attachment-submit"><button className="button button-outline" type="submit" disabled={busy}><Paperclip size={14} /> {busy ? "Uploading..." : category === "profile" ? "Share profile" : "Add document"}</button></div>
        </form>
      )}
      <div className="attachment-list">
        {files.map((attachment) => (
          <div className={`attachment-row ${attachment.deletedAt ? "is-deleted" : ""}`} key={attachment.id}>
            <span className="attachment-file-icon"><FileText size={15} /></span>
            <button type="button" className="attachment-file-info attachment-preview-trigger" onClick={() => setPreview(attachment)} aria-label={`Preview ${attachment.fileName}`}>
              <strong>{attachment.fileName}</strong>
              <small>{attachment.label} · {fileSize(attachment.sizeBytes)} · {attachment.uploadedByName} · {formatDateTime(attachment.createdAt)}{attachment.deletedAt ? ` · removed by ${attachment.deletedByName}` : ""}</small>
            </button>
            {attachment.version > 1 && <span className="attachment-version">v{attachment.version}</span>}
            <a className="icon-button" href={attachmentUrl(attachment.id, true)} aria-label={`Download ${attachment.fileName}`}><Download size={14} /></a>
            {can("delete_files") && !attachment.deletedAt && <button className="icon-button" aria-label={`Remove ${attachment.fileName}`} onClick={() => void remove(attachment)}><Trash2 size={14} /></button>}
          </div>
        ))}
        {!files.length && <p className="no-attachments">{category === "profile" ? "No candidate profiles shared yet." : "No documents yet."}</p>}
      </div>
    </section>
  );
}
