import { getDatabasePool, withTransaction, type Queryable } from "@/lib/db";
import { isValidYmd } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { assertListValue } from "@/features/list-values/repository";
import { defaultRoleLabels, systemRoles } from "@/features/users/model";
import type { SystemRole } from "@/features/users/model";

import { defaultDigests, maxHolidayNameLength, maxHolidays, normalizeDigests, normalizeInactivityRules, type AppSettings, type Holiday, type InactivityRule } from "./model";

const defaults: AppSettings = { roleLabels: { ...defaultRoleLabels }, reminders: { inactivityDays: 7, rules: [] }, digests: { ...defaultDigests }, holidays: [] };

/** Keeps well-formed, unique holidays sorted by date; returns the first problem found (for input validation). */
function normalizeHolidays(value: unknown): { holidays: Holiday[]; error: string | null } {
  if (!Array.isArray(value)) return { holidays: [], error: "Holidays must be a list." };
  if (value.length > maxHolidays) return { holidays: [], error: `Keep the holiday list to ${maxHolidays} dates or fewer.` };
  const byDate = new Map<string, Holiday>();
  for (const entry of value) {
    const date = entry && typeof entry === "object" ? (entry as Holiday).date : undefined;
    const name = entry && typeof entry === "object" ? (entry as Holiday).name : undefined;
    if (typeof date !== "string" || !isValidYmd(date)) return { holidays: [], error: "Each holiday needs a valid date (YYYY-MM-DD)." };
    if (typeof name !== "string" || !name.trim() || name.trim().length > maxHolidayNameLength) return { holidays: [], error: `Each holiday needs a name of up to ${maxHolidayNameLength} characters.` };
    byDate.set(date, { date, name: name.trim() });
  }
  return { holidays: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), error: null };
}

async function readSetting<T>(db: Queryable, key: string, fallback: T): Promise<T> {
  const { rows } = await db.query("SELECT value_json AS value FROM app_settings WHERE setting_key = ?", [key]);
  const row = (rows as { value: string | T }[])[0];
  if (!row) return fallback;
  if (typeof row.value === "string") {
    try { return JSON.parse(row.value) as T; } catch { return fallback; }
  }
  return row.value;
}

export async function getSettings(db: Queryable = getDatabasePool()): Promise<AppSettings> {
  const roleLabels = await readSetting<Partial<Record<SystemRole, string>>>(db, "role_labels", {});
  const reminders = await readSetting<{ inactivityDays?: unknown; rules?: unknown }>(db, "reminders", {});
  const rules = normalizeInactivityRules(reminders.rules ?? []);
  const calendar = await readSetting<{ holidays?: unknown }>(db, "business_calendar", {});
  const digests = normalizeDigests(await readSetting<unknown>(db, "digests", {}));
  const { holidays, error } = normalizeHolidays(calendar.holidays ?? []);
  return {
    roleLabels: Object.fromEntries(systemRoles.map((role) => [role, roleLabels[role]?.trim() || defaults.roleLabels[role]])) as Record<SystemRole, string>,
    reminders: { inactivityDays: Number.isInteger(reminders.inactivityDays) && Number(reminders.inactivityDays) > 0 ? Number(reminders.inactivityDays) : defaults.reminders.inactivityDays, rules: rules.error ? [] : rules.rules },
    digests: digests.error ? { ...defaultDigests } : digests.digests,
    holidays: error ? [] : holidays,
  };
}

/** Holiday dates only, for working-day arithmetic. */
export async function listHolidayDates(db: Queryable = getDatabasePool()): Promise<string[]> {
  return (await getSettings(db)).holidays.map((holiday) => holiday.date);
}

export async function updateSettings(changes: { roleLabels?: Partial<Record<SystemRole, string>>; reminders?: { inactivityDays?: number; rules?: unknown }; digests?: unknown; holidays?: unknown }, actorId: number): Promise<AppSettings> {
  return withTransaction(async (connection) => {
    const current = await getSettings(connection);
    if (changes.roleLabels) {
      const next = { ...current.roleLabels };
      for (const role of systemRoles) {
        const label = changes.roleLabels[role];
        if (label === undefined) continue;
        if (typeof label !== "string" || !label.trim() || label.length > 40) throw new HttpError(400, "Role names must be between 1 and 40 characters.");
        next[role] = label.trim();
      }
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('role_labels', ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json",
        [JSON.stringify(next)],
      );
      await recordAudit(connection, { actorId, action: "setting.updated", entityType: "setting", before: current.roleLabels, after: next, details: "Updated role display names" });
    }
    if (changes.reminders && (changes.reminders.inactivityDays !== undefined || changes.reminders.rules !== undefined)) {
      const days = changes.reminders.inactivityDays === undefined ? current.reminders.inactivityDays : Number(changes.reminders.inactivityDays);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(400, "Inactivity reminder days must be between 1 and 90.");
      let rules: InactivityRule[] = current.reminders.rules;
      if (changes.reminders.rules !== undefined) {
        const parsed = normalizeInactivityRules(changes.reminders.rules);
        if (parsed.error) throw new HttpError(400, parsed.error);
        for (const rule of parsed.rules) {
          await assertListValue(connection, "status", rule.statusId, { allowInactive: true, label: "Reminder rule status" });
          await assertListValue(connection, "bd_action", rule.bdActionId, { allowInactive: true, label: "Reminder rule BD action" });
        }
        rules = parsed.rules;
      }
      const next = { inactivityDays: days, rules };
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('reminders', ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json",
        [JSON.stringify(next)],
      );
      await recordAudit(connection, { actorId, action: "setting.updated", entityType: "setting", before: current.reminders, after: next, details: "Updated reminder settings" });
    }
    if (changes.digests !== undefined) {
      const { digests, error } = normalizeDigests(changes.digests);
      if (error) throw new HttpError(400, error);
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('digests', ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json",
        [JSON.stringify(digests)],
      );
      if (JSON.stringify(current.digests) !== JSON.stringify(digests)) {
        await recordAudit(connection, { actorId, action: "setting.updated", entityType: "setting", before: { ...current.digests }, after: { ...digests }, details: "Updated the digest schedule" });
      }
    }
    if (changes.holidays !== undefined) {
      const { holidays, error } = normalizeHolidays(changes.holidays);
      if (error) throw new HttpError(400, error);
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('business_calendar', ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json",
        [JSON.stringify({ holidays })],
      );
      const changed = JSON.stringify(current.holidays) !== JSON.stringify(holidays);
      if (changed) {
        await recordAudit(connection, { actorId, action: "setting.updated", entityType: "setting", before: { holidays: current.holidays }, after: { holidays }, details: `Updated the business calendar (${holidays.length} holiday${holidays.length === 1 ? "" : "s"})` });
      }
    }
    return getSettings(connection);
  });
}
