/**
 * Checks that the app can reach PostgreSQL with the runtime settings in .env.local, without starting the app, and
 * says what to fix when it cannot. Run it wherever the app runs: on a laptop, inside the dev container, or from the
 * production image.
 *
 *   npm run db:check                                      # laptop, or inside `docker compose exec app`
 *   docker compose run --rm app npm run db:check          # dev stack (needs the db service up)
 *   docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run db:check   # production stack
 *
 * Exit code 0 when the connection, the database, and the schema are all in place; 1 otherwise.
 */
import { existsSync } from "node:fs";
import { Client } from "pg";

const host = process.env.PGHOST?.trim();
const port = Number(process.env.PGPORT || "5432");
const user = process.env.PGUSER?.trim();
const password = process.env.PGPASSWORD;
const database = process.env.PGDATABASE?.trim() || "leadtrailpro";
const inContainer = existsSync("/.dockerenv");

const fail = (...lines) => { for (const line of lines) console.error(line); process.exit(1); };

const missing = [["PGHOST", host], ["PGUSER", user], ["PGPASSWORD", password]].filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  fail(`Missing ${missing.join(", ")} in .env.local.`,
    "Run the setup once: `docker compose run --rm setup` (Docker) or `npm run db:create` then `npm run db:user:create` (without Docker). Both write .env.local.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`PGPORT "${process.env.PGPORT}" is not a valid port.`);

console.log(`Connecting to ${host}:${port} as ${user}, database ${database}${inContainer ? " (inside a container)" : ""}…`);
if (host === "db" && !inContainer) {
  console.warn("PGHOST=db is the compose service name and only resolves inside the Docker network. From this machine use PGHOST=127.0.0.1 and the published port (PGPORT=5433 for the dev stack), or run the check inside the container: docker compose run --rm app npm run db:check");
}
if ((host === "127.0.0.1" || host === "localhost") && inContainer) {
  console.warn("Inside a container 127.0.0.1 is the container itself, not the database. The dev stack reaches PostgreSQL as PGHOST=db, PGPORT=5432.");
}

const client = new Client({ host, port, user, password, database, connectionTimeoutMillis: 10000, options: "-c TimeZone=UTC" });
try {
  await client.connect();
  const { rows: [info] } = await client.query("SELECT current_database() AS db, current_user AS role, version() AS version, inet_server_addr()::text AS addr");
  console.log(`Connected: ${info.version.split(",")[0]} at ${info.addr ?? host}, database ${info.db}, role ${info.role}.`);
  const { rows: [tables] } = await client.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
  if (tables.n === 0) fail("The database is empty: run `docker compose run --rm setup` (Docker) or `npm run db:create` (without Docker) to create the schema.");
  let migrations;
  try {
    ({ rows: [migrations] } = await client.query("SELECT COUNT(*)::int AS n, MAX(version) AS latest FROM schema_migrations"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") fail(`${tables.n} tables but no schema_migrations table: the schema was not created by scripts/create-database.mjs. Run it (or the setup service) against this database.`);
    throw error;
  }
  const { rows: [users] } = await client.query("SELECT COUNT(*)::int AS n FROM users");
  console.log(`Schema: ${tables.n} tables, ${migrations.n} migrations applied (latest ${migrations.latest}); ${users.n} user account${users.n === 1 ? "" : "s"}.`);
  if (users.n === 0) console.log("No accounts yet: open the app, choose \"First time setup\", and paste USER_MANAGEMENT_KEY from .env.local.");
  const { rows: [grant] } = await client.query("SELECT has_table_privilege(current_user, 'leads', 'INSERT') AS ok");
  if (!grant.ok) fail(`Role ${info.role} cannot write to the tables. Re-run \`npm run db:user:create\` (or the setup service) to grant the app role.`);
  console.log("Database check passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  console.error(`Failed: ${message}${code ? ` [${code}]` : ""}`);
  const hints = {
    ENOTFOUND: "The host name does not resolve. PGHOST=db works only inside the compose network; on the machine itself use 127.0.0.1.",
    EAI_AGAIN: "The host name does not resolve. PGHOST=db works only inside the compose network; on the machine itself use 127.0.0.1.",
    ECONNREFUSED: inContainer
      ? "Nothing listens there. From inside the dev container the database is PGHOST=db, PGPORT=5432; check `docker compose ps` shows db as healthy."
      : "Nothing listens there. With Docker: is the db container up (`docker compose ps`)? It is published on 127.0.0.1:5433, not 5432, unless DB_PORT was changed. Without Docker: is PostgreSQL running on that port?",
    ETIMEDOUT: "No answer from the host: a firewall, a wrong address, or PostgreSQL not listening on that interface (listen_addresses, pg_hba.conf).",
    "28P01": "Password rejected. .env.local and the database disagree: re-run the setup (it rotates the app password and rewrites .env.local), or point PGPASSWORD at the current one.",
    "28000": "The role is not allowed in. Either it does not exist (run `npm run db:user:create` or the setup service) or pg_hba.conf does not permit this user from this address.",
    "3D000": `Database "${database}" does not exist. Run \`npm run db:create\` or the setup service; note the default name changed from salestrackpro to leadtrailpro on October 30, 2026, so an older .env.local may point at the old name.`,
    "57P03": "PostgreSQL is still starting up; try again in a few seconds.",
  };
  if (hints[code]) console.error(hints[code]);
  else if (/self[- ]signed|certificate/i.test(message)) console.error("TLS is being negotiated; this app connects without TLS by default. Check PGSSLMODE on the server side.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
