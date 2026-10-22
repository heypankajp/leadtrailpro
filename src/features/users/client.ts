import { api } from "@/lib/api";
import type { LoginHistoryEntry } from "./session-types";
import type { CreateUserInput, UpdateUserInput, UserAccount, UserSummary } from "./model";

export const fetchUsers = () => api<{ users: UserAccount[] }>("/api/users");
/** Active people for pickers and @mentions; available to every signed-in user. */
export const fetchDirectory = () => api<{ users: UserSummary[] }>("/api/users?mode=directory");
export const fetchUser = (id: number) => api<{ user: UserAccount; loginHistory: LoginHistoryEntry[] }>(`/api/users/${id}`);
export const createUser = (input: CreateUserInput) => api<{ user: UserAccount }>("/api/users", { method: "POST", json: input });
export const updateUser = (id: number, input: UpdateUserInput) => api<{ user: UserAccount }>(`/api/users/${id}`, { method: "PATCH", json: input });
export const terminateUser = (id: number, reassignToUserId: number, reason: string) =>
  api<{ ok: true; leadsReassigned: number; tasksReassigned: number; user: UserAccount }>(`/api/users/${id}/terminate`, { method: "POST", json: { reassignToUserId, reason } });
export const setUserPassword = (id: number, password: string) => api<{ ok: true }>(`/api/users/${id}/password`, { method: "POST", json: { password } });
export const sendResetLink = (id: number) => api<{ ok: true; message: string }>(`/api/users/${id}/reset-link`, { method: "POST" });
