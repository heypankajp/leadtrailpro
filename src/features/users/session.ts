import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDatabasePool, fromSqlDateTime, toSqlDateTime, withTransaction, type Queryable } from "@/lib/db";
import { lastAutoLogoutCutoff } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { toUser, userColumns, type UserRow } from "./repository";
import { hasPrivilege } from "./model";
import type { UserAccount, UserPrivilege } from "./model";

const scrypt = promisify(scryptCallback);

export const sessionCookieName = "leadtrailpro_session";
export const twoFactorCookieName = "leadtrailpro_2fa";
const sessionLifetimeSeconds = 8 * 60 * 60;
const twoFactorLifetimeSeconds = 10 * 60;
const passwordResetLifetimeSeconds = 30 * 60;
const maxTwoFactorAttempts = 5;

// Cookies are Secure in production unless APP_URL declares a plain-http deployment (an internal host without TLS,
// or the end-to-end stack); browsers drop Secure cookies over http on anything but localhost.
export const secureCookies = process.env.NODE_ENV === "production" && !/^http:\/\//i.test(process.env.APP_URL?.trim() ?? "");
const baseCookie = { httpOnly: true, secure: secureCookies, sameSite: "lax" as const, path: "/" };
export const sessionCookieOptions = { ...baseCookie, maxAge: sessionLifetimeSeconds };
export const twoFactorCookieOptions = { ...baseCookie, maxAge: twoFactorLifetimeSeconds };
export const clearedCookieOptions = { ...baseCookie, maxAge: 0 };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// A fixed hash so unknown accounts cost the same scrypt time as real ones (prevents email enumeration by timing).
const dummyHash = "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

async function matchesHash(password: string, storedHash: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = storedHash.split("$");
  if (scheme !== "scrypt" || !/^[\da-f]{32}$/i.test(saltHex ?? "") || !/^[\da-f]{128}$/i.test(hashHex ?? "")) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
  return timingSafeEqual(actual, expected);
}

/** Returns the account when the email and password match an active user. */
export async function verifyPassword(email: string, password: string): Promise<UserAccount | null> {
  const { rows } = await getDatabasePool().query(
    `SELECT ${userColumns}, u.password_hash AS "passwordHash" FROM users u WHERE u.email = ? LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  const row = (rows as (UserRow & { passwordHash: string })[])[0];
  if (!row || !row.active) {
    await matchesHash(password, dummyHash);
    return null;
  }
  const ok = await matchesHash(password, row.passwordHash);
  if (!ok) return null;
  return toUser(row);
}

export async function createUserSession(userId: number, db: Queryable = getDatabasePool()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await db.query(
    "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [userId, hashToken(token), toSqlDateTime(expiresAt)],
  );
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<UserAccount | null> {
  const tokenHash = hashToken(token);
  const { rows } = await getDatabasePool().query(
    `SELECT ${userColumns}, s.created_at AS "sessionCreatedAt"
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > (NOW() AT TIME ZONE 'UTC') AND u.is_active = TRUE LIMIT 1`,
    [tokenHash],
  );
  const row = (rows as (UserRow & { sessionCreatedAt: string })[])[0];
  if (!row) return null;
  const user = toUser(row);
  if (user.autoLogoutEnabled) {
    const createdAt = new Date(fromSqlDateTime(row.sessionCreatedAt) ?? row.sessionCreatedAt);
    if (createdAt.getTime() < lastAutoLogoutCutoff(user.autoLogoutTime).getTime()) {
      await getDatabasePool().query("DELETE FROM user_sessions WHERE token_hash = ?", [tokenHash]);
      return null;
    }
  }
  return user;
}

export async function revokeUserSession(token: string) {
  await getDatabasePool().query("DELETE FROM user_sessions WHERE token_hash = ?", [hashToken(token)]);
}

export async function getRequestSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  return token && /^[A-Za-z0-9_-]{40,50}$/.test(token) ? token : null;
}

export async function getRequestUser(): Promise<UserAccount | null> {
  const token = await getRequestSessionToken();
  return token ? getSessionUser(token) : null;
}

export { hasPrivilege };

export async function requireUser(): Promise<UserAccount> {
  const user = await getRequestUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

export function requirePrivilege(user: UserAccount, privilege: UserPrivilege, message = "You do not have permission to do that.") {
  if (!hasPrivilege(user, privilege)) throw new HttpError(403, message);
}

export function hasManagementKey(request: Request) {
  const expected = process.env.USER_MANAGEMENT_KEY;
  const supplied = request.headers.get("x-user-management-key");
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

// ---- Sign-in attempts and rate limiting (stored in the database so it works across instances and restarts) ----

const attemptWindowMinutes = 15;
const maxFailuresPerEmail = 10;
const maxFailuresPerAddress = 50;

export async function isLoginRateLimited(email: string, ipAddress: string): Promise<boolean> {
  const { rows } = await getDatabasePool().query(
    `SELECT
       (SELECT COUNT(*) FROM login_history WHERE email = ? AND succeeded = FALSE AND created_at > (NOW() AT TIME ZONE 'UTC') - (?::int * INTERVAL '1 minute')) AS "byEmail",
       (SELECT COUNT(*) FROM login_history WHERE ip_address = ? AND succeeded = FALSE AND created_at > (NOW() AT TIME ZONE 'UTC') - (?::int * INTERVAL '1 minute')) AS "byAddress"`,
    [email.trim().toLowerCase(), attemptWindowMinutes, ipAddress, attemptWindowMinutes],
  );
  const row = (rows as { byEmail: number; byAddress: number }[])[0];
  return Number(row.byEmail) >= maxFailuresPerEmail || Number(row.byAddress) >= maxFailuresPerAddress;
}

export async function recordLoginAttempt(attempt: { userId: number | null; email: string; succeeded: boolean; ipAddress: string; userAgent: string }) {
  await getDatabasePool().query(
    "INSERT INTO login_history (user_id, email, succeeded, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [attempt.userId, attempt.email.trim().toLowerCase().slice(0, 254), attempt.succeeded, attempt.ipAddress, attempt.userAgent, toSqlDateTime(new Date())],
  );
}

export type LoginHistoryEntry = { id: number; userId: number | null; email: string; succeeded: boolean; ipAddress: string; userAgent: string; createdAt: string };

export async function listLoginHistory(filter: { userId?: number; limit?: number }): Promise<LoginHistoryEntry[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  const { rows } = await getDatabasePool().query(
    `SELECT id, user_id AS "userId", email, succeeded, ip_address AS "ipAddress", user_agent AS "userAgent", created_at AS "createdAt"
     FROM login_history ${filter.userId ? "WHERE user_id = ?" : ""} ORDER BY id DESC LIMIT ${limit}`,
    filter.userId ? [filter.userId] : [],
  );
  return (rows as { id: number; userId: number | null; email: string; succeeded: number | boolean; ipAddress: string; userAgent: string; createdAt: string }[]).map((row) => ({
    id: Number(row.id), userId: row.userId === null ? null : Number(row.userId), email: row.email, succeeded: Boolean(row.succeeded),
    ipAddress: row.ipAddress, userAgent: row.userAgent, createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt,
  }));
}

// ---- Email tokens: password reset links and two-factor codes ----

export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await getDatabasePool().query(
    "INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, 'password_reset', ?, ?, ?)",
    [userId, hashToken(token), toSqlDateTime(new Date(now.getTime() + passwordResetLifetimeSeconds * 1000)), toSqlDateTime(now)],
  );
  return token;
}

/** Marks the reset token used and returns the user it belongs to, or null when invalid or expired. */
export async function consumePasswordResetToken(token: string): Promise<number | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  return withTransaction(async (connection) => {
    const { rows } = await connection.query(
      `SELECT id, user_id AS "userId" FROM email_tokens
       WHERE purpose = 'password_reset' AND token_hash = ? AND consumed_at IS NULL AND expires_at > (NOW() AT TIME ZONE 'UTC') LIMIT 1 FOR UPDATE`,
      [hashToken(token)],
    );
    const row = (rows as { id: number; userId: number }[])[0];
    if (!row) return null;
    await connection.query("UPDATE email_tokens SET consumed_at = ? WHERE id = ?", [toSqlDateTime(new Date()), row.id]);
    return Number(row.userId);
  });
}

export async function createTwoFactorChallenge(userId: number): Promise<{ challenge: string; code: string }> {
  const challenge = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  await getDatabasePool().query(
    "UPDATE email_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'two_factor' AND consumed_at IS NULL",
    [toSqlDateTime(now), userId],
  );
  await getDatabasePool().query(
    "INSERT INTO email_tokens (user_id, purpose, token_hash, challenge_hash, expires_at, created_at) VALUES (?, 'two_factor', ?, ?, ?, ?)",
    [userId, hashToken(code), hashToken(challenge), toSqlDateTime(new Date(now.getTime() + twoFactorLifetimeSeconds * 1000)), toSqlDateTime(now)],
  );
  return { challenge, code };
}

export async function verifyTwoFactorChallenge(challenge: string, code: string): Promise<{ userId: number } | { error: string }> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(challenge)) return { error: "The sign-in code has expired. Sign in again." };
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your email." };
  return withTransaction(async (connection) => {
    const { rows } = await connection.query(
      `SELECT id, user_id AS "userId", token_hash AS "tokenHash", attempts FROM email_tokens
       WHERE purpose = 'two_factor' AND challenge_hash = ? AND consumed_at IS NULL AND expires_at > (NOW() AT TIME ZONE 'UTC') LIMIT 1 FOR UPDATE`,
      [hashToken(challenge)],
    );
    const row = (rows as { id: number; userId: number; tokenHash: string; attempts: number }[])[0];
    if (!row) return { error: "The sign-in code has expired. Sign in again." };
    if (Number(row.attempts) >= maxTwoFactorAttempts) return { error: "Too many incorrect codes. Sign in again to get a new one." };
    const matches = timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hashToken(code), "hex"));
    if (!matches) {
      await connection.query("UPDATE email_tokens SET attempts = attempts + 1 WHERE id = ?", [row.id]);
      return { error: "That code is incorrect." };
    }
    await connection.query("UPDATE email_tokens SET consumed_at = ? WHERE id = ?", [toSqlDateTime(new Date()), row.id]);
    return { userId: Number(row.userId) };
  });
}
