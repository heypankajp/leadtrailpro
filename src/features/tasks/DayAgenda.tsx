"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAsyncData } from "@/lib/useAsyncData";
import { fetchTasks } from "./client";
import type { Task } from "./model";
import { addDays, dateOf, layoutDay, ymdOf } from "./periods";
import { activityIcons } from "./ScheduleActivity";

const hourHeight = 40;
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;
const ordinal = (day: number) => `${day}${day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th"}`;

/**
 * The day beside Schedule an activity (request of November 18, 2026): "Wednesday, November 18th" with
 * the previous and next day, the activity being scheduled as a blue banner, and the assignee's day as an hour grid with
 * the activity's time slot in it and a red line at the current time.
 */
export default function DayAgenda({ date, onDate, assigneeId, ownerLabel, draft, skipTaskId }: {
  date: string; onDate: (ymd: string) => void; assigneeId: number; ownerLabel?: string;
  draft: { title: string; icon: ReactNode; start: string; end: string } | null;
  /** The activity being edited, so it is not shown twice. */
  skipTaskId?: number;
}) {
  const range = { from: dateOf(date).toISOString(), to: dateOf(addDays(date, 1)).toISOString() };
  const fetcher = useCallback(() => fetchTasks({ assigneeId, from: range.from, to: range.to }), [assigneeId, range.from, range.to]);
  const { data } = useAsyncData(fetcher);
  const grid = useRef<HTMLDivElement>(null);
  const startMinute = draft?.start ? toMinutes(draft.start) : null;
  const endMinute = draft?.start ? (draft.end && toMinutes(draft.end) > toMinutes(draft.start) ? toMinutes(draft.end) : toMinutes(draft.start) + 30) : null;

  // Shows the slot being scheduled, or the morning.
  useEffect(() => {
    grid.current?.scrollTo({ top: Math.max(0, ((startMinute ?? 8 * 60) / 60 - 1) * hourHeight), behavior: "smooth" });
  }, [startMinute, date]);

  const items = (data?.tasks ?? [])
    .filter((task) => task.id !== skipTaskId && task.dueAt && ymdOf(new Date(task.dueAt)) === date)
    .map((task: Task) => {
      const start = minutesOf(new Date(task.dueAt!));
      const end = task.endsAt ? Math.max(minutesOf(new Date(task.endsAt)), start + 15) : start + 30;
      return { start, end: Math.min(end, 24 * 60), task, draft: false };
    });
  const laid = layoutDay([...items, ...(startMinute !== null && endMinute !== null ? [{ start: startMinute, end: endMinute, task: null as Task | null, draft: true }] : [])]);
  const today = ymdOf(new Date());
  const now = new Date();
  const heading = dateOf(date);

  return (
    <aside className="day-agenda" aria-label="The day's activities">
      <div className="day-agenda-head">
        <strong>{heading.toLocaleDateString("en-US", { weekday: "long" })}, {heading.toLocaleDateString("en-US", { month: "long" })} {ordinal(heading.getDate())}</strong>
        <button type="button" className="icon-button" aria-label="Previous day" title="Previous day" onClick={() => onDate(addDays(date, -1))}><ChevronLeft size={15} /></button>
        <button type="button" className="icon-button" aria-label="Next day" title="Next day" onClick={() => onDate(addDays(date, 1))}><ChevronRight size={15} /></button>
      </div>
      {ownerLabel && <small className="day-agenda-owner">{ownerLabel}</small>}
      {draft && <div className="day-agenda-banner">{draft.icon} <span>{draft.title || "New activity"}</span></div>}
      <div className="day-agenda-grid" ref={grid}>
        <div className="day-agenda-hours">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ height: hourHeight }}>{hour === 0 ? "" : hourLabel(hour)}</span>)}</div>
        <div className="day-agenda-column" style={{ height: hourHeight * 24 }}>
          {laid.map((item, index) => (
            <span
              key={item.task ? item.task.id : `draft-${index}`}
              className={`day-agenda-event ${item.draft ? "is-draft" : ""} ${item.task?.status === "done" ? "is-done" : ""}`}
              style={{ top: (item.start / 60) * hourHeight, height: Math.max(((item.end - item.start) / 60) * hourHeight - 2, 18), left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`, width: `calc(${100 / item.lanes}% - 4px)` }}
              title={item.task ? `${item.task.title}${item.task.leadName ? ` · ${item.task.leadName}` : ""}` : draft?.title}
            >
              {item.task ? <>{activityIcons[item.task.activityType]} {item.task.title}</> : <>{draft?.icon} {draft?.title || "New activity"}</>}
            </span>
          ))}
          {date === today && <span className="calendar-now" style={{ top: (minutesOf(now) / 60) * hourHeight }} aria-hidden="true"><i>{now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</i></span>}
        </div>
      </div>
    </aside>
  );
}
