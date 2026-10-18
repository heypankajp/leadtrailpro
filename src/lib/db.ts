import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

const databaseName = "salestrackpro";
let pool: Pool | undefined;

export type Queryable = Pool | PoolConnection;

export function getDatabasePool(): Pool {
  if (pool) return pool;

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const port = Number(process.env.MYSQL_PORT || "3306");

  if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Configure MYSQL_HOST, MYSQL_PORT, MYSQL_USER, and MYSQL_PASSWORD in .env.local.");
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    timezone: "Z",
  });
  // Every business timestamp is stored and compared in UTC.
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  return pool;
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getDatabasePool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export type ResultHeader = { insertId: number | bigint; affectedRows: number };

export function insertId(result: unknown): number {
  return Number((result as ResultHeader).insertId);
}

export function affectedRows(result: unknown): number {
  return Number((result as ResultHeader).affectedRows);
}

/** Formats a Date as the UTC `YYYY-MM-DD HH:MM:SS` string MySQL expects for DATETIME columns. */
export function toSqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Parses a `YYYY-MM-DD HH:MM:SS` UTC string returned by MySQL (dateStrings mode) to ISO 8601. */
export function fromSqlDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return `${value.replace(" ", "T")}Z`;
}
