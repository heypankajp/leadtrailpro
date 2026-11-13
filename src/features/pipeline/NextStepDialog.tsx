"use client";

import { useState, type FormEvent } from "react";
import { CalendarCheck2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { fromLocalInput } from "@/lib/format";
import { updateLead } from "@/features/leads/client";
import { stageFollowUpActivities, type StageFollowUpActivity } from "@/features/settings/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import { createTask } from "@/features/tasks/client";
import NaturalDateField from "@/features/tasks/NaturalDateField";
import { activityTitles, defaultNextStep } from "./model";

export type NextStepLead = { id: number; clientName: string; clientExecutive: string; ownerId: number; stageCode: string | null; stage: string | null; followUpDate: string | null };

/**
 * PIPE-09: "What's next?" after a logged call, email, or visit, a BD action, or a stage move. Pre-filled from the stage's
 * suggestion under Settings → Pipeline (else a follow-up on the next working day); Skip is one click. Saving creates the task
 * for the chosen person and, unless unticked, sets the lead's follow-up date to the same day.
 */
export default function NextStepDialog({ lead, reason, onClose, onSaved }: { lead: NextStepLead; reason: string; onClose: () => void; onSaved: (message: string) => void }) {
  const { reference } = useApp();
  const suggested = defaultNextStep(lead.stageCode, reference.pipeline, reference.today, reference.holidays, { executive: lead.clientExecutive, client: lead.clientName });
  const who = lead.clientExecutive?.trim() || lead.clientName;
  const [activity, setActivity] = useState<StageFollowUpActivity>(suggested.activity);
  const [title, setTitle] = useState(suggested.title);
  const [date, setDate] = useState(suggested.date);
  const [time, setTime] = useState("09:00");
  const [assigneeId, setAssigneeId] = useState(String(lead.ownerId));
  const [setFollowUp, setSetFollowUp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const people = reference.users.filter((item) => item.role !== "recruiter");

  const changeActivity = (next: StageFollowUpActivity) => {
    setActivity(next);
    if (!title.trim() || title === `${activityTitles[activity]} ${who}`) setTitle(`${activityTitles[next]} ${who}`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const finalTitle = title.trim() || suggested.title;
    try {
      await createTask({ leadId: lead.id, title: finalTitle, description: "", assigneeId: Number(assigneeId) || lead.ownerId, dueAt: fromLocalInput(`${date}T${time}`), priority: "normal", checklist: [] });
      if (setFollowUp) await updateLead(lead.id, { followUpDate: date });
      onSaved(`Next step saved: ${finalTitle} on ${date}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the next step."));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`What's next for ${lead.clientName}?`} eyebrow="NEXT STEP" size="narrow" onClose={onClose}>
      <form className="stack-form next-step-form" onSubmit={submit}>
        <p className="dialog-description">
          {reason}{" "}
          {suggested.fromStage
            ? `The ${lead.stage ?? "current"} stage suggests ${suggested.activity === "task" ? "a follow-up" : `a${suggested.activity === "email" ? "n" : ""} ${suggested.activity}`} ${suggested.businessDays === 0 ? "today" : `in ${suggested.businessDays} business day${suggested.businessDays === 1 ? "" : "s"}`}.`
            : "Every deal on the board should carry a next step; skip if nothing is due."}
        </p>
        <Field label="Type">
          <select value={activity} onChange={(event) => changeActivity(event.target.value as StageFollowUpActivity)}>
            {stageFollowUpActivities.map((item) => <option key={item} value={item}>{item === "task" ? "Task" : activityTitles[item]}</option>)}
          </select>
        </Field>
        <Field label="Next step" required><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /></Field>
        <NaturalDateField label="Type the date" placeholder="tomorrow, next Tuesday at 2pm, in two weeks..." onResolve={(result, resolvedTime) => { setDate(result.date); setTime(resolvedTime); }} />
        <Field label="Due date" required><input type="date" value={date} min={reference.today} onChange={(event) => setDate(event.target.value)} required /></Field>
        <Field label="Time" required><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></Field>
        <Field label="Assigned to">
          <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            {people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <label className="checklist-item"><input type="checkbox" checked={setFollowUp} onChange={(event) => setSetFollowUp(event.target.checked)} /><span>Also set it as the deal&apos;s follow-up date</span></label>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Skip</button>
          <button type="submit" className="button button-primary" disabled={busy}><CalendarCheck2 size={14} /> {busy ? "Saving..." : "Save next step"}</button>
        </div>
      </form>
    </Dialog>
  );
}
