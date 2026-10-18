import type { SystemRole } from "@/features/users/model";

export type AppSettings = {
  roleLabels: Record<SystemRole, string>;
  reminders: { inactivityDays: number };
};
