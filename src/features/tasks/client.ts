import { api, toQuery } from "@/lib/api";
import type { Task, TaskComment, TaskCommentInput, TaskInput, TaskPatch, TaskStatus } from "./model";

export const fetchTasks = (query: { scope?: "mine" | "all"; status?: TaskStatus; leadId?: number } = {}) => api<{ tasks: Task[] }>(`/api/tasks${toQuery(query)}`);
export const createTask = (input: TaskInput) => api<{ task: Task }>("/api/tasks", { method: "POST", json: input });
export const updateTask = (id: number, changes: TaskPatch) => api<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", json: changes });
export const fetchTaskComments = (taskId: number) => api<{ comments: TaskComment[] }>(`/api/tasks/${taskId}/comments`);
export const addTaskComment = (taskId: number, input: TaskCommentInput) => api<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, { method: "POST", json: input });
export const editTaskComment = (id: number, body: string) => api<{ comment: TaskComment }>(`/api/task-comments/${id}`, { method: "PATCH", json: { body } });
export const removeTaskComment = (id: number) => api<{ comment: TaskComment }>(`/api/task-comments/${id}`, { method: "DELETE" });
