/**
 * Data corrections through the API (`POST /api/admin/sql`, SPEC §6.16): one SQL statement from an administrator, run
 * in a transaction that is rolled back unless the caller asks to apply it, with every call in the audit log. It
 * exists so a correction that no screen offers (who created a lead, a mistyped value on many rows) can be made from
 * another machine with an API token instead of a database shell on the server. Pure rules: what is accepted.
 */

export const adminSqlMaxLength = 20_000;
/** Rows returned to the caller; the statement itself still sees and changes every row it matches. */
export const adminSqlMaxRows = 500;
export const adminSqlTimeoutMs = 30_000;

/** Data only. The schema changes through migrations; transaction control would defeat the preview. */
export const adminSqlKeywords = ["select", "with", "insert", "update", "delete", "explain"] as const;

/** On unless ADMIN_SQL says off (off, false, 0, no). */
export const adminSqlEnabled = (value: string | undefined) => !/^(off|false|0|no)$/i.test((value ?? "").trim());

/** The statement without leading comments and blank space, and without its closing semicolon. */
export function normalizeAdminSql(text: string): string {
  let sql = text.trim();
  for (;;) {
    if (sql.startsWith("--")) { const end = sql.indexOf("\n"); sql = end === -1 ? "" : sql.slice(end + 1).trim(); }
    else if (sql.startsWith("/*")) { const end = sql.indexOf("*/"); sql = end === -1 ? "" : sql.slice(end + 2).trim(); }
    else break;
  }
  return sql.replace(/;\s*$/, "").trim();
}

export type AdminSqlInput = { sql: string; apply: boolean };

/** `{ sql, apply? }`: `apply: true` commits; anything else previews (the statement runs and is rolled back). */
export function parseAdminSql(body: Record<string, unknown> | null): AdminSqlInput | { error: string } {
  const text = typeof body?.sql === "string" ? body.sql : "";
  if (!text.trim()) return { error: "Send the statement as { \"sql\": \"…\" }; add \"apply\": true to keep its changes." };
  if (text.length > adminSqlMaxLength) return { error: `The statement is longer than ${adminSqlMaxLength.toLocaleString("en-US")} characters.` };
  const sql = normalizeAdminSql(text);
  const keyword = /^[a-z]+/i.exec(sql)?.[0].toLowerCase() ?? "";
  if (!(adminSqlKeywords as readonly string[]).includes(keyword)) {
    return { error: "Only one SELECT, WITH, INSERT, UPDATE, DELETE, or EXPLAIN statement is accepted. Changes to the tables themselves go through a migration." };
  }
  return { sql, apply: body?.apply === true };
}

/** The statement on one line for the audit log's 500-character details column. */
export const adminSqlSummary = (sql: string, max = 360) => { const line = sql.replace(/\s+/g, " ").trim(); return line.length > max ? `${line.slice(0, max - 1)}…` : line; };
