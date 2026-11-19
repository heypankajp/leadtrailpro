"use client";

import { useMemo, useState } from "react";
import { Check, ListTodo } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState } from "@/features/shell/components";
import DateRangePicker from "@/features/shell/DateRangePicker";
import { taskActivityLabels, taskActivityTypes, type Task, type TaskActivityType } from "./model";
import { activityPeriodLabels, activityPeriods, inPeriod, ymdOf, type ActivityPeriod } from "./periods";
import { activityIcons } from "./ScheduleActivity";

/** The type chips of the List and the Calendar: All, then one per activity type. */
export function ActivityTypeChips({ value, onChange }: { value: TaskActivityType | null; onChange: (type: TaskActivityType | null) => void }) {
  return (
    <div className="activity-type-chips" role="group" aria-label="Activity type">
      <button type="button" className={value === null ? "is-active" : ""} aria-pressed={value === null} onClick={() => onChange(null)}>All</button>
      {taskActivityTypes.map((type) => (
        <button key={type} type="button" className={`activity-type-${type} ${value === type ? "is-active" : ""}`} aria-pressed={value === type} onClick={() => onChange(value === type ? null : type)}>{activityIcons[type]} {taskActivityLabels[type]}</button>
      ))}
    </div>
  );
}

/**
 * Activity List (request of November 18, 2026), after Pipedrive's Activities list: the activities in a table with their
 * deal, priority, contact person, email, phone and organization; filtered by type (All, Call, Email, Visit, Task) and by
 * period (To-do, Overdue, Today, Tomorrow, This week, Next week, or a period picked on the calendar).
 */
export default function ActivityList({ tasks, showAssignee, onToggle, onOpen }: {
  tasks: Task[]; showAssignee: boolean; onToggle: (task: Task) => void; onOpen: (task: Task) => void;
}) {
  const { can, openLead } = useApp();
  const [type, setType] = useState<TaskActivityType | null>(null);
  const [period, setPeriod] = useState<ActivityPeriod>("todo");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const today = ymdOf(new Date());
  const shown = useMemo(() => {
    const now = new Date();
    return tasks
      .filter((task) => !type || task.activityType === type)
      .filter((task) => inPeriod(task, period, today, now, period === "custom" ? custom : null))
      .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.id - b.id);
  }, [tasks, type, period, today, custom]);
  const nowIso = new Date().toISOString();
  const cell = (value: string | null | undefined, href?: string) => (value ? (href ? <a className="contact-link" href={href}>{value}</a> : <span>{value}</span>) : <span className="muted-cell">—</span>);

  return (
    <section className="panel leads-panel activity-list">
      <div className="activity-filters">
        <ActivityTypeChips value={type} onChange={setType} />
        <span className="deals-head-spacer" />
        <span className="activity-count" role="status">{shown.length} {shown.length === 1 ? "activity" : "activities"}</span>
        <div className="activity-period-chips" role="group" aria-label="Period">
          {activityPeriods.filter((item) => item !== "custom").map((item) => (
            <button key={item} type="button" className={period === item ? "is-active" : ""} aria-pressed={period === item} onClick={() => setPeriod(item)}>{activityPeriodLabels[item]}</button>
          ))}
          <span className={period === "custom" ? "activity-period-custom is-active" : "activity-period-custom"}>
            <DateRangePicker from={period === "custom" ? custom.from : ""} to={period === "custom" ? custom.to : ""} today={today} label="Select period"
              onChange={(from, to) => { if (from) { setCustom({ from, to }); setPeriod("custom"); } else { setCustom({ from: "", to: "" }); setPeriod("todo"); } }} />
          </span>
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<ListTodo size={20} />} title="No activities here" text="Change the type or the period to see more." />
      ) : (
        <div className="table-scroll">
          <table className="lead-table activity-table">
            <thead>
              <tr><th>DONE</th><th>SUBJECT</th><th>DEAL</th><th>PRIORITY</th><th>DUE</th><th>CONTACT PERSON</th><th>EMAIL</th><th>PHONE</th><th>ORGANIZATION</th>{showAssignee && <th>ASSIGNED TO</th>}</tr>
            </thead>
            <tbody>
              {shown.map((task) => {
                const overdue = task.status === "open" && task.dueAt !== null && task.dueAt < nowIso;
                return (
                  <tr key={task.id} className={task.status === "done" ? "activity-done" : overdue ? "activity-overdue" : ""}>
                    <td><button type="button" className={`activity-done-toggle ${task.status === "done" ? "is-done" : ""}`} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Mark ${task.title} as done`} title={task.status === "done" ? "Reopen" : "Mark as done"} disabled={!can("manage_tasks")} onClick={() => onToggle(task)}><Check size={12} /></button></td>
                    <td><button type="button" className={`activity-subject activity-${task.activityType}`} onClick={() => onOpen(task)}>{activityIcons[task.activityType]} <span>{task.title}</span></button>{task.outcome && <small className="activity-outcome-tag">{task.outcome}</small>}</td>
                    <td>{task.leadId ? <button type="button" className="link-button contact-link" onClick={() => openLead(task.leadId!)}>{task.leadName}</button> : <span className="muted-cell">—</span>}</td>
                    <td>{task.priority === "normal" ? <span className="muted-cell">—</span> : <span className={`priority-chip priority-chip-${task.priority}`}>{task.priority}</span>}</td>
                    <td><span className={overdue ? "overdue" : "muted-cell"}>{task.dueAt ? formatDateTime(task.dueAt) : "No due date"}</span></td>
                    <td>{cell(task.contactName)}</td>
                    <td>{cell(task.contactEmail, task.contactEmail ? `mailto:${task.contactEmail}` : undefined)}</td>
                    <td>{cell(task.contactPhone, task.contactPhone ? `tel:${task.contactPhone}` : undefined)}</td>
                    <td>{cell(task.organization)}</td>
                    {showAssignee && <td><span className="muted-cell">{task.assigneeName}</span></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
