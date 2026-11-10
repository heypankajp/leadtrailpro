import { getDatabasePool, fromSqlDateTime, insertId, toSqlDateTime, type Queryable } from "@/lib/db";
import { recordAudit } from "@/features/audit/repository";
import { apiTokenDisplayPrefix, apiTokenExpiry, hashApiToken, newApiToken, type ApiToken, type CreateApiTokenInput } from "./api-tokens";
import { toUser, userColumns, type UserRow } from "./repository";
import type { UserAccount } from "./model";

type ApiTokenRow = { id: number; userId: number; userName: string; userEmail: string; name: string; prefix: string; createdAt: string; expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null };

const tokenColumns = `
  t.id, t.user_id AS "userId", TRIM(u.first_name || ' ' || u.last_name) AS "userName", u.email AS "userEmail", t.name, t.token_prefix AS prefix,
  t.created_at AS "createdAt", t.expires_at AS "expiresAt", t.last_used_at AS "lastUsedAt", t.revoked_at AS "revokedAt"
`;

const toApiToken = (row: ApiTokenRow): ApiToken => ({
  id: Number(row.id), userId: Number(row.userId), userName: row.userName, userEmail: row.userEmail, name: row.name, prefix: row.prefix,
  createdAt: fromSqlDateTime(row.createdAt) ?? row.createdAt, expiresAt: fromSqlDateTime(row.expiresAt), lastUsedAt: fromSqlDateTime(row.lastUsedAt), revokedAt: fromSqlDateTime(row.revokedAt),
});

/** Every token that has not been revoked, newest first (administrators see everyone's; a token never leaves the database in clear). */
export async function listApiTokens(db: Queryable = getDatabasePool()): Promise<ApiToken[]> {
  const { rows } = await db.query(`SELECT ${tokenColumns} FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.revoked_at IS NULL ORDER BY t.id DESC`);
  return (rows as ApiTokenRow[]).map(toApiToken);
}

export async function getApiToken(id: number, db: Queryable = getDatabasePool()): Promise<ApiToken | null> {
  const { rows } = await db.query(`SELECT ${tokenColumns} FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.id = ? LIMIT 1`, [id]);
  const row = (rows as ApiTokenRow[])[0];
  return row ? toApiToken(row) : null;
}

/** Creates a token for `userId` and returns it in clear exactly once. */
export async function createApiToken(userId: number, input: CreateApiTokenInput, actorId: number): Promise<{ token: string; apiToken: ApiToken }> {
  const db = getDatabasePool();
  const token = newApiToken();
  const now = new Date();
  const expiresAt = apiTokenExpiry(input.expiresInDays, now);
  const result = await db.query(
    "INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [userId, input.name, hashApiToken(token), apiTokenDisplayPrefix(token), expiresAt ? toSqlDateTime(expiresAt) : null, toSqlDateTime(now)],
  );
  const id = insertId(result);
  await recordAudit(db, {
    actorId, action: "api_token.created", entityType: "api_token", entityId: id,
    after: { name: input.name, prefix: apiTokenDisplayPrefix(token), userId, expiresAt: expiresAt?.toISOString() ?? null },
    details: `API token "${input.name}" (${apiTokenDisplayPrefix(token)}…) created, ${expiresAt ? `expires ${expiresAt.toISOString().slice(0, 10)}` : "no expiry"}`,
  }, now);
  const apiToken = await getApiToken(id, db);
  if (!apiToken) throw new Error("The token was not stored.");
  return { token, apiToken };
}

/** Marks a token revoked; returns null when it does not exist or was revoked already. */
export async function revokeApiToken(id: number, actorId: number): Promise<ApiToken | null> {
  const db = getDatabasePool();
  const now = new Date();
  const { rowCount } = await db.query("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [toSqlDateTime(now), id]);
  if (!rowCount) return null;
  const apiToken = await getApiToken(id, db);
  if (apiToken) await recordAudit(db, { actorId, action: "api_token.revoked", entityType: "api_token", entityId: id, before: { name: apiToken.name, prefix: apiToken.prefix, userId: apiToken.userId }, details: `API token "${apiToken.name}" (${apiToken.prefix}…) revoked` }, now);
  return apiToken;
}

/** The account behind a token: usable (not revoked, not expired) and the account active. Stamps last_used_at at most once a minute. */
export async function getApiTokenUser(token: string, db: Queryable = getDatabasePool()): Promise<UserAccount | null> {
  const tokenHash = hashApiToken(token);
  const { rows } = await db.query(
    `SELECT ${userColumns}, t.id AS "tokenId", t.last_used_at AS "lastUsedAt"
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > (NOW() AT TIME ZONE 'UTC')) AND u.is_active = TRUE LIMIT 1`,
    [tokenHash],
  );
  const row = (rows as (UserRow & { tokenId: number; lastUsedAt: string | null })[])[0];
  if (!row) return null;
  const lastUsed = row.lastUsedAt ? new Date(fromSqlDateTime(row.lastUsedAt) ?? row.lastUsedAt).getTime() : 0;
  if (Date.now() - lastUsed > 60_000) await db.query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", [toSqlDateTime(new Date()), row.tokenId]);
  return toUser(row);
}
