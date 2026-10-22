import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";

/**
 * Creates (or re-keys) the restricted application role and writes .env.local.
 *   npm run db:user:create
 * Run with the PostgreSQL administrator credentials in .env.setup.local after `npm run db:create`.
 * The role gets SELECT/INSERT/UPDATE/DELETE on every table (present and future) and nothing else.
 * Re-running rotates the password and the bootstrap key; other settings already in .env.local are kept.
 */

const databaseName = process.env.PGDATABASE || "salestrackpro";
const host = process.env.PGHOST;
const adminUser = process.env.PGADMIN_USER || process.env.PGUSER;
const adminPassword = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD;
const port = Number(process.env.PGPORT || "5432");
const appUser = process.env.PGAPPUSER || "salestrackpro_app";

const envTemplate = (dbLines) => [
  ...dbLines,
  "",
  "# Public URL of the app (needed behind a reverse proxy, and used in password-reset links).",
  "# APP_URL=https://sales.example.com",
  "# Business timezone for follow-ups, weekly targets, reports, and each account's daily auto sign-out time.",
  "BUSINESS_TIMEZONE=America/Toronto",
  "# Where uploaded documents and profiles are stored (default: ./storage/attachments).",
  "# ATTACHMENT_DIR=./storage/attachments",
  "",
  "# Outbound email for password resets and two-factor codes. Leave blank until you have SMTP details.",
  "# MAIL_PROVIDER=stub records messages in Settings → Email delivery instead of sending (good until a real mailbox exists); smtp sends them.",
  "MAIL_PROVIDER=stub",
  "SMTP_HOST=",
  "SMTP_PORT=587",
  "SMTP_SECURE=false",
  "SMTP_USER=",
  "SMTP_PASSWORD=",
  "SMTP_FROM=",
  "",
  "# Gmail linking for the lead Emails tab (read-only). Needs a Google Cloud OAuth client; leave blank until then.",
  "GOOGLE_CLIENT_ID=",
  "GOOGLE_CLIENT_SECRET=",
  "# Any long random string; encrypts the stored Gmail refresh tokens. Changing it invalidates existing links.",
  "GMAIL_TOKEN_KEY=",
  "# GOOGLE_REDIRECT_URI=https://sales.example.com/api/gmail/callback",
  "",
  "# Sales Trip Planner providers (leave blank until chosen): maps/places key and a licensed job-listing aggregator.",
  "# TRIPS_PROVIDER=stub serves sample company data instead (the Docker dev stack sets it by default).",
  "# TRIPS_PROVIDER=stub",
  "MAPS_API_KEY=",
  "JOBS_API_URL=",
  "JOBS_API_KEY=",
  "",
];

/** Keeps every line of an existing .env.local except the database block, which is rewritten. */
function mergeEnv(existing, dbLines) {
  const managed = /^(PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|USER_MANAGEMENT_KEY|MYSQL_[A-Z_]+)=/;
  const kept = existing.split("\n").filter((line) => !managed.test(line));
  while (kept.length && kept[0].trim() === "") kept.shift();
  return [...dbLines, "", ...kept].join("\n").replace(/\n{3,}/g, "\n\n");
}

if (!host || !adminUser || !adminPassword || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-z_][a-z0-9_]*$/.test(appUser) || !/^[a-z_][a-z0-9_]*$/.test(databaseName)) {
  console.error("Configure valid PostgreSQL admin connection settings in .env.setup.local (PGAPPUSER: lowercase letters, digits, and underscores).");
  process.exitCode = 1;
} else {
  let client;
  try {
    client = new Client({ host, port, user: adminUser, password: adminPassword, database: databaseName });
    await client.connect();
    const runtimePassword = randomBytes(36).toString("base64url");
    const userManagementKey = randomBytes(36).toString("base64url");
    const role = client.escapeIdentifier(appUser);
    const secret = client.escapeLiteral(runtimePassword);
    const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appUser]);
    if (rowCount === 0) await client.query(`CREATE ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
    else await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(databaseName)} TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    // Tables and identity sequences added by later migrations (run as this administrator) are covered too.
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);
    await client.end();
    client = undefined;

    const dbLines = [
      `PGHOST=${host}`,
      `PGPORT=${port}`,
      `PGUSER=${appUser}`,
      `PGPASSWORD=${runtimePassword}`,
      `PGDATABASE=${databaseName}`,
      `USER_MANAGEMENT_KEY=${userManagementKey}`,
    ];
    let existing = null;
    try { existing = await readFile(".env.local", "utf8"); } catch { existing = null; }
    const content = existing ? mergeEnv(existing, dbLines) : envTemplate(dbLines).join("\n");
    await writeFile(".env.local", content, { mode: 0o600 });
    console.log(`Created the restricted app role ${appUser} and the user-management key in the ignored .env.local${existing ? " (other settings kept)" : ""}.`);
  } catch (error) {
    console.error("Could not configure the app database role. Check the admin credentials and PostgreSQL privileges.");
    console.error(error instanceof Error ? error.message : "Unknown database error.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}
