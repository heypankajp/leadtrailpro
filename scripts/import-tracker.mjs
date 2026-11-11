import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { TrackerImportError, defaultSheetName, parseOwnerMappings, runTrackerImport } from "./lib/tracker-import.mjs";

/**
 * Imports the client's lead tracker (Google Sheets export, one row per interaction) into LeadTrailPro (SPEC §10.9), incrementally.
 *
 *   node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" [--dry-run] [--force] [--keep-action-names] [--sheet LeadsDec25]
 *        [--baseline "docs/Sales Leads 2026 (first import).xlsx"] [--default-owner email] [--actor email] [--owner "Name=email"]...
 *        [--archive-sheet ArchiveSales] [--clients-sheet Clients] [--report import-report.txt]
 *   In Docker: docker compose run --rm setup node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" --dry-run
 *   From a browser or another machine: Administration → Tracker import (or `npm run remote -- import <file>` with an API token).
 *
 * The rules live in scripts/lib/tracker-import.mjs, shared with the app's upload endpoint. Only the main sheet (LeadsDec25) is read
 * unless --archive-sheet / --clients-sheet are given. Every sheet row gets a fingerprint (a hash of its mapped cells) that is stored on
 * the timeline entry it produced, so the workbook can be imported again and again while the team keeps working in the sheet: rows
 * already imported are left alone, new rows add timeline entries (and leads for new companies), an edited row updates its timeline
 * entry in place, and a row that disappeared is listed in the report (its entry is kept). --dry-run runs everything and rolls it back,
 * so the report is exact. --baseline <workbook> is needed once on a database filled by the import before fingerprints existed.
 * A company whose rows name no Sales Manager becomes an opportunity pool card carrying its drafted lead and timeline, which
 * any salesperson assigns to themselves in the app; --default-owner <email> gives those companies to one person instead.
 * The report is written next to the project as import-report.txt (git-ignored).
 */

const args = process.argv.slice(2);
const valueOptions = new Set(["--sheet", "--archive-sheet", "--clients-sheet", "--baseline", "--report", "--default-owner", "--actor", "--owner"]);
const positionals = [];
for (let index = 0; index < args.length; index += 1) {
  if (valueOptions.has(args[index])) index += 1;
  else if (!args[index].startsWith("--")) positionals.push(args[index]);
}
const option = (name, fallback = null) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1] ?? fallback; };
const flag = (name) => args.includes(name);
const file = positionals[0];
const dryRun = flag("--dry-run");
const sheetName = option("--sheet", defaultSheetName);
const baselineFile = option("--baseline");
const reportPath = option("--report", "import-report.txt");
const ownerEntries = args.flatMap((value, index) => (value === "--owner" && args[index + 1] ? [args[index + 1]] : []));
const owners = parseOwnerMappings(ownerEntries);

const databaseName = process.env.PGDATABASE || "leadtrailpro";
const host = process.env.PGHOST;
const user = process.env.PGADMIN_USER || process.env.PGUSER;
const password = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD;
const port = Number(process.env.PGPORT || "5432");

if (!file) {
  console.error('Usage: node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" [--dry-run] [--force] [--keep-action-names] [--sheet name] [--baseline file] [--default-owner email] [--actor email] [--owner "Name=email"] [--archive-sheet name] [--clients-sheet name] [--report file]');
  process.exit(1);
}
if (owners.errors.length) { console.error(`--owner expects Name=email: ${owners.errors.join("; ")}`); process.exit(1); }
if (!host || !user || !password || !Number.isInteger(port)) {
  console.error("Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD (the setup service in Docker already has them).");
  process.exit(1);
}

const positional = (text) => { let index = 0; return text.replace(/\?/g, () => `$${++index}`); };
const fileBytes = await readFile(file);
const baselineBytes = baselineFile ? await readFile(baselineFile) : null;

const client = new Client({ host, port, user, password, database: databaseName, options: "-c TimeZone=UTC" });
await client.connect();
const query = (text, params = []) => client.query(positional(text), params);

try {
  await query("BEGIN");
  const report = await runTrackerImport({
    query, fileBytes, fileName: path.basename(file), dryRun, force: flag("--force"), keepActionNames: flag("--keep-action-names"), sheetName,
    archiveSheetName: option("--archive-sheet"), clientsSheetName: option("--clients-sheet"), baselineBytes, baselineName: baselineFile ? path.basename(baselineFile) : "baseline workbook",
    actorEmail: option("--actor"), defaultOwnerEmail: option("--default-owner"), ownerMap: owners.map, log: (line) => console.log(line),
  });
  if (dryRun) { await query("ROLLBACK"); console.log("DRY RUN: all changes rolled back."); }
  else { await query("COMMIT"); await query("ANALYZE leads, lead_activities, audit_log, list_values, users"); console.log("Import committed; planner statistics refreshed."); }

  await writeFile(reportPath, report.text);
  const lines = report.text.split("\n");
  console.log(lines.slice(0, 4 + Object.keys(report.counts).length + 2 + Math.max(1, Object.keys(report.decisions).length)).join("\n"));
  console.log(`\nWarnings: ${report.warningCount}; full report in ${reportPath}`);
} catch (error) {
  await query("ROLLBACK").catch(() => undefined);
  if (error instanceof TrackerImportError) console.error(`Import refused; nothing was written. ${error.message}`);
  else console.error("Import failed; nothing was written.", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
