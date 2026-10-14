import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDatabasePool } from "@/lib/db";
import { userPrivileges } from "./model";
import type { UserAccount, UserPrivilege } from "./model";

const scrypt = promisify(scryptCallback);
export const sessionCookieName = "salestrackpro_session";
const sessionLifetimeSeconds = 8 * 60 * 60;

type SessionUserRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserAccount["role"];
  privileges: string[] | string;
  active: number | boolean;
};

function parsePrivileges(value: string[] | string): UserPrivilege[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is UserPrivilege => typeof item === "string" && userPrivileges.some((privilege) => privilege.id === item))
    : [];
}

function toUser(row: SessionUserRow): UserAccount {
  return {
    id: Number(row.id),
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    privileges: parsePrivileges(row.privileges),
    active: Boolean(row.active),
  };
}

export async function verifyPassword(email: string, password: string): Promise<UserAccount | null> {
  const [rows] = await getDatabasePool().execute(
    `SELECT id, first_name AS firstName, last_name AS lastName, email, phone, password_hash AS passwordHash,
      role, privileges, is_active AS active FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  const row = (rows as (SessionUserRow & { passwordHash: string })[])[0];
  if (!row || !row.active) return null;

  const [scheme, saltHex, hashHex] = row.passwordHash.split("$");
  if (scheme !== "scrypt" || !/^[\da-f]{32}$/i.test(saltHex ?? "") || !/^[\da-f]{128}$/i.test(hashHex ?? "")) {
    console.error("Rejected account with an invalid stored password hash.", { userId: row.id });
    return null;
  }
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
  if (!timingSafeEqual(actual, expected)) return null;
  return toUser(row);
}

export async function createUserSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await getDatabasePool().execute(
    "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [userId, tokenHash, expiresAt],
  );
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<UserAccount | null> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [rows] = await getDatabasePool().execute(
    `SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.email, u.phone,
      u.role, u.privileges, u.is_active AS active
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE LIMIT 1`,
    [tokenHash],
  );
  const row = (rows as SessionUserRow[])[0];
  return row ? toUser(row) : null;
}

export async function revokeUserSession(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await getDatabasePool().execute("DELETE FROM user_sessions WHERE token_hash = ?", [tokenHash]);
}

export async function getRequestUser(): Promise<UserAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  return getSessionUser(token);
}

export function hasPrivilege(user: UserAccount, privilege: UserPrivilege) {
  return user.privileges.includes(privilege);
}

export function hasManagementKey(request: Request) {
  const expected = process.env.USER_MANAGEMENT_KEY;
  const supplied = request.headers.get("x-user-management-key");
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: sessionLifetimeSeconds,
};
