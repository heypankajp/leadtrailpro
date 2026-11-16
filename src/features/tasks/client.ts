import { api, toQuery } from "@/lib/api";
import type { Task, TaskComment, TaskCommentInput, TaskInput, TaskPatch, TaskStatus } from "./model";

/** `assigneeId`, `from`, `to` (ISO times): one person's day for the Schedule an activity agenda (PD-29); the answer names whose tasks they are. */
export const fetchTasks = (query: { scope?: "mine" | "all"; status?: TaskStatus; leadId?: number; assigneeId?: number; from?: string; to?: string } = {}) => api<{ tasks: Task[]; assigneeId: number | null }>(`/api/tasks${toQuery(query)}`);
export const createTask = (input: TaskInput) => api<{ task: Task }>("/api/tasks", { method: "POST", json: input });
export const updateTask = (id: number, changes: TaskPatch) => api<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", json: changes });
export const fetchTaskComments = (taskId: number) => api<{ comments: TaskComment[] }>(`/api/tasks/${taskId}/comments`);
export const addTaskComment = (taskId: number, input: TaskCommentInput) => api<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, { method: "POST", json: input });
export const editTaskComment = (id: number, body: string) => api<{ comment: TaskComment }>(`/api/task-comments/${id}`, { method: "PATCH", json: { body } });
export const removeTaskComment = (id: number) => api<{ comment: TaskComment }>(`/api/task-comments/${id}`, { method: "DELETE" });
