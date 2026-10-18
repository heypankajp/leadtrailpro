import { api } from "@/lib/api";
import type { CreateUserInput, UserAccount } from "@/features/users/model";

export type SessionResponse = { user: UserAccount | null; needsSetup: boolean };
export type LoginResponse = { user?: UserAccount; requiresTwoFactor?: boolean; email?: string };

export const getSession = () => api<SessionResponse>("/api/auth/session");
export const login = (email: string, password: string) => api<LoginResponse>("/api/auth/login", { method: "POST", json: { email, password } });
export const verifyTwoFactor = (code: string) => api<{ user: UserAccount }>("/api/auth/two-factor", { method: "POST", json: { code } });
export const logout = () => api<{ ok: true }>("/api/auth/session", { method: "DELETE" });
export const changePassword = (currentPassword: string, newPassword: string) =>
  api<{ ok: true }>("/api/auth/password", { method: "POST", json: { currentPassword, newPassword } });
export const requestPasswordReset = (email: string) => api<{ ok: true; message: string }>("/api/auth/forgot-password", { method: "POST", json: { email } });
export const resetPassword = (token: string, password: string) => api<{ ok: true }>("/api/auth/reset-password", { method: "POST", json: { token, password } });

/** First-run only: creates the initial administrator with the USER_MANAGEMENT_KEY from .env.local. */
export const createBootstrapAdmin = (input: CreateUserInput, managementKey: string) =>
  api<{ user: UserAccount }>("/api/users", { method: "POST", json: input, headers: { "X-User-Management-Key": managementKey } });
