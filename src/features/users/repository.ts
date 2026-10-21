import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { getDatabasePool, affectedRows, fromSqlDateTime, insertId, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit, diffRecords } from "@/features/audit/repository";
import { isValidTimeOfDay } from "@/lib/dates";
import { defaultAutoLogoutTime, effectivePrivileges, isPrivilege, isSystemRole, isUserStage } from "./model";
import type { CreateUserInput, SystemRole, UpdateUserInput, UserAccount, UserPrivilege, UserStage, UserSummary } from "./model";

const scrypt = promisify(scryptCallback);

export type UserRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  privileges: string[] | string;
  stage: string;
  active: number | boolean;
  terminatedAt: string | null;
  twoFactorEnabled: number | boolean;
  autoLogoutEnabled: number | boolean;
  autoLogoutTime: string | null;
  targetTemplateId: number | null;
  createdAt: string;
};

export const userColumns = `
  u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email, u.phone, u.role, u.privileges, u.stage,
  u.is_active AS active, u.terminated_at AS "terminatedAt", u.two_factor_enabled AS "twoFactorEnabled",
  u.auto_logout_enabled AS "autoLogoutEnabled", u.auto_logout_time AS "autoLogoutTime", u.target_template_id AS "targetTemplateId", u.created_at AS "createdAt"
`;

function parsePrivileges(value: string[] | string): UserPrivilege[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  return Array.isArray(parsed) ? parsed.filter(isPrivilege) : [];
}

export function toUser(row: UserRow): UserAccount {
  const role: SystemRole = isSystemRole(row.role) ? row.role : "recruiter";
  const stage: UserStage = isUserStage(row.stage) ? row.stage : "onboarding";
  const extraPrivileges = parsePrivileges(row.privileges);
  return {
    id: Number(row.id),
    firstName: row.firstName,
    lastName: row.lastName,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    phone: row.phone,
    role,
    stage,
    extraPrivileges,
    privileges: effectivePrivileges(role, extraPrivileges),
    active: Boolean(row.active),
    terminatedAt: fromSqlDateTime(row.terminatedAt),
    twoFactorEnabled: Boolean(row.twoFactorEnabled),
    autoLogoutEnabled: Boolean(row.autoLogoutEnabled),
    autoLogoutTime: isValidTimeOfDay(row.autoLogoutTime) ? row.autoLogoutTime : defaultAutoLogoutTime,
    targetTemplateId: row.targetTemplateId === null ? null : Number(row.targetTemplateId),
    createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function listUsers(options: { includeInactive?: boolean } = {}, db: Queryable = getDatabasePool()): Promise<UserAccount[]> {
  const { rows } = await db.query(
    `SELECT ${userColumns} FROM users u ${options.includeInactive ? "" : "WHERE u.is_active = TRUE"} ORDER BY u.first_name, u.last_name`,
  );
  return (rows as UserRow[]).map(toUser);
}

/** Active users who can own leads or be assigned tasks. */
export async function listDirectory(db: Queryable = getDatabasePool()): Promise<UserSummary[]> {
  const { rows } = await db.query(
    `SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.role, u.is_active AS active
     FROM users u WHERE u.is_active = TRUE ORDER BY u.first_name, u.last_name`,
  );
  return (rows as { id: number; name: string; role: string; active: number | boolean }[]).map((row) => ({
    id: Number(row.id),
    name: row.name,
    role: isSystemRole(row.role) ? row.role : "recruiter",
    active: Boolean(row.active),
  }));
}

export async function countUsers(db: Queryable = getDatabasePool()): Promise<number> {
  const { rows } = await db.query("SELECT COUNT(*) AS count FROM users");
  return Number((rows as { count: number }[])[0].count);
}

export async function getUser(id: number, db: Queryable = getDatabasePool()): Promise<UserAccount | null> {
  const { rows } = await db.query(`SELECT ${userColumns} FROM users u WHERE u.id = ? LIMIT 1`, [id]);
  const row = (rows as UserRow[])[0];
  return row ? toUser(row) : null;
}

export async function getUserByEmail(email: string, db: Queryable = getDatabasePool()): Promise<UserAccount | null> {
  const { rows } = await db.query(`SELECT ${userColumns} FROM users u WHERE u.email = ? LIMIT 1`, [email.trim().toLowerCase()]);
  const row = (rows as UserRow[])[0];
  return row ? toUser(row) : null;
}

export async function createUser(input: CreateUserInput, actorId: number | null): Promise<UserAccount> {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (connection) => {
    const result = await connection.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, privileges, stage, two_factor_enabled, auto_logout_enabled, auto_logout_time, target_template_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        input.firstName, input.lastName, input.email, input.phone, passwordHash, input.role,
        JSON.stringify(input.extraPrivileges), input.stage, input.twoFactorEnabled, input.autoLogoutEnabled, input.autoLogoutTime, input.targetTemplateId,
      ],
    );
    const id = insertId(result);
    const user = (await getUser(id, connection))!;
    await recordAudit(connection, {
      actorId, action: "user.created", entityType: "user", entityId: id,
      after: auditView(user), details: `Created ${user.name} (${user.email}) as ${user.role}`,
    });
    return user;
  });
}

export function auditView(user: UserAccount): Record<string, unknown> {
  return {
    firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, role: user.role, stage: user.stage,
    extraPrivileges: user.extraPrivileges, active: user.active, twoFactorEnabled: user.twoFactorEnabled,
    autoLogoutEnabled: user.autoLogoutEnabled, autoLogoutTime: user.autoLogoutTime, targetTemplateId: user.targetTemplateId,
  };
}

export async function updateUser(id: number, input: UpdateUserInput, actorId: number): Promise<UserAccount> {
  return withTransaction(async (connection) => {
    const existing = await getUser(id, connection);
    if (!existing) throw new HttpError(404, "User not found.");
    const assignments: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => { assignments.push(`${column} = ?`); params.push(value); };
    if (input.firstName !== undefined) set("first_name", input.firstName);
    if (input.lastName !== undefined) set("last_name", input.lastName);
    if (input.email !== undefined) set("email", input.email);
    if (input.phone !== undefined) set("phone", input.phone);
    if (input.role !== undefined) set("role", input.role);
    if (input.stage !== undefined) set("stage", input.stage);
    if (input.extraPrivileges !== undefined) set("privileges", JSON.stringify(input.extraPrivileges));
    if (input.twoFactorEnabled !== undefined) set("two_factor_enabled", input.twoFactorEnabled);
    if (input.autoLogoutEnabled !== undefined) set("auto_logout_enabled", input.autoLogoutEnabled);
    if (input.autoLogoutTime !== undefined) set("auto_logout_time", input.autoLogoutTime);
    if (input.targetTemplateId !== undefined) set("target_template_id", input.targetTemplateId);
    if (input.active !== undefined) {
      set("is_active", input.active);
      if (input.active) set("terminated_at", null);
    }
    if (assignments.length) {
      params.push(id);
      await connection.query(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`, params);
    }
    if (input.active === false) {
      await connection.query("DELETE FROM user_sessions WHERE user_id = ?", [id]);
    }
    const updated = (await getUser(id, connection))!;
    const diff = diffRecords(auditView(existing), auditView(updated));
    if (diff.changed.length) {
      await recordAudit(connection, {
        actorId, action: "user.updated", entityType: "user", entityId: id, before: diff.before, after: diff.after,
        details: `Updated ${diff.changed.join(", ")} for ${updated.name}`,
      });
    }
    return updated;
  });
}

export async function setUserPassword(id: number, password: string, actorId: number, options: { keepSessionTokenHash?: string; reason: string }) {
  const passwordHash = await hashPassword(password);
  await withTransaction(async (connection) => {
    const result = await connection.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, id]);
    if (affectedRows(result) === 0) throw new HttpError(404, "User not found.");
    if (options.keepSessionTokenHash) {
      await connection.query("DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?", [id, options.keepSessionTokenHash]);
    } else {
      await connection.query("DELETE FROM user_sessions WHERE user_id = ?", [id]);
    }
    await connection.query("UPDATE email_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL", [toSqlDateTime(new Date()), id]);
    await recordAudit(connection, { actorId, action: "user.password_changed", entityType: "user", entityId: id, details: options.reason });
  });
}

/**
 * Terminates an account: blocks sign-in, revokes sessions, and moves every lead and open task
 * the person owns to the chosen successor. Historical records keep the original attribution.
 */
export async function terminateUser(id: number, reassignToUserId: number, actorId: number, reason: string): Promise<{ leadsReassigned: number; tasksReassigned: number }> {
  if (id === reassignToUserId) throw new HttpError(400, "Choose a different person to receive the leads.");
  return withTransaction(async (connection) => {
    const user = await getUser(id, connection);
    if (!user) throw new HttpError(404, "User not found.");
    if (id === actorId) throw new HttpError(400, "You cannot terminate your own account.");
    const successor = await getUser(reassignToUserId, connection);
    if (!successor || !successor.active) throw new HttpError(400, "The receiving user must be an active account.");
    if (successor.role === "recruiter") throw new HttpError(400, "Leads can only be reassigned to a Sales Manager or Admin.");
    const now = new Date();
    const nowSql = toSqlDateTime(now);

    const { rows: leadRows } = await connection.query(`SELECT id, client_name AS "clientName" FROM leads WHERE owner_id = ?`, [id]);
    const leads = leadRows as { id: number; clientName: string }[];
    for (const lead of leads) {
      await connection.query("UPDATE leads SET owner_id = ?, last_activity_at = ? WHERE id = ?", [reassignToUserId, nowSql, lead.id]);
      await connection.query(
        `INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, meta, occurred_at, created_at) VALUES (?, ?, 'transfer', ?, ?, ?, ?)`,
        [lead.id, actorId, `Ownership moved from ${user.name} to ${successor.name} (account terminated)`, JSON.stringify({ fromOwnerId: id, toOwnerId: reassignToUserId, reason }), nowSql, nowSql],
      );
      await recordAudit(connection, {
        actorId, action: "lead.reassigned", entityType: "lead", entityId: lead.id,
        before: { ownerId: id, ownerName: user.name }, after: { ownerId: reassignToUserId, ownerName: successor.name },
        details: `Reassigned on termination of ${user.name}${reason ? `: ${reason}` : ""}`,
      }, now);
    }
    const taskResult = await connection.query(
      "UPDATE tasks SET assignee_id = ? WHERE assignee_id = ? AND status = 'open'", [reassignToUserId, id],
    );
    await connection.query("UPDATE users SET is_active = FALSE, terminated_at = ? WHERE id = ?", [nowSql, id]);
    await connection.query("DELETE FROM user_sessions WHERE user_id = ?", [id]);
    await recordAudit(connection, {
      actorId, action: "user.terminated", entityType: "user", entityId: id,
      before: { active: true }, after: { active: false, terminatedAt: now.toISOString(), reassignedTo: reassignToUserId },
      details: `${user.name} terminated. ${leads.length} lead(s) and ${affectedRows(taskResult)} open task(s) moved to ${successor.name}.${reason ? ` ${reason}` : ""}`,
    }, now);
    return { leadsReassigned: leads.length, tasksReassigned: affectedRows(taskResult) };
  });
}
