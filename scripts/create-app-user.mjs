import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const databaseName = "salestrackpro";
const host = process.env.MYSQL_HOST;
const adminUser = process.env.MYSQL_USER;
const adminPassword = process.env.MYSQL_PASSWORD;
const port = Number(process.env.MYSQL_PORT || "3306");
const appUser = process.env.MYSQL_APP_USER || "salestrackpro_app";
// Host part of the MySQL account. Defaults to the server host (works for a local MySQL);
// set MYSQL_APP_USER_HOST=% when the app connects from another machine or container.
const appUserHost = process.env.MYSQL_APP_USER_HOST || host;

if (!host || !adminUser || !adminPassword || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[A-Za-z0-9_]+$/.test(appUser) || !/^[A-Za-z0-9_.%:\-]+$/.test(appUserHost || "")) {
  console.error("Configure valid MySQL admin connection settings in .env.setup.local.");
  process.exitCode = 1;
} else {
  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user: adminUser, password: adminPassword });
    const runtimePassword = randomBytes(36).toString("base64url");
    const userManagementKey = randomBytes(36).toString("base64url");
    const account = `${connection.escape(appUser)}@${connection.escape(appUserHost)}`;
    await connection.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${connection.escape(runtimePassword)}`);
    await connection.query(`ALTER USER ${account} IDENTIFIED BY ${connection.escape(runtimePassword)}`);
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${databaseName}\`.* TO ${account}`);
    await connection.end();
    connection = undefined;

    await writeFile(
      ".env.local",
      [
        `MYSQL_HOST=${host}`,
        `MYSQL_PORT=${port}`,
        `MYSQL_USER=${appUser}`,
        `MYSQL_PASSWORD=${runtimePassword}`,
        `USER_MANAGEMENT_KEY=${userManagementKey}`,
        "",
        "# Public URL of the app (needed behind a reverse proxy, and used in password-reset links).",
        "# APP_URL=https://sales.example.com",
        "# Business timezone for follow-ups, weekly targets, and the 11 PM auto sign-out.",
        "BUSINESS_TIMEZONE=America/Toronto",
        "# Where uploaded documents and profiles are stored (default: ./storage/attachments).",
        "# ATTACHMENT_DIR=./storage/attachments",
        "",
        "# Outbound email for password resets and two-factor codes. Leave blank until you have SMTP details.",
        "SMTP_HOST=",
        "SMTP_PORT=587",
        "SMTP_SECURE=false",
        "SMTP_USER=",
        "SMTP_PASSWORD=",
        "SMTP_FROM=",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    console.log(`Created the restricted app user ${appUser}@${appUserHost} and the user-management key in the ignored .env.local.`);
  } catch (error) {
    console.error("Could not configure the app database user. Check the admin credentials and MySQL privileges.");
    console.error(error instanceof Error ? error.message : "Unknown database error.");
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
}
