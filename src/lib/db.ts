import mysql, { type Pool } from "mysql2/promise";

const databaseName = "salestrackpro";
let pool: Pool | undefined;

export function getDatabasePool() {
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
  });

  return pool;
}
