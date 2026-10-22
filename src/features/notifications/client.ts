import { api, toQuery } from "@/lib/api";
import type { NotificationPrefs, UserAccount } from "@/features/users/model";
import type { DigestJob, NotificationPage } from "./model";

export const fetchNotifications = (options: { limit?: number; unread?: boolean } = {}) => api<NotificationPage>(`/api/notifications${toQuery({ limit: options.limit, unread: options.unread })}`);
export const markNotificationsRead = (ids: number[] | "all") => api<{ unread: number }>("/api/notifications", { method: "PATCH", json: ids === "all" ? { all: true } : { ids } });
export const updateMyPreferences = (prefs: NotificationPrefs) => api<{ user: UserAccount }>("/api/auth/preferences", { method: "PATCH", json: prefs });
export const runDigestNow = (job: DigestJob) => api<{ ran: { job: DigestJob; periodKey: string; recipients: number; failures: number }[] }>("/api/jobs/run", { method: "POST", json: { job, force: true, onlyMe: true } });
