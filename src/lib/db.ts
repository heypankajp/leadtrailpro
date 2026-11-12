import { Pool, types, type PoolClient, type QueryConfig } from "pg";

/**
 * PostgreSQL access. Queries are written with `?` placeholders (rewritten to `$1 … $n` here) and return
 * `{ rows, rowCount }`. Every instant is stored in TIMESTAMP columns as UTC text; the helpers at the bottom
 * convert between those strings and ISO 8601.
 */

const databaseName = "leadtrailpro";
let pool: Pool | undefined;

// Return dates and timestamps as the text PostgreSQL sends ('YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS') rather than
// local-time Date objects, and 64-bit integers and numerics as numbers (ids and counts stay far below 2^53).
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);
types.setTypeParser(types.builtins.INT8, (value) => Number(value));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryRow = any;
export type QueryResult<Row = QueryRow> = { rows: Row[]; rowCount: number };
export type Queryable = { query<Row = QueryRow>(sql: string, params?: unknown[]): Promise<QueryResult<Row>> };

/** Rewrites `?` placeholders to PostgreSQL's positional `$n` form. The SQL in this code base never contains a literal `?`. */
export function toPositional(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function wrap(target: Pool | PoolClient): Queryable {
  return {
    async query(sql, params = []) {
      const result = await target.query(toPositional(sql), params);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

function createPool(): Pool {
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const port = Number(process.env.PGPORT || "5432");
  if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD in .env.local.");
  }
  const created = new Pool({
    host,
    port,
    user,
    password,
    database: process.env.PGDATABASE || databaseName,
    max: 10,
    // Every business timestamp is stored and compared in UTC.
    options: "-c TimeZone=UTC",
  });
  // An idle client dropped by the server must not crash the process; the next query reconnects.
  created.on("error", (error) => { console.error("PostgreSQL pool error.", error.message); });
  return created;
}

export function getDatabasePool(): Queryable {
  if (!pool) pool = createPool();
  return wrap(pool);
}

export async function withTransaction<T>(work: (connection: Queryable) => Promise<T>): Promise<T> {
  if (!pool) pool = createPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(wrap(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * One statement exactly as written (no `?` rewriting), in a transaction of its own with a statement timeout, kept
 * only when `commit` is true. The extended protocol takes a single command, so the text cannot close the transaction
 * and carry on outside it. For the data-correction API (`POST /api/admin/sql`) only; application code uses the
 * helpers above.
 */
export async function runStatement(sql: string, options: { commit: boolean; timeoutMs: number }): Promise<{ command: string; rowCount: number; rows: QueryRow[]; fields: string[] }> {
  if (!pool) pool = createPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${Math.max(1, Math.round(options.timeoutMs))}`);
    const result = await client.query({ text: sql, queryMode: "extended" } as QueryConfig & { queryMode: "extended" });
    await client.query(options.commit ? "COMMIT" : "ROLLBACK");
    return { command: result.command ?? "", rowCount: result.rowCount ?? 0, rows: result.rows ?? [], fields: (result.fields ?? []).map((field) => field.name) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The id of the row an `INSERT … RETURNING id` created. */
export function insertId(result: QueryResult): number {
  const id = (result.rows[0] as { id?: number | string } | undefined)?.id;
  if (id === undefined) throw new Error("The INSERT did not return an id (add RETURNING id).");
  return Number(id);
}

export function affectedRows(result: QueryResult): number {
  return result.rowCount;
}

/** Formats a Date as the UTC `YYYY-MM-DD HH:MM:SS` text stored in TIMESTAMP columns. */
export function toSqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Parses the `YYYY-MM-DD HH:MM:SS[.fraction]` UTC text PostgreSQL returns for TIMESTAMP columns to ISO 8601. */
export function fromSqlDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value);
  if (!match) return value;
  const fraction = match[3] ? match[3].slice(0, 4).padEnd(4, "0") : "";
  return `${match[1]}T${match[2]}${fraction}Z`;
}
