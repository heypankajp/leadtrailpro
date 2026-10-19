import type { SystemRole } from "@/features/users/model";

/** A non-working day in the business calendar (public holiday, company closure). */
export type Holiday = { date: string; name: string };

export type AppSettings = {
  roleLabels: Record<SystemRole, string>;
  reminders: { inactivityDays: number };
  /** Sorted by date. Used with weekends for "yesterday" in reports and for natural-language due dates. */
  holidays: Holiday[];
};

export const maxHolidays = 400;
export const maxHolidayNameLength = 80;
