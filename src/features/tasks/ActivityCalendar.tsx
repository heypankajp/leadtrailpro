"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { createTask } from "./client";
import { taskActivityLabels, taskActivityTypes, type Task, type TaskActivityType } from "./model";
import { addDays, dateOf, layoutDay, weekLabel, weekStart, ymdOf } from "./periods";
import { ActivityTypeChips } from "./ActivityList";
import { activityIcons } from "./ScheduleActivity";

const hourHeight = 48;
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;
const timeLabel = (date: Date) => date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** A new activity being added from an empty slot: its start, its type and subject, and where the box is drawn. */
type Draft = { start: Date; type: TaskActivityType; title: string; top: number; left: number };

/**
 * Activity Calendar (request of November 18, 2026): a week, Sunday to Saturday, with an hour grid; each
 * activity sits at its time (30 minutes when it has no end; overlapping ones side by side). Activities due at midnight
 * with no end are all-day and sit in the row under the days. A click on an empty slot opens a small box to add an activity
 * there (type, subject, 30 minutes) with Add, or Details... for the full form; a click on an activity opens it.
 */
export default function ActivityCalendar({ tasks, showAssignee, assigneeId, onOpen, onDetails, onAdded }: {
  tasks: Task[]; showAssignee: boolean; assigneeId: number;
  onOpen: (task: Task) => void;
  onDetails: (defaults: { title: string; activityType: TaskActivityType; dueAt: string; endsAt: string }) => void;
  onAdded: (message: string) => void;
}) {
  const { can, notify } = useApp();
  const today = ymdOf(new Date());
  const [start, setStart] = useState(() => weekStart(today));
  const [type, setType] = useState<TaskActivityType | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const grid = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  // Opens on 7 AM, and the red line follows the time.
  useEffect(() => { grid.current?.scrollTo({ top: hourHeight * 7 }); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);

  const placed = useMemo(() => {
    const byDay: Record<string, { timed: ReturnType<typeof layoutDay<{ start: number; end: number; task: Task }>>; allDay: Task[] }> = {};
    for (const day of days) byDay[day] = { timed: [], allDay: [] };
    const timed: Record<string, { start: number; end: number; task: Task }[]> = {};
    for (const task of tasks) {
      if (!task.dueAt || (type && task.activityType !== type)) continue;
      const due = new Date(task.dueAt);
      const day = ymdOf(due);
      if (!byDay[day]) continue;
      const startMinute = minutesOf(due);
      if (startMinute === 0 && !task.endsAt) { byDay[day].allDay.push(task); continue; }
      const end = task.endsAt ? new Date(task.endsAt) : null;
      const endMinute = end && ymdOf(end) === day ? Math.max(minutesOf(end), startMinute + 15) : end ? 24 * 60 : startMinute + 30;
      (timed[day] ??= []).push({ start: startMinute, end: Math.min(endMinute, 24 * 60), task });
    }
    for (const day of days) byDay[day].timed = layoutDay(timed[day] ?? []);
    return byDay;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `days` follows `start`
  }, [tasks, type, start]);

  /** A click on an empty slot: the half hour under the pointer. */
  const openDraft = (day: string, event: MouseEvent<HTMLDivElement>) => {
    if (!can("manage_tasks")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minute = Math.max(0, Math.min(23 * 60 + 30, Math.floor(((event.clientY - rect.top) / hourHeight) * 2) * 30));
    const at = dateOf(day);
    at.setMinutes(minute);
    const width = 300;
    const left = Math.max(8, Math.min(event.clientX - width / 2, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(event.clientY + 12, window.innerHeight - 220));
    setDraft({ start: at, type: "call", title: taskActivityLabels.call, top, left });
  };
  const draftEnd = draft ? new Date(draft.start.getTime() + 30 * 60_000) : null;
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !draftEnd) return;
    setBusy(true);
    try {
      await createTask({ leadId: null, title: draft.title.trim() || taskActivityLabels[draft.type], description: "", assigneeId, dueAt: draft.start.toISOString(), endsAt: draftEnd.toISOString(), activityType: draft.type, priority: "normal", checklist: [] });
      setDraft(null);
      onAdded(`${draft.title.trim() || taskActivityLabels[draft.type]} added for ${draft.start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`);
    } catch (caught) {
      notify(errorMessage(caught, "Could not add the activity."), "error");
    } finally {
      setBusy(false);
    }
  };
  // The box closes on Escape.
  useEffect(() => {
    if (!draft) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDraft(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [draft]);

  const nowMinute = minutesOf(now);
  return (
    <section className="panel activity-calendar">
      <div className="activity-filters">
        <ActivityTypeChips value={type} onChange={setType} />
        <span className="deals-head-spacer" />
        <div className="calendar-nav">
          <strong className="calendar-range">{weekLabel(start)}</strong>
          <button type="button" className="icon-button" aria-label="Previous week" title="Previous week" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} /></button>
          <button type="button" className="button button-outline button-small" onClick={() => setStart(weekStart(today))}>Today</button>
          <button type="button" className="icon-button" aria-label="Next week" title="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="calendar-head">
        <span className="calendar-corner">{dateOf(start).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
        {days.map((day) => (
          <span key={day} className={`calendar-day-name ${day === today ? "is-today" : ""}`}>
            {dateOf(day).toLocaleDateString("en-US", { weekday: "short" })} <b>{dateOf(day).getDate()}</b>
          </span>
        ))}
      </div>
      <div className="calendar-allday">
        <span className="calendar-corner">All day</span>
        {days.map((day) => (
          <div key={day} className="calendar-allday-cell">
            {placed[day].allDay.map((task) => (
              <button key={task.id} type="button" className={`calendar-event is-allday ${task.status === "done" ? "is-done" : ""}`} title={task.title} onClick={() => onOpen(task)}>{activityIcons[task.activityType]} <span>{task.title}</span></button>
            ))}
          </div>
        ))}
      </div>
      <div className="calendar-grid" ref={grid}>
        <div className="calendar-hours">
          {hours.map((hour) => <span key={hour} style={{ height: hourHeight }}>{hour === 0 ? "" : hourLabel(hour)}</span>)}
        </div>
        {days.map((day) => (
          <div key={day} className="calendar-column" style={{ height: hourHeight * 24 }} onClick={(event) => { if (event.target === event.currentTarget) openDraft(day, event); }} title={can("manage_tasks") ? "Click to add an activity" : undefined}>
            {placed[day].timed.map(({ task, start: from, end, lane, lanes }) => (
              <button
                key={task.id} type="button" className={`calendar-event ${task.status === "done" ? "is-done" : ""}`}
                style={{ top: (from / 60) * hourHeight, height: Math.max(((end - from) / 60) * hourHeight - 2, 20), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                title={`${task.title}${task.leadName ? ` · ${task.leadName}` : ""}${showAssignee ? ` · ${task.assigneeName}` : ""}`}
                onClick={() => onOpen(task)}
              >
                <span className="calendar-event-title">{activityIcons[task.activityType]} {task.title}</span>
                {end - from >= 45 && <small>{timeLabel(new Date(task.dueAt!))}{task.leadName ? ` · ${task.leadName}` : ""}{showAssignee ? ` · ${task.assigneeName}` : ""}</small>}
              </button>
            ))}
            {day === today && <span className="calendar-now" style={{ top: (nowMinute / 60) * hourHeight }} aria-hidden="true"><i>{timeLabel(now)}</i></span>}
          </div>
        ))}
      </div>
      {draft && draftEnd && createPortal(
        <>
          <button type="button" className="calendar-draft-scrim" aria-label="Close" onClick={() => setDraft(null)} />
          <form className="calendar-draft" style={{ top: draft.top, left: draft.left }} onSubmit={add} role="dialog" aria-label="Add an activity">
            <div className="calendar-draft-types" role="group" aria-label="Activity type">
              {taskActivityTypes.map((item) => (
                <button key={item} type="button" className={`activity-type-${item} ${draft.type === item ? "is-active" : ""}`} aria-pressed={draft.type === item} title={taskActivityLabels[item]}
                  onClick={() => setDraft({ ...draft, type: item, title: !draft.title.trim() || draft.title === taskActivityLabels[draft.type] ? taskActivityLabels[item] : draft.title })}>{activityIcons[item]}</button>
              ))}
            </div>
            <input aria-label="Subject" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={200} autoFocus />
            <p className="calendar-draft-time">{timeLabel(draft.start)} → {timeLabel(draftEnd)}, {draft.start.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p>
            <div className="calendar-draft-actions">
              <button type="button" className="button button-outline button-small" onClick={() => { const defaults = { title: draft.title.trim() || taskActivityLabels[draft.type], activityType: draft.type, dueAt: draft.start.toISOString(), endsAt: draftEnd.toISOString() }; setDraft(null); onDetails(defaults); }}>Details...</button>
              <button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? "Adding..." : "Add"}</button>
            </div>
          </form>
        </>,
        document.body,
      )}
    </section>
  );
}
