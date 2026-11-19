"use client";

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Building2, CalendarCheck2, Target, CircleDollarSign, Clock3, Flag, Mail, MapPin, Phone, UserRound, Users, UtensilsCrossed } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { fromLocalInput } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { updateLead } from "@/features/leads/client";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import { createTask, fetchTasks } from "./client";
import DayAgenda from "./DayAgenda";
import { taskActivityLabels, taskActivityTypes, taskPriorities, taskTitleWords, type Task, type TaskActivityType, type TaskPriority } from "./model";

/** The deal an activity is scheduled on: a board card or the deal itself. */
export type ActivityDeal = { id: number; clientName: string; clientExecutive: string; ownerId: number; followUpDate: string | null };

export const activityIcons: Record<TaskActivityType, ReactNode> = {
  call: <Phone size={14} />, meeting: <Users size={14} />, task: <Clock3 size={14} />, deadline: <Flag size={14} />,
  email: <Mail size={14} />, lunch: <UtensilsCrossed size={14} />, visit: <MapPin size={14} />,
};


/**
 * Schedule an activity (PD-29, SPEC §10.20), after Pipedrive's form: the type (call, email, visit, task) with a title
 * that follows it, a date with a start and an optional end time, priority, who does it, a note, the deal / contact /
 * organization it belongs to, and Mark as done. On the right, the assignee's day. Saving creates the task; an open one
 * also moves the deal's next follow-up to its date (the old Schedule follow-up), a done one is recorded on the timeline.
 */
export function ScheduleActivityForm({ deal, canSetFollowUp, onCancel, onSaved }: { deal: ActivityDeal; canSetFollowUp: boolean; onCancel: () => void; onSaved: (message: string) => void | Promise<void> }) {
  const { reference, user } = useApp();
  const who = deal.clientExecutive.trim() || deal.clientName;
  const titleFor = (type: TaskActivityType) => `${taskTitleWords[type]} ${who}`;
  const [type, setType] = useState<TaskActivityType>("call");
  const [title, setTitle] = useState(titleFor("call"));
  const [date, setDate] = useState(deal.followUpDate && deal.followUpDate >= reference.today ? deal.followUpDate : reference.today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const [assigneeId, setAssigneeId] = useState(String(owners.some((item) => item.id === deal.ownerId) ? deal.ownerId : user.id));
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  // What came of it, when the activity is recorded as done (List of Values → Activity Outcome).
  const [outcomeId, setOutcomeId] = useState("");
  const outcomes = reference.listValues.activity_outcome.filter((item) => item.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const changeType = (next: TaskActivityType) => {
    // The title follows the type until the person writes their own.
    if (!title.trim() || title === titleFor(type)) setTitle(titleFor(next));
    setType(next);
  };

  // The assignee's day, for the agenda on the right.
  const range = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return { from: new Date(y, m - 1, d).toISOString(), to: new Date(y, m - 1, d + 1).toISOString() };
  }, [date]);
  const agendaFetcher = useCallback(() => (date ? fetchTasks({ assigneeId: Number(assigneeId), from: range.from, to: range.to }) : Promise.resolve({ tasks: [] as Task[], assigneeId: null })), [assigneeId, date, range]);
  const { data: agenda } = useAsyncData(agendaFetcher);
  // Someone else's day needs team rights; without them the answer is the person's own day, and the heading says so.
  const shownId = agenda?.assigneeId ?? Number(assigneeId);
  const agendaOwner = shownId === user.id ? "Your day" : `${owners.find((item) => item.id === shownId)?.name ?? "Their"}'s day`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (end && end <= start) { setError("The end time must be after the start."); return; }
    setBusy(true);
    setError("");
    try {
      await createTask({
        leadId: deal.id, title: title.trim() || titleFor(type), description: note, assigneeId: Number(assigneeId) || deal.ownerId, priority, checklist: [],
        dueAt: fromLocalInput(`${date}T${start}`), endsAt: end ? fromLocalInput(`${date}T${end}`) : null, activityType: type, done,
        outcomeId: done && outcomeId ? Number(outcomeId) : null,
      });
      // An open activity is the deal's next step, as Schedule follow-up was.
      if (!done && canSetFollowUp) await updateLead(deal.id, { followUpDate: date });
      await onSaved(done ? `${taskActivityLabels[type]} recorded as done` : `${taskActivityLabels[type]} scheduled for ${date}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <form className="schedule-activity" onSubmit={submit}>
      <div className="schedule-activity-main">
        <Field label="Title" wide><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus /></Field>
        <div className="activity-types" role="group" aria-label="Activity type">
          {taskActivityTypes.map((item) => (
            <button key={item} type="button" className={type === item ? "is-active" : ""} aria-pressed={type === item} onClick={() => changeType(item)}>{activityIcons[item]} {taskActivityLabels[item]}</button>
          ))}
        </div>
        <div className="activity-when">
          <Field label="Date" required><input type="date" value={date} min={done ? undefined : reference.today} max={done ? reference.today : undefined} onChange={(event) => setDate(event.target.value)} required /></Field>
          <Field label="From" required><input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></Field>
          <Field label="To"><input type="time" value={end} min={start} onChange={(event) => setEnd(event.target.value)} /></Field>
        </div>
        <div className="activity-when">
          <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{taskPriorities.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></Field>
          <Field label="Assigned to">
            <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              {owners.map((item) => <option key={item.id} value={item.id}>{item.id === user.id ? `${item.name} (you)` : item.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Note" wide><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} placeholder="What needs to happen, what to bring, the number to call..." /></Field>
        <ul className="activity-links" aria-label="Linked to">
          <li><CircleDollarSign size={14} /> <span>Deal</span> <strong>{deal.clientName}</strong></li>
          <li><UserRound size={14} /> <span>Contact</span> <strong>{deal.clientExecutive || "No contact yet"}</strong></li>
          <li><Building2 size={14} /> <span>Organization</span> <strong>{deal.clientName}</strong></li>
        </ul>
        {done && (
          <label className="activity-outcome">
            <Target size={16} aria-hidden="true" />
            <select aria-label="Outcome" value={outcomeId} onChange={(event) => setOutcomeId(event.target.value)}>
              <option value="">Outcome: None</option>
              {outcomes.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          </label>
        )}
        <ErrorText message={error} />
        <div className="modal-actions activity-actions">
          <label className="checklist-item activity-done"><input type="checkbox" checked={done} onChange={(event) => { setDone(event.target.checked); if (event.target.checked && date > reference.today) setDate(reference.today); }} /> Mark as done</label>
          <button type="button" className="button button-outline" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><CalendarCheck2 size={15} /> {busy ? "Saving..." : "Save activity"}</button>
        </div>
      </div>
      {/* The assignee's day, as in the full Schedule an activity dialog. */}
      <DayAgenda
        date={date} onDate={(next) => setDate((current) => (done ? (next > reference.today ? current : next) : (next >= reference.today ? next : current)))}
        assigneeId={shownId} ownerLabel={agendaOwner} draft={{ title: title || taskActivityLabels[type], icon: activityIcons[type], start, end }}
      />
    </form>
  );
}

/** The same form as a dialog: the board card's Add follow-up (PD-22, PD-29). */
export function ScheduleActivityDialog({ deal, canSetFollowUp, onClose, onSaved }: { deal: ActivityDeal; canSetFollowUp: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  return (
    <Dialog title="Schedule an Activity" eyebrow={deal.clientName.toUpperCase()} size="wide" onClose={onClose}>
      <ScheduleActivityForm deal={deal} canSetFollowUp={canSetFollowUp} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}
