"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { fetchLeads } from "@/features/leads/client";
import type { LeadSummary } from "@/features/leads/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import { createTask, updateTask } from "./client";
import { taskPriorities, type ChecklistItem, type Task, type TaskPriority } from "./model";
import NaturalDateField from "./NaturalDateField";

type Props = { task?: Task; leadId?: number | null; leadName?: string | null; defaultAssigneeId?: number; onClose: () => void; onSaved: (task: Task) => void };

export default function TaskFormDialog({ task, leadId, leadName, defaultAssigneeId, onClose, onSaved }: Props) {
  const { reference, user } = useApp();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(String(task?.assigneeId ?? defaultAssigneeId ?? user.id));
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [lead, setLead] = useState<{ id: number; name: string } | null>(task?.leadId ? { id: task.leadId, name: task.leadName ?? `Lead ${task.leadId}` } : leadId ? { id: leadId, name: leadName ?? `Lead ${leadId}` } : null);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = leadSearch.trim();
    if (!term) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchLeads({ q: term, pageSize: 6 }).then((page) => { if (!cancelled) setLeadResults(page.leads); }).catch(() => undefined);
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [leadSearch]);
  const visibleResults = leadSearch.trim() ? leadResults : [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const input = { leadId: lead?.id ?? null, title: title.trim(), description: description.trim(), assigneeId: Number(assigneeId), dueAt: fromLocalInput(dueAt), priority, checklist };
    try {
      const result = task ? await updateTask(task.id, input) : await createTask(input);
      onSaved(result.task);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the task."));
      setBusy(false);
    }
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setChecklist((current) => [...current, { text, done: false }]);
    setNewItem("");
  };

  return (
    <Dialog title={task ? "Edit task" : "Create task"} eyebrow={lead ? `LEAD · ${lead.name.toUpperCase()}` : "TASKS & REMINDERS"} onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Title" required wide><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder="Follow up on the staffing proposal" autoFocus /></Field>
        <Field label="Assignee" required>
          <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>{reference.users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
        </Field>
        <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{taskPriorities.map((option) => <option key={option} value={option}>{option[0].toUpperCase()}{option.slice(1)}</option>)}</select></Field>
        <NaturalDateField onResolve={(result, time) => setDueAt(`${result.date}T${time}`)} />
        <Field label="Due date and time" hint="Confirm or adjust the date before saving."><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field>
        <Field label="Lead" hint={lead ? undefined : "Optional. Search by client name."}>
          {lead ? (
            <span className="chip-value">{lead.name}{!leadId && <button type="button" aria-label="Remove lead" onClick={() => setLead(null)}><X size={12} /></button>}</span>
          ) : (
            <span className="lead-picker">
              <span className="search-field"><Search size={14} /><input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search leads..." /></span>
              {visibleResults.length > 0 && (
                <span className="lead-picker-results">
                  {visibleResults.map((result) => <button type="button" key={result.id} onClick={() => { setLead({ id: result.id, name: result.clientName }); setLeadSearch(""); setLeadResults([]); }}>{result.clientName} <small>{result.ownerName}</small></button>)}
                </span>
              )}
            </span>
          )}
        </Field>
        <Field label="Description" wide><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} placeholder="What needs to happen?" /></Field>
        <div className="field-wide checklist-editor">
          <span className="field-label">Checklist</span>
          {checklist.map((item, index) => (
            <label key={`${item.text}-${index}`} className="checklist-item">
              <input type="checkbox" checked={item.done} onChange={(event) => setChecklist((current) => current.map((entry, position) => position === index ? { ...entry, done: event.target.checked } : entry))} />
              <span className={item.done ? "is-done" : ""}>{item.text}</span>
              <button type="button" aria-label={`Remove ${item.text}`} onClick={() => setChecklist((current) => current.filter((_, position) => position !== index))}><X size={12} /></button>
            </label>
          ))}
          <span className="checklist-add">
            <input value={newItem} onChange={(event) => setNewItem(event.target.value)} maxLength={200} placeholder="Add a checklist item" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} />
            <button type="button" className="button button-outline button-small" onClick={addItem}><Plus size={13} /> Add</button>
          </span>
        </div>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : task ? "Save task" : "Create task"}</button>
        </div>
      </form>
    </Dialog>
  );
}
