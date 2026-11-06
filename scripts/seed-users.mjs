import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { parseAccounts } from "./lib/seed-accounts.mjs";

/**
 * Seeds the accounts that may sign in (AUTH-01): the administrator and the role accounts, from seed/accounts.csv in the repository.
 *   npm run db:seed:users                                      # without Docker, after npm run db:create
 *   docker compose run --rm setup node scripts/seed-users.mjs  # the setup service also runs it after creating the app role
 * Reads seed/accounts.csv (SEED_USERS_FILE overrides it; the file's header comment shows the format). Every row is
 * checked before anything is written. Existing emails are left as they are, so re-running is safe; from then on
 * administrators manage accounts under Admin → Users. No password is stored: everyone signs in with Google.
 * Exits 0 with a note when the file does not exist, so the setup service can always call it.
 */
const file = process.env.SEED_USERS_FILE || "seed/accounts.csv";
const databaseName = process.env.PGDATABASE || "leadtrailpro";
const host = process.env.PGHOST;
const user = process.env.PGADMIN_USER || process.env.PGUSER;
const password = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD;
const port = Number(process.env.PGPORT || "5432");

/** `?` placeholders → `$1 … $n`, as in src/lib/db.ts. */
const positional = (text) => { let index = 0; return text.replace(/\?/g, () => `$${++index}`); };

if (!existsSync(file)) {
  console.log(`No seed file at ${file}; no accounts to seed (add rows to seed/accounts.csv).`);
} else if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD in .env.setup.local.");
  process.exitCode = 1;
} else {
  const { accounts, errors } = parseAccounts(readFileSync(file, "utf8"));
  if (errors.length) {
    console.error(`${file} has problems; nothing was written:`);
    for (const error of errors) console.error(`  ${error}`);
    process.exitCode = 1;
  } else if (accounts.length === 0) {
    console.log(`${file} lists no accounts; nothing to do.`);
  } else {
    let client;
    try {
      client = new Client({ host, port, user, password, database: databaseName, options: "-c TimeZone=UTC" });
      await client.connect();
      const query = (text, params = []) => client.query(positional(text), params);
      const { rows: templates } = await query("SELECT id, stage FROM target_templates");
      const templateFor = (stage) => templates.find((row) => row.stage === stage)?.id ?? null;
      const created = [];
      const kept = [];
      await query("BEGIN");
      try {
        for (const account of accounts) {
          const { rows: found } = await query("SELECT id FROM users WHERE email = ?", [account.email]);
          if (found.length) { kept.push(account); continue; }
          await query(
            "INSERT INTO users (first_name, last_name, email, phone, password_hash, role, privileges, stage, target_template_id) VALUES (?, ?, ?, '', NULL, ?, '[]', ?, ?)",
            [account.firstName, account.lastName, account.email, account.role, account.stage, templateFor(account.stage)],
          );
          created.push(account);
        }
        await query("COMMIT");
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
      for (const account of created) console.log(`Created ${account.role} ${account.email} (signs in with Google)`);
      for (const account of kept) console.log(`Kept ${account.email}: already exists; roles are managed under Admin → Users`);
      console.log(`Seed accounts: ${created.length} created, ${kept.length} already existed.`);
      const { rows: [{ admins }] } = await query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin' AND is_active = TRUE");
      if (Number(admins) === 0) console.warn("No active administrator exists yet: add one to the seed file, or use First time setup on the sign-in screen.");
    } catch (error) {
      console.error(`Seeding accounts failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    } finally {
      await client?.end().catch(() => {});
    }
  }
}
