"use client";

import { useMemo, useState, useCallback, useEffect, type FormEvent, type ReactNode } from "react";
import {
  Archive, ArrowLeft, Building2, CalendarCheck2, Check, ChevronDown, CircleDollarSign, Download, ExternalLink, FileText, History, Info, Mail, MapPin, MessageSquare, Paperclip, Pencil, Phone, Plus, RotateCcw, Trash2, UserRound, Users,
} from "lucide-react";
import mammoth from "mammoth";
import { errorMessage } from "@/lib/api";
import { fileSize, formatDate, formatDateTime, formatTimeOfDay, fromLocalInput, relativeTime, toLocalInput } from "@/lib/format";
import { suggestFollowUp } from "@/lib/natural-dates";
import { useAsyncData } from "@/lib/useAsyncData";
import { documentLabels, previewableMimeTypes, type LeadAttachment } from "@/features/attachments/model";
import LeadEmails from "@/features/gmail/LeadEmails";
import { replyWaiting } from "@/features/gmail/watch-model";
import { reasonListFor, type ListKey, type ListValue } from "@/features/list-values/model";
import CollaborationTab from "@/features/messages/CollaborationTab";
import NextStepDialog from "@/features/pipeline/NextStepDialog";
import { stageChoices } from "@/features/pipeline/model";
import StageBar from "@/features/pipeline/StageBar";
import RichText from "@/features/shell/RichText";
import RichTextArea from "@/features/shell/RichTextArea";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, Dialog, EmptyState, ErrorText, Field, Loading, PromptDialog, StatusPill, Tabs } from "@/features/shell/components";
import { createTask, updateTask } from "@/features/tasks/client";
import NaturalDateField from "@/features/tasks/NaturalDateField";
import TaskFormDialog from "@/features/tasks/TaskFormDialog";
import type { Task } from "@/features/tasks/model";
import UserDirectoryDialog from "@/features/users/UserDirectoryDialog";
import type { UserSummary } from "@/features/users/model";
import { attachmentUrl, fetchLead, logActivity, removeAttachment, reviewLead, setLeadState, setLeadTodo, transferLead, updateLead, uploadAttachment, type LeadDetail } from "./client";
import LeadFormDialog from "./LeadFormDialog";
import { activityLabels, formatDealValue, type LeadActivity, type LeadSummary, type LoggableActivityType } from "./model";

type HistoryTab = "timeline" | "collaboration" | "emails" | "files" | "profiles" | "history";
type TimelineFilter = "all" | "notes" | "activities" | "changes";
type QuickChanges = { bdActionId?: number | null; clientResponseId?: number | null; statusReasonId?: number | null; stageId?: number | null };

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

/**
 * The deal page (#/deal/<id>), laid out after Pipedrive's: the title, status, owner and actions across the top, the
 * pipeline stages under them, the deal's details in collapsible panels on the left (summary, person, organization,
 * overview), and on the right the composer (note, call, email, visit, follow-up), the focus list (what is planned)
 * and the history (timeline, collaboration, emails, files, audit).
 */
export default function DealPage({ leadId, backLabel, onClose }: { leadId: number; backLabel: string; onClose: () => void }) {
  const { user, can, reference, notify, bumpData } = useApp();
  const fetcher = useCallback(() => fetchLead(leadId), [leadId]);
  const { data: detail, error, reload } = useAsyncData<LeadDetail>(fetcher);
  const [tab, setTab] = useState<HistoryTab>("timeline");
  const [editing, setEditing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // The prompt keeps the deal as it was saved (with its new stage), so it opens once and is not redrawn when the page reloads.
  const [nextStep, setNextStep] = useState<{ reason: string; lead: LeadSummary } | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "transfer-pick" } | { kind: "transfer-reason"; user: UserSummary } | { kind: "archive" } | { kind: "restore" } | { kind: "review"; approve: boolean } | { kind: "task"; task?: Task }
    | { kind: "status-reason"; statusId: number; statusName: string; listKey: ListKey }
    | null
  >(null);

  const refresh = async (message?: string) => {
    reload();
    bumpData();
    if (message) notify(message);
  };

  const back = <button className="icon-button deal-back" aria-label={`Back to ${backLabel}`} title={`Back to ${backLabel}`} onClick={onClose}><ArrowLeft size={18} /></button>;
  if (error && !detail) return <div className="deal-page"><header className="deal-header">{back}<div className="deal-heading"><h1>Deal</h1></div></header><ErrorText message={error} /></div>;
  if (!detail) return <div className="deal-page"><header className="deal-header">{back}<div className="deal-heading"><Loading text="Loading deal..." /></div></header></div>;

  const { lead, permissions } = detail;
  const canEdit = permissions.edit;
  const canTransfer = can("reassign_leads") || (can("transfer_leads") && lead.ownerId === user.id);
  // PIPE-09: ask for the next step after an activity, a BD action, or a stage move, unless Settings → Pipeline creates it without asking.
  const offerNextStep = (reason: string, saved: LeadSummary = lead) => {
    if (reference.pipeline.promptNextStep && !reference.pipeline.autoFollowUp && can("manage_tasks") && saved.recordState === "active") setNextStep({ reason, lead: saved });
  };
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const documents = detail.attachments.filter((file) => file.category === "document");
  const profiles = detail.attachments.filter((file) => file.category === "profile");

  // LEAD-06: Lost Lead and Disqualified ask for a reason before the status changes; other statuses apply at once.
  const changeStatus = async (statusId: number) => {
    const target = reference.listValues.status.find((status) => status.id === statusId);
    const listKey = reasonListFor(target?.code);
    if (target && listKey) { setDialog({ kind: "status-reason", statusId, statusName: target.value, listKey }); return; }
    try {
      await updateLead(lead.id, { statusId });
      await refresh("Status updated");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };
  const reasonKey = reasonListFor(lead.statusCode);

  const quickUpdate = async (changes: Parameters<typeof updateLead>[1], message: string, prompt?: string) => {
    try {
      const result = await updateLead(lead.id, changes);
      await refresh(result.task ? `${message} · ${result.task.title} scheduled for ${result.task.dueAt ? result.task.dueAt.slice(0, 10) : "later"}` : message);
      if (prompt && !result.task) offerNextStep(prompt, result.lead);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const changeTodo = async (listId: number | null) => {
    try {
      const result = await setLeadTodo(lead.id, listId);
      await refresh(result.lead.todoList ? `Moved to To Do: ${result.lead.todoList}` : "Taken off the To Do list");
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


  const openTasks = detail.tasks.filter((task) => task.status !== "done");
  const doneTasks = detail.tasks.filter((task) => task.status === "done");
  const overdue = Boolean(lead.followUpDate && lead.followUpDate < reference.today && lead.recordState === "active");
  const toggleTask = async (task: Task) => {
    try {
      await updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
      await refresh(task.status === "done" ? "Task reopened" : "Task completed");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };
  const taskCard = (task: Task) => (
    <article className="task-card" key={task.id}>
      <button className={`task-checkbox ${task.status === "done" ? "is-done" : ""}`} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={!can("manage_tasks")} onClick={() => void toggleTask(task)}><Check size={13} /></button>
      <div className="task-card-content">
        <strong className={task.status === "done" ? "is-done" : ""}>{task.title}</strong>
        <small>{task.assigneeName} · {task.dueAt ? formatDateTime(task.dueAt) : "No due date"}{task.checklist.length ? ` · ${task.checklist.filter((item) => item.done).length}/${task.checklist.length} checklist` : ""}{task.commentCount ? ` · ${task.commentCount} comment${task.commentCount === 1 ? "" : "s"}` : ""}</small>
        <span className={`priority priority-${task.priority}`}>{task.priority} priority</span>
      </div>
      {can("manage_tasks") && <button className="row-more" aria-label={`Edit ${task.title}`} onClick={() => setDialog({ kind: "task", task })}><Pencil size={15} /></button>}
    </article>
  );

  return (
    <>
      <div className="deal-page">
        <header className="deal-header">
          {back}
          <Avatar name={lead.clientName} seed={lead.id} />
          <div className="deal-heading">
            <span className="eyebrow">{lead.recordState === "queued" ? "QUEUED FOR APPROVAL" : lead.recordState === "archived" ? "ARCHIVED DEAL" : "DEAL"}</span>
            <h1 className="lead-title">
              {lead.companyUrl
                ? <a className="company-link-icon" href={lead.companyUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${lead.clientName} website`} title="Open company website"><ExternalLink size={14} /></a>
                : null}
              {lead.clientName}
            </h1>
            <p>{lead.leadType}{lead.industry ? ` · ${lead.industry}` : ""}{lead.city ? ` · ${lead.city}` : ""}</p>
          </div>
          <div className="status-row">
            {canEdit && lead.recordState !== "archived" ? (
              <label className={`status-pill status-${lead.statusCode} status-select-pill`}>
                <i />
                <select aria-label="Update deal status" value={lead.statusId} onChange={(event) => void changeStatus(Number(event.target.value))}>
                  {reference.listValues.status.map((status) => <option key={status.id} value={status.id}>{status.value}</option>)}
                </select>
              </label>
            ) : <StatusPill status={lead.statusLabel} code={lead.statusCode} />}
            {reasonKey && canEdit && lead.recordState !== "archived" && (
              <select className="inline-select" aria-label="Status reason" value={lead.statusReasonId ?? ""} onChange={(event) => void quickUpdate({ statusReasonId: Number(event.target.value) }, "Status reason updated")}>
                {reference.listValues[reasonKey].map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
              </select>
            )}
          </div>
          <div className="detail-owner"><small>OWNER</small><strong>{lead.ownerName}</strong></div>
          <div className="detail-header-actions">{headerActions}</div>
        </header>
        {lead.recordState !== "archived" && (
          <StageBar lead={lead} canMove={canEdit} onMoved={(message, task, moved) => { void refresh(message); if (!task) offerNextStep("You moved the deal to a new stage.", moved); }} />
        )}
        {lead.stateReason && <div className="form-note state-note"><History size={14} /> {lead.stateReason}</div>}

        <div className="deal-columns">
          <aside className="deal-side" aria-label="Deal details">
            <SidePanels detail={detail} canEdit={canEdit} overdue={overdue} onQuickUpdate={quickUpdate} onTodo={changeTodo} />
          </aside>

          <div className="deal-main">
            <Composer
              detail={detail}
              canEdit={canEdit}
              onLogged={async (message, logged) => {
                await refresh(message ?? "Activity recorded");
                if (logged && logged.type !== "note" && !logged.taskCreated) offerNextStep(`You logged ${logged.type === "email" ? "an email" : `a ${logged.type}`}.`);
              }}
              onScheduleFollowUp={async (date, time, note) => {
                await updateLead(lead.id, { followUpDate: date });
                await createTask({ leadId: lead.id, title: `Follow up with ${lead.clientExecutive || lead.clientName}`, description: note, assigneeId: lead.ownerId, dueAt: fromLocalInput(`${date}T${time}`), priority: "normal", checklist: [] });
                await refresh("Follow-up scheduled and added to tasks");
              }}
            />

            <section className="deal-block" aria-label="Focus">
              <div className="deal-block-head">
                <h2>Focus</h2>
                {can("manage_tasks") && lead.recordState !== "archived" && <button className="button button-outline button-small" onClick={() => setDialog({ kind: "task" })}><Plus size={14} /> Create task</button>}
              </div>
              {lead.followUpDate && lead.recordState === "active" && (
                <p className={`focus-follow-up ${overdue ? "overdue" : lead.followUpDate === reference.today ? "due-today" : ""}`}><CalendarCheck2 size={14} /> Next follow-up {formatDate(lead.followUpDate)}{overdue ? " · overdue" : lead.followUpDate === reference.today ? " · today" : ""}</p>
              )}
              <div className="detail-tasks">
                {openTasks.map(taskCard)}
                {!openTasks.length && <EmptyState icon={<CalendarCheck2 size={22} />} title="No focus items yet" text="Open tasks and scheduled follow-ups for this deal appear here." />}
              </div>
              {doneTasks.length > 0 && (
                <>
                  <button className="text-button focus-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((open) => !open)}>{showDone ? "Hide" : "Show"} completed tasks ({doneTasks.length})</button>
                  {showDone && <div className="detail-tasks">{doneTasks.map(taskCard)}</div>}
                </>
              )}
            </section>

            <section className="deal-block" aria-label="History">
              <div className="deal-block-head"><h2>History</h2></div>
              <Tabs
                tabs={[
                  { id: "timeline", label: "Timeline", count: detail.activities.length },
                  { id: "collaboration", label: "Collaboration", count: detail.messageCount },
                  { id: "emails", label: "Emails" },
                  { id: "files", label: "Documents", count: documents.length },
                  { id: "profiles", label: "Profiles shared", count: profiles.length },
                  ...(detail.audit.length ? [{ id: "history" as const, label: "Audit", count: detail.audit.length }] : []),
                ]}
                active={tab}
                onChange={setTab}
              />
              {tab === "timeline" && <TimelineList activities={detail.activities} />}
              {tab === "collaboration" && <CollaborationTab leadId={lead.id} attachments={detail.attachments} canPost={can("collaborate") && lead.recordState !== "archived"} onChanged={() => { reload(); bumpData(); }} />}
              {tab === "emails" && <LeadEmails leadId={lead.id} addresses={lead.clientEmails} attachments={detail.attachments} />}
              {(tab === "files" || tab === "profiles") && (
                <FilesTab key={tab} category={tab === "files" ? "document" : "profile"} files={tab === "files" ? documents : profiles} leadId={lead.id} onChanged={(message) => refresh(message)} />
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
            </section>
          </div>
        </div>
      </div>

      {editing && <LeadFormDialog lead={lead} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh("Deal updated"); }} />}
      {dialog?.kind === "transfer-pick" && (
        <UserDirectoryDialog title="Transfer deal" description={`Choose who will own ${lead.clientName}. Open tasks on this deal move with it.`} users={owners} excludeIds={[lead.ownerId]} confirmLabel="Transfer" onClose={() => setDialog(null)} onPick={(picked) => setDialog({ kind: "transfer-reason", user: picked })} />
      )}
      {dialog?.kind === "transfer-reason" && (
        <PromptDialog title={`Transfer to ${dialog.user.name}`} eyebrow="OWNERSHIP" label="Reason (optional)" confirmLabel="Transfer deal" onClose={() => setDialog(null)} onConfirm={async (reason) => { await transferLead(lead.id, dialog.user.id, reason); setDialog(null); await refresh(`${lead.clientName} transferred to ${dialog.user.name}`); }} />
      )}
      {dialog?.kind === "archive" && (
        <PromptDialog title={`Archive ${lead.clientName}`} eyebrow="ARCHIVE" label="Reason (optional)" confirmLabel="Archive deal" onClose={() => setDialog(null)} onConfirm={async (reason) => { await setLeadState(lead.id, "archived", reason); setDialog(null); await refresh("Deal archived"); }} />
      )}
      {dialog?.kind === "restore" && (
        <PromptDialog title={`Restore ${lead.clientName}`} eyebrow="ARCHIVE" label="Note (optional)" confirmLabel="Restore deal" onClose={() => setDialog(null)} onConfirm={async (reason) => { await setLeadState(lead.id, "active", reason); setDialog(null); await refresh("Deal restored"); }} />
      )}
      {dialog?.kind === "review" && (
        <PromptDialog title={dialog.approve ? `Approve ${lead.clientName}` : `Reject ${lead.clientName}`} eyebrow="QUEUED DEAL" label={dialog.approve ? "Comment (optional)" : "Reason"} required={!dialog.approve} danger={!dialog.approve} confirmLabel={dialog.approve ? "Approve" : "Reject"} onClose={() => setDialog(null)} onConfirm={async (comment) => { await reviewLead(lead.id, dialog.approve, comment); setDialog(null); await refresh(dialog.approve ? "Deal approved" : "Deal rejected"); }} />
      )}
      {dialog?.kind === "status-reason" && (
        <StatusReasonDialog
          leadName={lead.clientName}
          statusName={dialog.statusName}
          options={reference.listValues[dialog.listKey]}
          onClose={() => setDialog(null)}
          onConfirm={async (statusReasonId) => { await updateLead(lead.id, { statusId: dialog.statusId, statusReasonId }); setDialog(null); await refresh("Status updated"); }}
        />
      )}
      {dialog?.kind === "task" && (
        <TaskFormDialog task={dialog.task} leadId={lead.id} leadName={lead.clientName} defaultAssigneeId={lead.ownerId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void refresh(dialog.task ? "Task updated" : "Task created"); }} />
      )}
      {nextStep && (
        <NextStepDialog lead={nextStep.lead} reason={nextStep.reason} onClose={() => setNextStep(null)} onSaved={(message) => { setNextStep(null); void refresh(message); }} />
      )}
    </>
  );
}

/** Asks for the Status Reason that Lost Lead and Disqualified require (LEAD-06). */
function StatusReasonDialog({ leadName, statusName, options, onConfirm, onClose }: { leadName: string; statusName: string; options: ListValue[]; onConfirm: (statusReasonId: number) => Promise<void>; onClose: () => void }) {
  const [reasonId, setReasonId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reasonId) { setError("Choose a reason."); return; }
    setBusy(true);
    setError("");
    try { await onConfirm(Number(reasonId)); } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  };
  return (
    <Dialog title={`Mark ${leadName} as ${statusName}`} eyebrow="DEAL STATUS" onClose={onClose} size="narrow">
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">The reason is shown with the status everywhere as &ldquo;{statusName} &ndash; reason&rdquo;.</p>
        <Field label="Status reason" required>
          <select value={reasonId} onChange={(event) => setReasonId(event.target.value)} autoFocus>
            <option value="">Choose a reason</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Set status"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** One collapsible panel of the left column, open unless the person closes it. */
export function SidePanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <details className="side-panel" open>
      <summary><ChevronDown size={15} className="side-panel-chevron" /><span className="side-panel-icon">{icon}</span>{title}</summary>
      <div className="side-rows">{children}</div>
    </details>
  );
}

export function SideRow({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <div className={wide ? "side-row side-row-wide" : "side-row"}><small>{label}</small><div className="side-value">{children}</div></div>;
}

const missing = (text = "Not provided") => <span className="detail-missing">{text}</span>;

/** The deal's details, grouped the way Pipedrive groups them; the selects save at once. */
function SidePanels({ detail, canEdit, overdue, onQuickUpdate, onTodo }: {
  detail: LeadDetail; canEdit: boolean; overdue: boolean;
  onQuickUpdate: (changes: QuickChanges, message: string, prompt?: string) => Promise<void>;
  /** TODO-02: put the deal on a To Do list, move it, or take it off (null). */
  onTodo: (listId: number | null) => Promise<void>;
}) {
  const { reference, openContact } = useApp();
  const { lead } = detail;
  return (
    <>
      <SidePanel title="Summary" icon={<CircleDollarSign size={14} />}>
        <SideRow label="Pipeline stage">
          {canEdit && lead.recordState === "active" ? (
            <select className="inline-select" aria-label="Stage" value={lead.stageId ?? ""} onChange={(event) => void onQuickUpdate({ stageId: event.target.value ? Number(event.target.value) : null }, "Stage updated", "You moved the deal to a new stage.")}>
              {!lead.stageId && <option value="">Not set</option>}
              {stageChoices(reference.listValues.stage, reference.pipelines).filter((item) => item.active || item.id === lead.stageId).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          ) : <strong>{lead.stage ?? "Not set"}</strong>}
        </SideRow>
        <SideRow label="BD action">
          {canEdit ? (
            <select className="inline-select" aria-label="BD action" value={lead.bdActionId ?? ""} onChange={(event) => void onQuickUpdate({ bdActionId: event.target.value ? Number(event.target.value) : null }, "BD action updated", "You recorded a BD action.")}>
              <option value="">Not set</option>
              {reference.listValues.bd_action.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          ) : <strong>{lead.bdAction ?? "Not set"}</strong>}
        </SideRow>
        <SideRow label="Client response">
          {canEdit ? (
            <select className="inline-select" aria-label="Client response" value={lead.clientResponseId ?? ""} onChange={(event) => void onQuickUpdate({ clientResponseId: event.target.value ? Number(event.target.value) : null }, "Client response updated")}>
              <option value="">Not set</option>
              {reference.listValues.client_response.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          ) : <strong>{lead.clientResponse ?? "Not set"}</strong>}
        </SideRow>
        <SideRow label="To Do list">
          {canEdit && (lead.recordState === "active" || lead.todoListId) ? (
            <select className="inline-select" aria-label="To Do list" value={lead.todoListId ?? ""} onChange={(event) => void onTodo(event.target.value ? Number(event.target.value) : null)}>
              <option value="">Not on a list</option>
              {reference.listValues.todo_list.filter((item) => item.active || item.id === lead.todoListId).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          ) : <strong>{lead.todoList ?? "Not on a list"}</strong>}
        </SideRow>
        <SideRow label="Next follow-up"><strong className={overdue ? "overdue" : lead.followUpDate === reference.today ? "due-today" : ""}>{formatDate(lead.followUpDate)}{overdue ? " · overdue" : ""}</strong></SideRow>
        {/* PD-11: both are optional and only take room once one of them is filled. */}
        {(lead.dealValue !== null && lead.dealValue !== undefined) && <SideRow label="Value"><strong>{formatDealValue(lead.dealValue)}</strong></SideRow>}
        {lead.expectedCloseDate && <SideRow label="Expected close"><strong>{formatDate(lead.expectedCloseDate)}</strong></SideRow>}
        <SideRow label="Deal type"><strong>{lead.leadType}</strong></SideRow>
        <SideRow label="Deal category"><strong>{lead.leadCategory ?? "Not set"}</strong></SideRow>
      </SidePanel>

      <SidePanel title="Person" icon={<UserRound size={14} />}>
        <SideRow label="Name">{lead.personId && lead.clientExecutive
          ? <button type="button" className="link-button contact-name client-executive-name" onClick={() => openContact("person", lead.personId!)}>{lead.clientExecutive}</button>
          : <strong className="client-executive-name">{lead.clientExecutive || "Not provided"}</strong>}</SideRow>
        <SideRow label="Email">{lead.clientEmails.length ? <span className="email-list">{lead.clientEmails.map((email) => <a key={email} href={`mailto:${email}`}>{email}</a>)}</span> : missing()}</SideRow>
        <SideRow label="Phone">{lead.contactPhone ? <a href={`tel:${lead.contactPhone}`}>{lead.contactPhone}</a> : missing()}</SideRow>
        <SideRow label="Ext. / alternate">{lead.contactAltPhone ? <a href={`tel:${lead.contactAltPhone}`}>{lead.contactAltPhone}</a> : missing()}</SideRow>
        <SideRow label="Contact remark"><strong>{lead.contactRemark || "—"}</strong></SideRow>
        <SideRow label="Client last email">{lead.lastClientEmailAt ? <strong className={replyWaiting(lead) ? "overdue" : ""}>{formatDateTime(lead.lastClientEmailAt)}{replyWaiting(lead) ? " · awaiting your reply" : ""}</strong> : <span className="detail-muted">None seen in a connected mailbox</span>}</SideRow>
      </SidePanel>

      <SidePanel title="Organization" icon={<Building2 size={14} />}>
        <SideRow label="Name">{lead.organizationId
          ? <button type="button" className="link-button contact-name" onClick={() => openContact("organization", lead.organizationId!)}>{lead.clientName}</button>
          : <strong>{lead.clientName}</strong>}</SideRow>
        <SideRow label="Industry"><strong>{lead.industry || "Not set"}</strong></SideRow>
        <SideRow label="Company size"><strong>{lead.companySize ?? "Not set"}</strong></SideRow>
        <SideRow label="City"><strong>{lead.city ?? "Not set"}</strong></SideRow>
        <SideRow label="Address"><strong>{lead.address || "Not provided"}</strong></SideRow>
        <SideRow label="Website">{lead.companyUrl ? <a href={lead.companyUrl} target="_blank" rel="noopener noreferrer">{lead.companyUrl.replace(/^https?:\/\//, "")}</a> : missing()}</SideRow>
      </SidePanel>

      <SidePanel title="Overview" icon={<Info size={14} />}>
        <SideRow label="First contact"><strong>{formatDate(lead.firstContactDate)}</strong></SideRow>
        <SideRow label="Contract signed"><strong>{formatDate(lead.contractSignedDate, "Not signed")}</strong></SideRow>
        <SideRow label="Created"><strong>{`${formatDateTime(lead.createdAt)} by ${lead.createdByName}`}</strong></SideRow>
        {lead.positions && <SideRow label="Positions" wide><p className="detail-text">{lead.positions}</p></SideRow>}
        {lead.comments && <SideRow label="Comments" wide><p className="detail-text">{lead.comments}</p></SideRow>}
      </SidePanel>
    </>
  );
}

type FollowUpDraft = { key: string; enabled: boolean; title: string; date: string; time: string };
type ComposerMode = LoggableActivityType | "follow-up";

/** The box at the top of the right column: write a note, log a call, an email or a visit, or schedule the follow-up. */
function Composer({ detail, canEdit, onLogged, onScheduleFollowUp }: {
  detail: LeadDetail; canEdit: boolean;
  onLogged: (message?: string, logged?: { type: LoggableActivityType; taskCreated: boolean }) => Promise<void>;
  onScheduleFollowUp: (date: string, time: string, note: string) => Promise<void>;
}) {
  const { can, reference } = useApp();
  const { lead } = detail;
  const [mode, setMode] = useState<ComposerMode | null>(null);
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date().toISOString()));
  const [taskDraft, setTaskDraft] = useState<FollowUpDraft | null>(null);
  const [date, setDate] = useState(lead.followUpDate ?? reference.today);
  const [time, setTime] = useState("09:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canLog = can("log_activities") && lead.recordState === "active";
  const canNote = can("add_notes") && lead.recordState !== "archived";
  const canSuggest = can("manage_tasks") && lead.recordState === "active";
  const canFollowUp = canEdit && can("manage_tasks") && lead.recordState === "active";
  const type = mode && mode !== "follow-up" ? mode : null;

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

  const open = (next: ComposerMode) => { setMode(next); setSummary(""); setBody(""); setOccurredAt(toLocalInput(new Date().toISOString())); setTaskDraft(null); setNote(""); setError(""); };

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
      setMode(null);
      setTaskDraft(null);
      await onLogged(followUpTask ? "Activity recorded and follow-up task created" : undefined, { type, taskCreated: Boolean(followUpTask) });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const schedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onScheduleFollowUp(date, time, note); setMode(null); setNote(""); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  };

  if (!canLog && !canNote && !canFollowUp) return null;
  const tabButton = (id: ComposerMode, label: string, icon: ReactNode) => (
    <button type="button" className={mode === id ? "is-active" : ""} aria-pressed={mode === id} onClick={() => (mode === id ? setMode(null) : open(id))}>{icon} {label}</button>
  );

  return (
    <section className="deal-block composer" aria-label="Add to this deal">
      <div className="composer-tabs log-actions">
        {canNote && tabButton("note", "Add note", <MessageSquare size={14} />)}
        {canLog && tabButton("call", "Log call", <Phone size={14} />)}
        {canLog && tabButton("email", "Log email", <Mail size={14} />)}
        {canLog && tabButton("visit", "Log visit", <MapPin size={14} />)}
        {canFollowUp && tabButton("follow-up", "Schedule follow-up", <CalendarCheck2 size={14} />)}
      </div>
      {!mode && <p className="composer-hint">Choose what to add: a note, a call, an email or a visit you had{canFollowUp ? ", or the next follow-up" : ""}.</p>}
      {type && (
        <form className="lead-form activity-form" onSubmit={submit}>
          {type !== "note" && <Field label="Summary" wide><input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} placeholder={type === "call" ? "Spoke with HR about the Q1 hiring plan" : type === "email" ? "Sent the introduction email" : "On-site meeting with the plant manager"} autoFocus /></Field>}
          <Field label={type === "note" ? "Interaction note" : "Notes (optional)"} wide required={type === "note"} hint={canSuggest ? "Mention the next step with a date (\u201cfollow up next Tuesday\u201d, \u201csend the proposal by Friday\u201d) and a task will be offered. Use the toolbar or the microphone; **bold**, _italic_, lists, and links are kept." : undefined}><RichTextArea value={body} onChange={setBody} rows={4} maxLength={10000} placeholder="What was discussed, commitments, next steps..." autoFocus={type === "note"} required={type === "note"} /></Field>
          <Field label="When"><input type="datetime-local" value={occurredAt} max={toLocalInput(new Date().toISOString())} onChange={(event) => setOccurredAt(event.target.value)} required /></Field>
          {draft && suggestion && (
            <div className="form-note follow-up-suggestion field-wide">
              <CalendarCheck2 size={14} />
              <div className="follow-up-suggestion-body">
                <label className="checklist-item">
                  <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} />
                  <span>Create a follow-up task from this {type === "note" ? "note" : type}: understood &ldquo;{suggestion.matched}&rdquo; as <strong>{formatDate(draft.date)} at {formatTimeOfDay(draft.time)}</strong>{suggestion.adjusted ? " (moved to the next working day)" : ""}. The deal&apos;s next follow-up date moves there too.</span>
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
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setMode(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : type === "note" ? "Save note" : `Save ${type}`}</button></div>
        </form>
      )}
      {mode === "follow-up" && (
        <form className="lead-form follow-up-form" onSubmit={schedule}>
          <p className="follow-up-intro field-wide">Set the next step for <strong>{lead.clientName}</strong>. The reminder goes to the owner&apos;s task list.</p>
          <NaturalDateField label="Type the follow-up date" placeholder="next Tuesday at 2pm, in a week, end of month..." onResolve={(result, resolvedTime) => { setDate(result.date); setTime(resolvedTime); }} />
          <Field label="Follow-up date" required><input type="date" value={date} min={reference.today} onChange={(event) => setDate(event.target.value)} required autoFocus /></Field>
          <Field label="Follow-up time" required><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></Field>
          <Field label="What needs to happen?" wide><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Call back about the revised proposal..." /></Field>
          <ErrorText message={error} />
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setMode(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><CalendarCheck2 size={15} /> {busy ? "Scheduling..." : "Save follow-up"}</button></div>
        </form>
      )}
    </section>
  );
}

const timelineFilters: { id: TimelineFilter; label: string; match: (type: LeadActivity["type"]) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "notes", label: "Notes", match: (type) => type === "note" },
  { id: "activities", label: "Activities", match: (type) => ["call", "email", "visit", "task"].includes(type) },
  { id: "changes", label: "Changes", match: (type) => !["note", "call", "email", "visit", "task"].includes(type) },
];

/** The deal's timeline, newest first, with Pipedrive's quick filters above it. */
function TimelineList({ activities }: { activities: LeadActivity[] }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const active = timelineFilters.find((item) => item.id === filter) ?? timelineFilters[0];
  const shown = activities.filter((activity) => active.match(activity.type));
  return (
    <div className="timeline-tab">
      {activities.length > 0 && (
        <div className="timeline-filters" role="group" aria-label="Show in the timeline">
          {timelineFilters.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}{item.id === "all" ? "" : ` (${activities.filter((activity) => item.match(activity.type)).length})`}
            </button>
          ))}
        </div>
      )}
      <div className="timeline-list">
        {shown.map((activity) => (
          <article className={`timeline-entry type-${activity.type}`} key={activity.id}>
            <span className="timeline-dot">{activityIcon(activity.type)}</span>
            <div>
              <div className="timeline-head"><strong>{activity.summary}</strong><span className="badge badge-muted">{activityLabels[activity.type]}</span></div>
              {activity.body && <RichText text={activity.body} className="timeline-body" />}
              <small>{activity.userName} · {formatDateTime(activity.occurredAt)} ({relativeTime(activity.occurredAt)})</small>
            </div>
          </article>
        ))}
        {!activities.length && <EmptyState icon={<History size={22} />} title="No activity yet" text="Add a note or log a call, an email or a visit to start the timeline." />}
        {activities.length > 0 && !shown.length && <p className="no-attachments">Nothing of this kind on the timeline yet.</p>}
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
