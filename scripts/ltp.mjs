import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultSheetName } from "./lib/tracker-import.mjs";

/**
 * Remote administration client for LeadTrailPro: calls the app's API from any machine with a personal access token
 * (Administration → API access; SPEC §4). The token acts as the administrator who created it, so every API that
 * person may call in the browser works here too: users, list values, settings, targets, audit, leads, and the tracker import.
 * Two things have no screen and exist for this client: data corrections (`sql`) and releases (`deploy`).
 *
 *   LTP_URL=https://leadtrail.pro LTP_TOKEN=ltp_… node scripts/ltp.mjs <command> …
 *   npm run remote -- <command> …        (LTP_URL and LTP_TOKEN read from .env.remote.local, which is git-ignored)
 *
 * Commands:
 *   whoami                                    the account behind the token
 *   get <path> [key=value]...                 GET; key=value pairs become the query string
 *   post|patch|put|delete <path> [json|@file] send a JSON body (inline, or @file.json)
 *   tokens                                    list the API tokens
 *   import-status                             previous tracker imports, whether a baseline is needed, the Sales Manager accounts
 *   import <workbook.xlsx> [--apply] [--baseline <file>] [--sheet LeadsDec25] [--keep-action-names] [--force]
 *          [--default-owner email] [--owner "Name=email"]... [--archive-sheet name] [--clients-sheet name] [--report import-report.txt]
 *                                             preview (default) or apply the sales tracker; the report is printed and saved;
 *                                             companies with no Sales Manager go to the opportunity pool unless --default-owner is given
 *   sql <statement | @file.sql> [--apply]     one SELECT / INSERT / UPDATE / DELETE as a data correction: without --apply it runs
 *                                             and is rolled back, so the row count shows what would change; every call is audited
 *   deploy-status [--log]                     what the server runs (commit, schema version), its deployer, the last deploys;
 *                                             --log adds the end of the output of the most recent failed deploy
 *   deploy [--no-wait]                        ask the server's deployer to rebuild and restart now, then wait for the result
 *                                             (a push to the followed branch deploys by itself; this is for a change of .env.local or a retry)
 *
 * Examples:
 *   npm run remote -- get /api/users
 *   npm run remote -- patch /api/users/7 '{"active":false}'
 *   npm run remote -- post /api/list-values '{"listKey":"city","value":"Guelph"}'
 *   npm run remote -- import "docs/Sales Leads 2026.xlsx"
 *   npm run remote -- import "docs/Sales Leads 2026.xlsx" --apply
 *   npm run remote -- sql "UPDATE leads SET industry = 'Logistics' WHERE industry = 'Logistic'"            (preview)
 *   npm run remote -- sql "UPDATE leads SET industry = 'Logistics' WHERE industry = 'Logistic'" --apply
 *   npm run remote -- deploy-status
 */

const usage = `Usage: node scripts/ltp.mjs <whoami | get <path> [k=v]... | post|patch|put|delete <path> [json|@file] | tokens | import-status | import <file> [options] | sql <statement|@file.sql> [--apply] | deploy-status [--log] | deploy [--no-wait]>
Set LTP_URL (https://host) and LTP_TOKEN (ltp_…) in the environment or in .env.remote.local (npm run remote -- …).`;

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const baseUrl = (process.env.LTP_URL ?? "").trim().replace(/\/+$/, "");
const token = (process.env.LTP_TOKEN ?? "").trim();

if (!command || command === "help" || command === "--help") { console.log(usage); process.exit(command ? 0 : 1); }
if (!/^https?:\/\//.test(baseUrl)) { console.error("LTP_URL must be the app's address, for example https://leadtrail.pro"); process.exit(1); }
if (!/^ltp_[A-Za-z0-9_-]{43}$/.test(token)) { console.error("LTP_TOKEN must be a personal access token from Administration → API access (ltp_…)."); process.exit(1); }

async function call(method, apiPath, { json, form } = {}) {
  if (!apiPath.startsWith("/api/")) { console.error(`The path must start with /api/ (got ${apiPath}).`); process.exit(1); }
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  let response;
  try {
    response = await fetch(`${baseUrl}${apiPath}`, { method, headers, body });
  } catch (error) {
    console.error(`Could not reach ${baseUrl}: ${error instanceof Error ? (error.cause?.message ?? error.message) : error}`);
    process.exit(1);
  }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 2000) }; }
  if (!response.ok) {
    console.error(`${method} ${apiPath} → ${response.status}: ${data.error ?? data.raw ?? response.statusText}`);
    if (data.code) console.error(`code: ${data.code}`);
    process.exit(1);
  }
  return data;
}

const print = (data) => console.log(JSON.stringify(data, null, 2));

function printDeployStatus(status) {
  console.log(`Running: commit ${status.commit ?? "unknown (image built by hand)"} · schema version ${status.schemaVersion ?? "?"}`);
  if (!status.agent) console.log("Deployer: none has checked in (it starts with the next manual deploy).");
  else console.log(`Deployer: ${status.agentOnline ? "online" : "NOT RUNNING"}, last seen ${status.agent.seenAt}; follows ${status.agent.branch} of ${status.agent.repo} (now at ${status.agent.remoteCommit?.slice(0, 12) ?? "?"}); automatic deploys ${status.agent.auto ? "on" : "off"}${status.behind ? "; the server is BEHIND the branch" : ""}`);
  if (status.request) console.log(`Deploy requested by ${status.request.requestedByName} at ${status.request.requestedAt}, not picked up yet.`);
  if (status.runs.length) { console.log("Last deploys:"); for (const run of status.runs) console.log(`  ${run.startedAt}  ${run.status.padEnd(7)}  ${run.commit}  ${run.details ?? ""}`); }
  else console.log("No deploys recorded yet.");
}

async function bodyFrom(text) {
  if (text === undefined) return undefined;
  const source = text.startsWith("@") ? await readFile(text.slice(1), "utf8") : text;
  try { return JSON.parse(source); } catch { console.error("The body must be JSON (inline or @file.json)."); process.exit(1); }
}

function queryFrom(pairs) {
  const search = new URLSearchParams();
  for (const pair of pairs) { const index = pair.indexOf("="); if (index > 0) search.set(pair.slice(0, index), pair.slice(index + 1)); }
  const text = search.toString();
  return text ? `?${text}` : "";
}

switch (command) {
  case "whoami": {
    const { user } = await call("GET", "/api/auth/session");
    if (!user) { console.error("The token is not accepted (revoked, expired, or the account is inactive)."); process.exit(1); }
    console.log(`${user.name} <${user.email}> · ${user.role} · privileges: ${user.privileges.join(", ")}`);
    break;
  }
  case "get": {
    if (!args[1]) { console.log(usage); process.exit(1); }
    print(await call("GET", `${args[1]}${queryFrom(args.slice(2))}`));
    break;
  }
  case "post": case "patch": case "put": case "delete": {
    if (!args[1]) { console.log(usage); process.exit(1); }
    print(await call(command.toUpperCase(), args[1], { json: await bodyFrom(args[2]) }));
    break;
  }
  case "tokens": {
    const { tokens } = await call("GET", "/api/api-tokens");
    for (const item of tokens) console.log(`${String(item.id).padStart(4)}  ${item.prefix}…  ${item.name}  (${item.userEmail}; created ${item.createdAt.slice(0, 10)}; expires ${item.expiresAt?.slice(0, 10) ?? "never"}; last used ${item.lastUsedAt ?? "never"})`);
    if (!tokens.length) console.log("No API tokens.");
    break;
  }
  case "import-status": {
    const { status } = await call("GET", `/api/imports/tracker${queryFrom(args.slice(1))}`);
    console.log(`Sheet ${status.sheetName}: ${status.importedEntries} imported timeline entries on ${status.importedLeads} leads; ${status.unstampedEntries} without a fingerprint${status.unstampedEntries ? " (the next run needs --baseline once)" : ""}.`);
    console.log(`Last applied import: ${status.lastImport ? `${status.lastImport.at} by ${status.lastImport.actorName ?? "?"}: ${status.lastImport.details}` : "none"}`);
    console.log("Sales Managers:");
    for (const manager of status.managers) console.log(`  ${manager.name} → ${manager.email}: ${manager.userId ? `${manager.userName}${manager.active ? "" : " (inactive)"}` : "no account yet (created on the first import)"}${manager.note ? ` — ${manager.note}` : ""}`);
    if (status.history.length) { console.log("Previous runs:"); for (const run of status.history) console.log(`  ${run.at} ${run.dryRun ? "(preview) " : ""}${run.details}`); }
    break;
  }
  case "import": {
    const valueOptions = new Set(["--sheet", "--archive-sheet", "--clients-sheet", "--baseline", "--report", "--default-owner", "--owner"]);
    const rest = args.slice(1);
    const positionals = [];
    for (let index = 0; index < rest.length; index += 1) {
      if (valueOptions.has(rest[index])) index += 1;
      else if (!rest[index].startsWith("--")) positionals.push(rest[index]);
    }
    const option = (name, fallback = "") => { const index = rest.indexOf(name); return index === -1 ? fallback : rest[index + 1] ?? fallback; };
    const flag = (name) => rest.includes(name);
    const file = positionals[0];
    if (!file) { console.log(usage); process.exit(1); }
    const apply = flag("--apply");
    const reportPath = option("--report", "import-report.txt");
    const form = new FormData();
    form.set("file", new Blob([await readFile(file)]), path.basename(file));
    const baselineFile = option("--baseline");
    if (baselineFile) form.set("baseline", new Blob([await readFile(baselineFile)]), path.basename(baselineFile));
    form.set("mode", apply ? "apply" : "preview");
    form.set("sheet", option("--sheet", defaultSheetName));
    form.set("keepActionNames", flag("--keep-action-names") ? "1" : "0");
    form.set("force", flag("--force") ? "1" : "0");
    form.set("defaultOwner", option("--default-owner"));
    form.set("owners", rest.flatMap((value, index) => (value === "--owner" && rest[index + 1] ? [rest[index + 1]] : [])).join("\n"));
    form.set("archiveSheet", option("--archive-sheet"));
    form.set("clientsSheet", option("--clients-sheet"));
    console.log(`${apply ? "Applying" : "Previewing"} ${file} on ${baseUrl}…`);
    const { report } = await call("POST", "/api/imports/tracker", { form });
    await writeFile(reportPath, report.text);
    const lines = report.text.split("\n");
    console.log(lines.slice(0, 4 + Object.keys(report.counts).length + 2 + Math.max(1, Object.keys(report.decisions).length)).join("\n"));
    console.log(`\nWarnings: ${report.warningCount}; full report in ${reportPath}`);
    console.log(report.dryRun ? "PREVIEW: nothing was written. Run again with --apply to import." : "Applied on the server.");
    break;
  }
  case "sql": {
    const apply = args.includes("--apply");
    const source = args.slice(1).find((value) => value !== "--apply");
    if (!source) { console.log(usage); process.exit(1); }
    const sql = source.startsWith("@") ? await readFile(source.slice(1), "utf8") : source;
    const result = await call("POST", "/api/admin/sql", { json: { sql, apply } });
    if (result.rows.length) console.table(result.rows.slice(0, 50));
    if (result.rows.length > 50 || result.truncated) console.log(`… ${result.truncated ? "more than " : ""}${result.rows.length} rows returned; the first 50 are shown.`);
    const counted = `${result.command} ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}`;
    if (result.applied) console.log(`${counted}. APPLIED on the server.`);
    else if (/^(SELECT|EXPLAIN)$/i.test(result.command)) console.log(`${counted} (nothing is kept without --apply).`);
    else console.log(`${counted}. PREVIEW: rolled back, nothing changed. Run again with --apply to keep it.`);
    break;
  }
  case "deploy-status": {
    const { status } = await call("GET", "/api/deploy");
    printDeployStatus(status);
    if (args.includes("--log")) console.log(status.failureLog ? `\nOutput of the failed deploy of ${status.failureLog.commit.slice(0, 12)} (${status.failureLog.at}):\n${status.failureLog.log}` : "\nNo failed deploy has left its output.");
    break;
  }
  case "deploy": {
    const before = (await call("GET", "/api/deploy")).status;
    if (!before.agentOnline) { console.error(before.agent ? `The server's deployer last checked in at ${before.agent.seenAt}; it is not running, so nothing would pick the request up.` : "No deployer has checked in on this server yet: it starts with the next manual deploy (docker compose -f compose.yaml -f compose.prod.yaml up -d --build)."); process.exit(1); }
    const lastRun = before.runs[0]?.id ?? 0;
    await call("POST", "/api/deploy", { json: {} });
    console.log(`Deploy requested on ${baseUrl}; the deployer checks every minute.`);
    if (args.includes("--no-wait")) break;
    // The app restarts during a deploy, so a failed request here only means "not back yet".
    const deadline = Date.now() + 20 * 60_000;
    let announced = false;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      let status;
      try {
        const response = await fetch(`${baseUrl}/api/deploy`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
        if (!response.ok) continue;
        status = (await response.json()).status;
      } catch { continue; }
      const run = status.runs.find((item) => item.id > lastRun);
      if (!run) continue;
      if (run.status === "running") { if (!announced) { console.log(`Deploying ${run.commit}…`); announced = true; } continue; }
      printDeployStatus(status);
      process.exit(run.status === "success" ? 0 : 1);
    }
    console.error("No result after 20 minutes; check with: npm run remote -- deploy-status");
    process.exit(1);
  }
  default:
    console.error(`Unknown command "${command}".\n${usage}`);
    process.exit(1);
}
