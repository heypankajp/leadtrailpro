import { api, toQuery } from "@/lib/api";
import type { Task, TaskAttachment, TaskComment, TaskCommentInput, TaskInput, TaskPatch, TaskStatus } from "./model";

/** `assigneeId`, `from`, `to` (ISO times): one person's day for the Schedule an activity agenda (PD-29); the answer names whose tasks they are. */
export const fetchTasks = (query: { scope?: "mine" | "all"; status?: TaskStatus; leadId?: number; assigneeId?: number; from?: string; to?: string } = {}) => api<{ tasks: Task[]; assigneeId: number | null }>(`/api/tasks${toQuery(query)}`);
export const createTask = (input: TaskInput) => api<{ task: Task }>("/api/tasks", { method: "POST", json: input });
export const updateTask = (id: number, changes: TaskPatch) => api<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", json: changes });
export const fetchTaskComments = (taskId: number) => api<{ comments: TaskComment[] }>(`/api/tasks/${taskId}/comments`);
export const addTaskComment = (taskId: number, input: TaskCommentInput) => api<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, { method: "POST", json: input });
export const editTaskComment = (id: number, body: string) => api<{ comment: TaskComment }>(`/api/task-comments/${id}`, { method: "PATCH", json: { body } });
export const removeTaskComment = (id: number) => api<{ comment: TaskComment }>(`/api/task-comments/${id}`, { method: "DELETE" });

// Files on an activity (Schedule an activity, request of November 18, 2026).
export const fetchTaskAttachments = (taskId: number) => api<{ attachments: TaskAttachment[] }>(`/api/tasks/${taskId}/attachments`);
export async function uploadTaskAttachment(taskId: number, file: File): Promise<{ attachment: TaskAttachment }> {
  const body = new FormData();
  body.append("file", file);
  return api<{ attachment: TaskAttachment }>(`/api/tasks/${taskId}/attachments`, { method: "POST", body });
}
export const removeTaskAttachment = (id: number) => api<{ ok: true }>(`/api/task-attachments/${id}`, { method: "DELETE" });
export const taskAttachmentUrl = (id: number, download = false) => `/api/task-attachments/${id}${download ? "?download=1" : ""}`;
