"use client";

import { useCallback, useState } from "react";
import { CalendarDays, Check, LayoutDashboard, List, ListTodo, MessageSquare, Pencil, Plus } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, localToday } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState, ErrorText, Loading } from "@/features/shell/components";
import { fetchTasks, updateTask } from "./client";
import type { Task, TaskActivityType } from "./model";
import TaskFormDialog from "./TaskFormDialog";
import ActivityCalendar from "./ActivityCalendar";
import ActivityList from "./ActivityList";

type Column = { title: string; tone: string; tasks: Task[] };

/**
 * Activities in three views (request of November 18, 2026), switched by the icons at the top right, whose names show on
 * hover: Activity Dashboard (the columns Overdue, Today, Upcoming, Done), Activity List (a table with type and period
 * filters) and Activity Calendar (a week). The address carries the view: #/activities, #/activities/list,
 * #/activities/calendar; #/activities/<id> opens that task on the dashboard.
 */
type ActivityView = "dashboard" | "list" | "calendar";
const views: { id: ActivityView; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Activity Dashboard", icon: <LayoutDashboard size={16} /> },
  { id: "list", label: "Activity List", icon: <List size={16} /> },
  { id: "calendar", label: "Activity Calendar", icon: <CalendarDays size={16} /> },
];

export default function TasksPage() {
  const { can, user, route, navigate, openLead, notify, dataVersion, bumpData } = useApp();
  const view: ActivityView = route.param === "list" ? "list" : route.param === "calendar" ? "calendar" : "dashboard";
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const fetcher = useCallback(() => fetchTasks({ scope }).then((result) => result.tasks), [scope]);
  const { data: tasks, error } = useAsyncData<Task[]>(fetcher, dataVersion);
  const [dialog, setDialog] = useState<{ task?: Task; defaults?: { title: string; activityType: TaskActivityType; dueAt: string; endsAt: string } } | null>(null);
  const [consumedParam, setConsumedParam] = useState<string | null>(null);

  // Deep link from the action center: #/tasks/<id> opens that task once the list is loaded.
  if (route.param && /^\d+$/.test(route.param) && tasks && consumedParam !== route.param) {
    setConsumedParam(route.param);
    const task = tasks.find((item) => item.id === Number(route.param));
    if (task) setDialog({ task });
  }

  const toggle = async (task: Task) => {
    try {
      await updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
      bumpData();
      notify(task.status === "done" ? "Task reopened" : "Task completed");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const nowIso = new Date().toISOString();
  const today = localToday();
  const open = (tasks ?? []).filter((task) => task.status === "open");
  const columns: Column[] = [
    { title: "Overdue", tone: "red", tasks: open.filter((task) => task.dueAt && task.dueAt < nowIso && !task.dueAt.startsWith(today) && new Date(task.dueAt).toDateString() !== new Date().toDateString()) },
    { title: "Today", tone: "blue", tasks: open.filter((task) => task.dueAt && new Date(task.dueAt).toDateString() === new Date().toDateString()) },
    { title: "Upcoming", tone: "green", tasks: open.filter((task) => !task.dueAt || (new Date(task.dueAt).toDateString() !== new Date().toDateString() && task.dueAt >= nowIso)) },
    { title: "Done", tone: "muted", tasks: (tasks ?? []).filter((task) => task.status === "done").slice(0, 25) },
  ];

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">YOUR WORKDAY <span className="eyebrow-dot">·</span> {open.length} OPEN</div><h1>{views.find((item) => item.id === view)!.label}</h1><p>Every next step, organized so nothing slips through the cracks.</p></div>
        <div className="heading-actions">
          <div className="view-switch" role="group" aria-label="Activities view">
            {views.map((item) => (
              <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} aria-pressed={view === item.id} aria-label={item.label} title={item.label} onClick={() => navigate("activities", item.id === "dashboard" ? null : item.id)}>{item.icon}</button>
            ))}
          </div>
          {can("view_team_reports") && (
            <div className="scope-toggle" role="group" aria-label="Task scope"><button className={scope === "mine" ? "is-active" : ""} onClick={() => setScope("mine")}>Mine</button><button className={scope === "all" ? "is-active" : ""} onClick={() => setScope("all")}>Team</button></div>
          )}
          {can("manage_tasks") && <button className="button button-primary" onClick={() => setDialog({})}><Plus size={17} /> Schedule an Activity</button>}
        </div>
      </div>
      <ErrorText message={error} />
      {!tasks && !error && <Loading text="Loading tasks..." />}
      {tasks && view === "list" && (
        <ActivityList tasks={tasks} showAssignee={scope === "all"} onToggle={(task) => void toggle(task)} onOpen={(task) => (can("manage_tasks") ? setDialog({ task }) : task.leadId && openLead(task.leadId))} />
      )}
      {tasks && view === "calendar" && (
        <ActivityCalendar
          tasks={tasks} showAssignee={scope === "all"} assigneeId={user.id}
          onOpen={(task) => (can("manage_tasks") ? setDialog({ task }) : task.leadId && openLead(task.leadId))}
          onDetails={(defaults) => setDialog({ defaults })}
          onAdded={(message) => { bumpData(); notify(message); }}
        />
      )}
      {tasks && view === "dashboard" && (
        <div className="task-columns">
          {columns.map((column) => (
            <section className="panel task-column" key={column.title}>
              <div className="task-column-heading"><h2><i className={`task-dot task-${column.tone}`} />{column.title}</h2><span>{column.tasks.length}</span></div>
              {column.tasks.length === 0 && <EmptyState icon={<ListTodo size={18} />} title={column.title === "Done" ? "Nothing completed yet" : "Nothing here"} />}
              {column.tasks.map((task) => (
                <article className="task-card" key={task.id}>
                  <button className={`task-checkbox ${task.status === "done" ? "is-done" : ""}`} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={!can("manage_tasks")} onClick={() => void toggle(task)}><Check size={13} /></button>
                  <div className="task-card-content">
                    <strong className={task.status === "done" ? "is-done" : ""}>{task.title}</strong>
                    <small>
                      {task.leadName ? <button type="button" className="link-button" onClick={() => task.leadId && openLead(task.leadId)}>{task.leadName}</button> : "No deal"}
                      {" · "}{task.dueAt ? formatDateTime(task.dueAt) : "No due date"}{scope === "all" ? ` · ${task.assigneeName}` : ""}
                    </small>
                    {(task.checklist.length > 0 || task.commentCount > 0) && (
                      <small>
                        {task.checklist.length > 0 ? `${task.checklist.filter((item) => item.done).length}/${task.checklist.length} checklist items done` : ""}
                        {task.checklist.length > 0 && task.commentCount > 0 ? " · " : ""}
                        {task.commentCount > 0 ? <span className="task-comment-count"><MessageSquare size={10} /> {task.commentCount} comment{task.commentCount === 1 ? "" : "s"}</span> : null}
                      </small>
                    )}
                    <span className={`priority priority-${task.priority}`}>{task.priority} priority</span>
                  </div>
                  {can("manage_tasks") && <button className="row-more" aria-label={`Edit ${task.title}`} onClick={() => setDialog({ task })}><Pencil size={15} /></button>}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
      {dialog && <TaskFormDialog task={dialog.task} defaults={dialog.defaults} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); bumpData(); notify(dialog.task ? "Task updated" : "Task created"); }} />}
    </>
  );
}
