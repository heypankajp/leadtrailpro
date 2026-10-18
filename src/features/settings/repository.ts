import { getDatabasePool, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { defaultRoleLabels, systemRoles } from "@/features/users/model";
import type { SystemRole } from "@/features/users/model";

import type { AppSettings } from "./model";

const defaults: AppSettings = { roleLabels: { ...defaultRoleLabels }, reminders: { inactivityDays: 7 } };

async function readSetting<T>(db: Queryable, key: string, fallback: T): Promise<T> {
  const [rows] = await db.query("SELECT value_json AS value FROM app_settings WHERE setting_key = ?", [key]);
  const row = (rows as { value: string | T }[])[0];
  if (!row) return fallback;
  if (typeof row.value === "string") {
    try { return JSON.parse(row.value) as T; } catch { return fallback; }
  }
  return row.value;
}

export async function getSettings(db: Queryable = getDatabasePool()): Promise<AppSettings> {
  const roleLabels = await readSetting<Partial<Record<SystemRole, string>>>(db, "role_labels", {});
  const reminders = await readSetting<Partial<AppSettings["reminders"]>>(db, "reminders", {});
  return {
    roleLabels: Object.fromEntries(systemRoles.map((role) => [role, roleLabels[role]?.trim() || defaults.roleLabels[role]])) as Record<SystemRole, string>,
    reminders: { inactivityDays: Number.isInteger(reminders.inactivityDays) && Number(reminders.inactivityDays) > 0 ? Number(reminders.inactivityDays) : defaults.reminders.inactivityDays },
  };
}

export async function updateSettings(changes: { roleLabels?: Partial<Record<SystemRole, string>>; reminders?: { inactivityDays?: number } }, actorId: number): Promise<AppSettings> {
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
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('role_labels', ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)",
        [JSON.stringify(next)],
      );
      await recordAudit(connection, { actorId, action: "setting.updated", entityType: "setting", before: current.roleLabels, after: next, details: "Updated role display names" });
    }
    if (changes.reminders?.inactivityDays !== undefined) {
      const days = Number(changes.reminders.inactivityDays);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(400, "Inactivity reminder days must be between 1 and 90.");
      const next = { inactivityDays: days };
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('reminders', ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)",
        [JSON.stringify(next)],
      );
      await recordAudit(connection, { actorId, action: "setting.updated", entityType: "setting", before: current.reminders, after: next, details: "Updated reminder settings" });
    }
    return getSettings(connection);
  });
}
