import { api, toQuery } from "@/lib/api";
import type { Task, TaskInput, TaskPatch, TaskStatus } from "./model";

export const fetchTasks = (query: { scope?: "mine" | "all"; status?: TaskStatus; leadId?: number } = {}) => api<{ tasks: Task[] }>(`/api/tasks${toQuery(query)}`);
export const createTask = (input: TaskInput) => api<{ task: Task }>("/api/tasks", { method: "POST", json: input });
export const updateTask = (id: number, changes: TaskPatch) => api<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", json: changes });
