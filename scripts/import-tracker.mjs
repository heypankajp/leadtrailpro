import { createHash, randomBytes, scrypt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { Client } from "pg";
import {
  canonicalBdAction, clean, findValue, isEmail, latestNonEmpty, looksLikeAddress, normalizeCompanyName, parseBdAction, parseCity, parseClientResponse,
  parseDate, parseEmails, parseLeadType, parsePhones, parseStatusCode, slugify, titleCase, truncate,
} from "./lib/tracker-mapping.mjs";

/**
 * Imports the client's legacy lead tracker (Google Sheets export, one row per interaction) into LeadTrailPro (SPEC §10.9).
 *
 *   node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" [--dry-run] [--skip-archive] [--keep-action-names] [--force]
 *        [--default-owner email] [--actor email] [--owner "Name=email"]... [--sheet LeadsDec25] [--archive-sheet ArchiveSales] [--report import-report.txt]
 *   In Docker: docker compose run --rm setup node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" --dry-run
 *
 * One lead per company (rows grouped by normalised name; the latest non-empty value wins per field; first contact = the earliest
 * row date; companies on the Clients sheet get status Client), one timeline entry per row, list values and Sales Manager accounts created when missing, everything in one
 * transaction. --dry-run runs the whole import and rolls it back, so the report is exact. Companies already in the database
 * are skipped, which makes a re-run safe. The report (counts, defaults applied, warnings, rejected rows) is written next to
 * the project as import-report.txt (git-ignored: it names real companies).
 */

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1] ?? fallback; };
const flag = (name) => args.includes(name);
const file = args.find((value, index) => !value.startsWith("--") && (index === 0 || !args[index - 1].startsWith("--") || flag(args[index - 1])));
const dryRun = flag("--dry-run");
const skipArchive = flag("--skip-archive");
const force = flag("--force");
const keepActionNames = flag("--keep-action-names");
const sheetName = option("--sheet", "LeadsDec25");
const archiveSheetName = option("--archive-sheet", "ArchiveSales");
const clientsSheetName = option("--clients-sheet", "Clients");
const reportPath = option("--report", "import-report.txt");
const defaultOwnerEmail = option("--default-owner");
const actorEmail = option("--actor");

// Sales Manager names as written in the sheet → account emails (from the workbook's MasterData sheet; Adam's is an assumption).
const ownerMap = { daniel: "daniel@scilltech.com", david: "david@scilltech.com", gaya: "gaya@scilltech.com", sara: "sara@scilltech.com", adam: "adam@scilltech.com" };
const ownerNotes = { adam: "email assumed: the workbook's MasterData sheet lists sara@scilltech.com for Adam" };
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--owner" && args[index + 1]?.includes("=")) {
    const [name, email] = args[index + 1].split("=");
    ownerMap[clean(name).toLowerCase()] = clean(email).toLowerCase();
  }
}

const databaseName = process.env.PGDATABASE || "salestrackpro";
const host = process.env.PGHOST;
const user = process.env.PGADMIN_USER || process.env.PGUSER;
const password = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD;
const port = Number(process.env.PGPORT || "5432");

if (!file) {
  console.error('Usage: node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" [--dry-run] [--skip-archive] [--keep-action-names] [--force] [--default-owner email] [--actor email] [--owner "Name=email"] [--report file]');
  process.exit(1);
}
if (!host || !user || !password || !Number.isInteger(port)) {
  console.error("Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD (the setup service in Docker already has them).");
  process.exit(1);
}

const positional = (text) => { let index = 0; return text.replace(/\?/g, () => `$${++index}`); };
const sqlDateTime = (date) => date.toISOString().slice(0, 19).replace("T", " ");
const todayYmd = new Date().toISOString().slice(0, 10);

async function hashPassword(value) {
  const salt = randomBytes(16);
  const key = await new Promise((resolve, reject) => scrypt(value, salt, 64, (error, derived) => (error ? reject(error) : resolve(derived))));
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Workbook reading
// ---------------------------------------------------------------------------------------------------------------------

/** exceljs cell values: strings, numbers, Dates, rich text, hyperlinks, formulas, errors. */
function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== "object") return value;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if ("result" in value) return cellValue(value.result);
  if ("text" in value) return typeof value.text === "object" ? cellValue(value.text) : String(value.text);
  if ("error" in value) return null;
  return String(value);
}

const headerKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Finds the header row (the one holding "Client Name") and maps logical names to 1-based column numbers. */
function readSheet(worksheet, aliases) {
  let headerRow = null;
  const columns = {};
  for (let number = 1; number <= Math.min(10, worksheet.rowCount); number += 1) {
    const row = worksheet.getRow(number);
    const keys = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { keys[column] = headerKey(cellValue(cell.value)); });
    if (keys.some((key) => key === "clientname")) {
      headerRow = number;
      for (const [logical, candidates] of Object.entries(aliases)) {
        const column = keys.findIndex((key, index) => index > 0 && key && candidates.some((candidate) => key === candidate || key.startsWith(candidate)));
        if (column > 0) columns[logical] = column;
      }
      // The archive sheet keeps the contact remark in an unnamed column right after the alternate number.
      if (!columns.contactRemark && columns.altPhone && !keys[columns.altPhone + 1]) columns.contactRemark = columns.altPhone + 1;
      break;
    }
  }
  if (!headerRow) throw new Error(`Sheet "${worksheet.name}" has no header row with "Client Name".`);
  const rows = [];
  worksheet.eachRow((row, number) => {
    if (number <= headerRow) return;
    const record = { row: number };
    let hasContent = false;
    for (const [logical, column] of Object.entries(columns)) {
      const value = cellValue(row.getCell(column).value);
      record[logical] = value;
      if (value !== null && value !== "" && logical !== "sr") hasContent = true;
    }
    if (hasContent) rows.push(record);
  });
  return { headerRow, columns, rows };
}

const mainAliases = {
  sr: ["sr"], type: ["type"], manager: ["salesmanager"], date: ["firstdate", "startdate", "contactdate"], name: ["clientname"], action: ["bdaction"],
  response: ["clientresponse", "clientreponse"], status: ["status"], addressOrComments: ["addresscomments", "address"], city: ["city"], followUp: ["followupdate"],
  executive: ["clientexecutive"], phone: ["contactno"], altPhone: ["extalternateno", "alternateno"], contactRemark: ["contactremark"], email: ["email"],
  industry: ["clientindustry", "industry"], positions: ["positions", "initialrequirements"], contract: ["contractsigneddate", "contractsigndate"], notes: ["notes"],
  stage: ["stage"], quarter: ["quarter"], agreementSent: ["agreementsentdate"],
};

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------

const report = { counts: {}, decisions: {}, warnings: new Map(), rejects: [], createdUsers: [], createdValues: [], skipped: [] };
const count = (key, by = 1) => { report.counts[key] = (report.counts[key] ?? 0) + by; };
const decision = (key, by = 1) => { report.decisions[key] = (report.decisions[key] ?? 0) + by; };
const warn = (kind, sheet, row, text) => { if (!report.warnings.has(kind)) report.warnings.set(kind, []); report.warnings.get(kind).push(`${sheet} row ${row}: ${text}`); };

// ---------------------------------------------------------------------------------------------------------------------
// Row interpretation
// ---------------------------------------------------------------------------------------------------------------------

function interpretRow(raw, sheet) {
  const name = clean(raw.name);
  const record = { row: raw.row, sheet, name, key: normalizeCompanyName(name), comments: [] };
  const dated = (text) => (record.date ? `${record.date}: ${text}` : text);

  record.date = parseDate(raw.date);
  if (!record.date && (clean(raw.date) || raw.date instanceof Date)) warn("Unreadable or out-of-range first/contact date", sheet, raw.row, `"${raw.date instanceof Date ? raw.date.toISOString().slice(0, 10) : clean(raw.date)}" (the earliest other row of the company is used)`);

  record.type = parseLeadType(raw.type);
  const managerText = clean(raw.manager);
  record.manager = managerText && managerText.toLowerCase() !== "none" ? managerText : "";

  record.action = raw.action === undefined ? null : parseBdAction(raw.action);
  if (!record.action && clean(raw.action) && raw.action !== undefined) warn("BD action not recognised", sheet, raw.row, `"${clean(raw.action)}" ignored`);
  record.response = raw.response === undefined ? null : parseClientResponse(raw.response);
  if (!record.response && clean(raw.response)) warn("Client response not recognised", sheet, raw.row, `"${clean(raw.response)}" ignored`);

  const statusText = clean(raw.status);
  record.status = parseStatusCode(statusText);
  if (statusText && !record.status) warn("Status not recognised", sheet, raw.row, `"${statusText}" ignored`);

  const addressOrComments = clean(raw.addressOrComments);
  if (addressOrComments) {
    if (looksLikeAddress(addressOrComments)) record.address = addressOrComments;
    else record.comments.push(dated(addressOrComments));
  }
  record.city = parseCity(raw.city);

  record.followUp = parseDate(raw.followUp);
  const followUpText = raw.followUp instanceof Date ? raw.followUp.toISOString().slice(0, 10) : clean(raw.followUp);
  if (followUpText && !record.followUp) { record.comments.push(dated(`Follow-up note: ${followUpText}`)); warn("Follow-up date kept as a comment", sheet, raw.row, `"${followUpText}"`); }

  record.executive = clean(raw.executive);
  record.phones = parsePhones(raw.phone);
  record.altPhones = parsePhones(raw.altPhone);
  if (clean(raw.altPhone) && !record.altPhones.length && !/^(n\/?a|-|none)$/i.test(clean(raw.altPhone))) record.contactRemarkExtra = clean(raw.altPhone);
  record.contactRemark = clean(raw.contactRemark);

  const parsedEmails = parseEmails(raw.email);
  record.emails = parsedEmails.emails;
  if (parsedEmails.leftover) { record.comments.push(dated(`Note from the email column: ${parsedEmails.leftover}`)); warn("Email column text kept as a comment", sheet, raw.row, `"${parsedEmails.leftover}"`); }

  const industry = clean(raw.industry);
  if (industry && isEmail(industry)) { record.emails = [...new Set([...record.emails, industry.toLowerCase()])]; warn("Email found in the industry column", sheet, raw.row, `${industry} moved to emails`); }
  else record.industry = industry;

  record.positions = clean(raw.positions);
  record.contract = parseDate(raw.contract);
  const contractText = clean(raw.contract);
  if (contractText && !record.contract) { record.comments.push(dated(`Contract-signed column: ${contractText}`)); warn("Contract-signed column text kept as a comment", sheet, raw.row, `"${contractText}"`); }

  record.notes = clean(raw.notes);
  if (raw.stage !== undefined && clean(raw.stage)) record.comments.push(dated(`Stage: ${clean(raw.stage)}`));
  if (raw.quarter !== undefined && clean(raw.quarter)) record.comments.push(dated(`Quarter: ${clean(raw.quarter)}`));
  if (raw.agreementSent !== undefined && clean(raw.agreementSent)) record.comments.push(dated(`Agreement sent: ${parseDate(raw.agreementSent) ?? clean(raw.agreementSent)}`));
  return record;
}

/** The most common non-empty value; the latest one on a tie. */
function mostFrequent(values) {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = null;
  for (const [value, total] of counts) if (best === null || total >= counts.get(best)) best = value;
  return best;
}

/** Rows of one company → the lead's fields (latest non-empty value per field) plus the activities to write. */
function buildLead(rows, sheet) {
  rows.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.row - b.row);
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  const phones = latestNonEmpty(rows, (row) => row.phones) ?? [];
  const altPhones = latestNonEmpty(rows, (row) => row.altPhones) ?? [];
  const extraPhones = [...phones.slice(1), ...altPhones.slice(1)];
  const remarkParts = [latestNonEmpty(rows, (row) => row.contactRemark), latestNonEmpty(rows, (row) => row.contactRemarkExtra), extraPhones.length ? `Other numbers: ${extraPhones.join(", ")}` : ""].filter(Boolean);
  const comments = [...new Set(rows.flatMap((row) => row.comments))];
  return {
    sheet,
    name: latestNonEmpty(rows, (row) => row.name),
    rows,
    manager: latestNonEmpty(rows, (row) => row.manager) ?? "",
    type: mostFrequent(rows.map((row) => row.type)),
    status: latestNonEmpty(rows, (row) => row.status),
    action: latestNonEmpty(rows, (row) => row.action),
    response: latestNonEmpty(rows, (row) => row.response),
    city: latestNonEmpty(rows, (row) => row.city) ?? "",
    address: truncate(latestNonEmpty(rows, (row) => row.address) ?? "", 500),
    comments: comments.join("\n"),
    executive: truncate(latestNonEmpty(rows, (row) => row.executive) ?? "", 160),
    phone: truncate(phones[0] ?? "", 40),
    altPhone: truncate(altPhones[0] ?? phones[1] ?? "", 40),
    contactRemark: truncate(remarkParts.join(" · "), 500),
    emails: [...new Set(rows.flatMap((row) => row.emails))],
    industry: truncate(latestNonEmpty(rows, (row) => row.industry) ?? "", 120),
    positions: [...new Set(rows.map((row) => row.positions).filter(Boolean))].join("; "),
    firstContact: dates[0] ?? null,
    lastActivity: dates[dates.length - 1] ?? null,
    followUp: latestNonEmpty(rows, (row) => row.followUp),
    contract: latestNonEmpty(rows, (row) => row.contract),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------------

const started = Date.now();
const fileBytes = await readFile(file);
const fileHash = createHash("sha256").update(fileBytes).digest("hex").slice(0, 16);
console.log(`Reading ${file} (${(fileBytes.length / 1024 / 1024).toFixed(1)} MB)…`);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(fileBytes);
const mainSheet = workbook.getWorksheet(sheetName);
if (!mainSheet) { console.error(`Sheet "${sheetName}" not found. Sheets: ${workbook.worksheets.map((sheet) => sheet.name).join(", ")}`); process.exit(1); }
const main = readSheet(mainSheet, mainAliases);
console.log(`${sheetName}: header on row ${main.headerRow}, ${main.rows.length} rows, columns ${Object.keys(main.columns).join(", ")}`);
const archiveSheet = skipArchive ? null : workbook.getWorksheet(archiveSheetName);
const archive = archiveSheet ? readSheet(archiveSheet, mainAliases) : null;
if (archive) console.log(`${archiveSheetName}: header on row ${archive.headerRow}, ${archive.rows.length} rows`);
const clientsSheet = workbook.getWorksheet(clientsSheetName);
const clientKeys = new Set();
if (clientsSheet) {
  for (const raw of readSheet(clientsSheet, mainAliases).rows) { const key = normalizeCompanyName(clean(raw.name)); if (key) clientKeys.add(key); }
  console.log(`${clientsSheetName}: ${clientKeys.size} companies confirm status Client`);
}

const client = new Client({ host, port, user, password, database: databaseName, options: "-c TimeZone=UTC" });
await client.connect();
const query = (text, params = []) => client.query(positional(text), params);

try {
  const { rows: previous } = await query("SELECT details FROM audit_log WHERE action = 'import.tracker' AND details LIKE ? ORDER BY id DESC LIMIT 1", [`%${fileHash}%`]);
  if (previous.length && !force && !dryRun) {
    console.error(`This workbook (hash ${fileHash}) was already imported: ${previous[0].details}. Use --force to run again (companies already present are skipped).`);
    process.exit(1);
  }

  await query("BEGIN");
  const now = new Date();
  const nowSql = sqlDateTime(now);

  // Actor and default owner.
  const { rows: admins } = await query("SELECT id, first_name AS \"firstName\", last_name AS \"lastName\", email FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id");
  const actor = actorEmail ? (await query("SELECT id, first_name AS \"firstName\", last_name AS \"lastName\", email FROM users WHERE LOWER(email) = ?", [actorEmail.toLowerCase()])).rows[0] : admins[0];
  if (!actor) throw new Error(actorEmail ? `No account with email ${actorEmail}.` : "Create the first administrator before importing.");
  const actorName = `${actor.firstName} ${actor.lastName}`.trim();
  const defaultOwner = defaultOwnerEmail ? (await query("SELECT id, email FROM users WHERE LOWER(email) = ? AND is_active = TRUE", [defaultOwnerEmail.toLowerCase()])).rows[0] : actor;
  if (!defaultOwner) throw new Error(`No active account with email ${defaultOwnerEmail}.`);

  // Sales Manager accounts.
  const { rows: templates } = await query("SELECT id, stage FROM target_templates");
  const userIdByEmail = new Map();
  for (const row of (await query("SELECT id, LOWER(email) AS email FROM users")).rows) userIdByEmail.set(row.email, row.id);
  const managerUserId = new Map();
  async function ownerFor(managerName) {
    const key = clean(managerName).toLowerCase();
    if (!key) return defaultOwner.id;
    if (managerUserId.has(key)) return managerUserId.get(key);
    const email = ownerMap[key];
    if (!email) { decision(`Sales Manager "${managerName}" has no account mapping; leads assigned to ${defaultOwner.email}`); managerUserId.set(key, defaultOwner.id); return defaultOwner.id; }
    let id = userIdByEmail.get(email);
    if (!id) {
      const { rows: [created] } = await query(
        "INSERT INTO users (first_name, last_name, email, phone, password_hash, role, privileges, stage, target_template_id, created_at, updated_at) VALUES (?, '', ?, '', ?, 'sales_manager', '[]', 'full_productive', ?, ?, ?) RETURNING id",
        [titleCase(managerName), email, await hashPassword(randomBytes(24).toString("base64url")), templates.find((template) => template.stage === "full_productive")?.id ?? null, nowSql, nowSql],
      );
      id = created.id;
      userIdByEmail.set(email, id);
      report.createdUsers.push(`${titleCase(managerName)} <${email}> (Sales Manager; send a set-password link from User management${ownerNotes[key] ? `; ${ownerNotes[key]}` : ""})`);
    }
    managerUserId.set(key, id);
    return id;
  }

  // List values.
  const lists = {};
  for (const row of (await query('SELECT id, list_key AS "listKey", code, value, sort_order AS "sortOrder" FROM list_values')).rows) (lists[row.listKey] ??= []).push(row);
  async function ensureValue(listKey, value) {
    const text = clean(value);
    if (!text) return null;
    const existing = findValue(lists[listKey] ?? [], text);
    if (existing) return existing.id;
    let code = slugify(text);
    while ((lists[listKey] ?? []).some((item) => item.code === code)) code = `${code.slice(0, 56)}_${Math.floor(Math.random() * 1000)}`;
    const sortOrder = Math.max(0, ...(lists[listKey] ?? []).map((item) => Number(item.sortOrder))) + 1;
    const { rows: [created] } = await query("INSERT INTO list_values (list_key, code, value, sort_order) VALUES (?, ?, ?, ?) RETURNING id", [listKey, code, truncate(text, 120), sortOrder]);
    const item = { id: created.id, listKey, code, value: text, sortOrder };
    (lists[listKey] ??= []).push(item);
    report.createdValues.push(`${listKey}: "${text}"`);
    return item.id;
  }
  const statusIdByCode = Object.fromEntries((lists.status ?? []).map((item) => [item.code, item.id]));
  for (const code of ["cold", "warm", "hot", "client"]) if (!statusIdByCode[code]) throw new Error(`Status "${code}" is missing from the list of values.`);

  // Companies already in the database are skipped.
  const existingKeys = new Set((await query("SELECT client_name AS name FROM leads")).rows.map((row) => normalizeCompanyName(row.name)));

  // Group the rows of each sheet by company.
  function groupRows(sheetRows, sheet) {
    const groups = new Map();
    for (const raw of sheetRows) {
      const record = interpretRow(raw, sheet);
      if (!record.key) { report.rejects.push(`${sheet} row ${raw.row}: no client name`); count("rows rejected"); continue; }
      (groups.get(record.key) ?? groups.set(record.key, []).get(record.key)).push(record);
      count(`rows read from ${sheet}`);
    }
    return groups;
  }
  const mainGroups = groupRows(main.rows, sheetName);
  const archiveGroups = archive ? groupRows(archive.rows, archiveSheetName) : new Map();

  async function insertLead(lead, options) {
    const ownerId = await ownerFor(lead.manager);
    if (!lead.manager) decision("Leads with no Sales Manager in any row: assigned to the default owner");
    let leadType = lead.type;
    if (!leadType) { leadType = "Office"; decision('No lead type in any row: "Office" assumed'); }
    let statusCode = lead.status ?? "cold";
    if (!lead.status) decision('No status in any row: "Cold" assumed');
    if (!options.archived && clientKeys.has(lead.rows[0].key) && statusCode !== "client") { statusCode = "client"; decision('Listed on the Clients sheet: status set to "Client"'); }
    let firstContact = lead.firstContact;
    if (!firstContact) { firstContact = lead.followUp ?? todayYmd; decision("No readable date in any row: follow-up date or today used as first contact"); }
    const actionName = lead.action ? canonicalBdAction(lead.action.name, keepActionNames) : null;
    if (lead.action && actionName !== lead.action.name) decision(`BD action "${lead.action.name}" imported as "${actionName}"`);
    const cityId = await ensureValue("city", lead.city);
    const { rows: [created] } = await query(
      `INSERT INTO leads (owner_id, created_by, lead_type_id, status_id, status_reason_id, bd_action_id, client_response_id, lead_category_id, company_size_id, city_id,
         client_name, company_url, address, comments, client_executive, contact_phone, contact_alt_phone, contact_remark, client_emails, industry, positions,
         first_contact_date, follow_up_date, contract_signed_date, record_state, state_reason, state_changed_by, state_changed_at, last_activity_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        ownerId, actor.id, await ensureValue("lead_type", leadType), statusIdByCode[statusCode], await ensureValue("bd_action", actionName), await ensureValue("client_response", lead.response), cityId,
        truncate(lead.name, 200), lead.address, lead.comments || null, lead.executive, lead.phone, lead.altPhone, lead.contactRemark, JSON.stringify(lead.emails), lead.industry, lead.positions || null,
        firstContact, lead.followUp, lead.contract,
        options.archived ? "archived" : "active", options.archived ? options.reason : null, options.archived ? actor.id : null, options.archived ? nowSql : null,
        `${lead.lastActivity ?? firstContact} 12:00:00`, `${firstContact} 09:00:00`,
      ],
    );
    const leadId = created.id;
    const activity = (userId, type, summary, body, valueCode, meta, occurredAt) => query(
      "INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, body, value_code, meta, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [leadId, userId, type, truncate(summary, 500), body || null, valueCode, JSON.stringify(meta), occurredAt, nowSql],
    );
    await activity(ownerId, "created", `Lead imported from the sales tracker (${options.archived ? "archive sheet" : `first contact ${firstContact}`})`, null, statusCode, { imported: true, sheet: lead.sheet, rows: lead.rows.length, file: fileHash }, `${firstContact} 09:00:00`);
    count("activities written");
    if (!options.archived) {
      for (const row of lead.rows) {
        const date = row.date ?? firstContact;
        const rowAction = row.action ? canonicalBdAction(row.action.name, keepActionNames) : null;
        let type = "note";
        let summary = row.notes || row.contactRemark || "Interaction recorded in the tracker";
        let valueCode = null;
        let body = null;
        if (rowAction) {
          type = "bd_action";
          summary = row.response ? `${rowAction} · ${row.response}` : rowAction;
          const actionId = await ensureValue("bd_action", rowAction);
          valueCode = (lists.bd_action ?? []).find((item) => item.id === actionId)?.code ?? null;
          body = [row.notes, row.contactRemark].filter(Boolean).join("\n") || null;
        } else if (row.response) {
          type = "client_response";
          summary = row.response;
          const responseId = await ensureValue("client_response", row.response);
          valueCode = (lists.client_response ?? []).find((item) => item.id === responseId)?.code ?? null;
          body = [row.notes, row.contactRemark].filter(Boolean).join("\n") || null;
        } else if (summary.length > 500) {
          body = summary; // the summary is cut at 500 characters; the full note stays in the body
        }
        await activity(await ownerFor(row.manager), type, summary, body, valueCode, { imported: true, sheet: row.sheet, row: row.row, step: row.action?.step ?? null, status: row.status, type: row.type, manager: row.manager || null }, `${date} 12:00:00`);
        count("activities written");
      }
    }
    await query("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after_json, details, created_at) VALUES (?, 'lead.created', 'lead', ?, ?, ?, ?)", [
      actor.id, leadId, JSON.stringify({ clientName: lead.name, status: statusCode, source: "tracker", sheet: lead.sheet, rows: lead.rows.length, archived: Boolean(options.archived) }),
      `${actorName} imported ${lead.name} from the sales tracker (${lead.rows.length} row${lead.rows.length === 1 ? "" : "s"})`, nowSql,
    ]);
    return leadId;
  }

  let done = 0;
  for (const [key, rows] of mainGroups) {
    if (existingKeys.has(key)) { report.skipped.push(`${rows[0].name} (${rows.length} rows): already in the database`); count("companies skipped (already present)"); continue; }
    await insertLead(buildLead(rows, sheetName), { archived: false });
    existingKeys.add(key);
    count("leads created from the main sheet");
    done += 1;
    if (done % 500 === 0) console.log(`  ${done} leads…`);
  }
  for (const [key, rows] of archiveGroups) {
    if (existingKeys.has(key)) { report.skipped.push(`${rows[0].name} (archive sheet): already present`); count("archive companies skipped (already present)"); continue; }
    const lead = buildLead(rows, archiveSheetName);
    lead.type ??= "Office";
    await insertLead(lead, { archived: true, reason: "Imported from the 2021–22 archive sheet of the sales tracker" });
    existingKeys.add(key);
    count("archived leads created from the archive sheet");
  }

  const summary = Object.entries(report.counts).map(([key, value]) => `${key}: ${value}`).join(", ");
  await query("INSERT INTO audit_log (actor_id, action, entity_type, details, created_at) VALUES (?, 'import.tracker', 'setting', ?, ?)", [actor.id, truncate(`${actorName} imported ${path.basename(file)} (hash ${fileHash}${dryRun ? ", dry run" : ""}): ${summary}`, 500), nowSql]);

  if (dryRun) { await query("ROLLBACK"); console.log("DRY RUN: all changes rolled back."); }
  else { await query("COMMIT"); await query("ANALYZE leads, lead_activities, audit_log, list_values, users"); console.log("Import committed; planner statistics refreshed."); }

  const lines = [
    `LeadTrailPro tracker import ${dryRun ? "(DRY RUN, nothing written) " : ""}— ${new Date().toISOString()}`,
    `File: ${file} (hash ${fileHash}); database ${databaseName}; actor ${actor.email}; default owner ${defaultOwner.email}; ${((Date.now() - started) / 1000).toFixed(1)} s`,
    "",
    "== Summary", ...Object.entries(report.counts).map(([key, value]) => `${value.toString().padStart(6)}  ${key}`),
    "", "== Defaults and mappings applied", ...(Object.keys(report.decisions).length ? Object.entries(report.decisions).map(([key, value]) => `${value.toString().padStart(6)}  ${key}`) : ["  none"]),
    "", "== Accounts created", ...(report.createdUsers.length ? report.createdUsers.map((line) => `  ${line}`) : ["  none"]),
    "", "== List values created", ...(report.createdValues.length ? report.createdValues.map((line) => `  ${line}`) : ["  none"]),
    "", "== Rejected rows", ...(report.rejects.length ? report.rejects.map((line) => `  ${line}`) : ["  none"]),
    "", "== Companies skipped", ...(report.skipped.length ? report.skipped.map((line) => `  ${line}`) : ["  none"]),
  ];
  for (const [kind, entries] of report.warnings) lines.push("", `== ${kind} (${entries.length})`, ...entries.map((line) => `  ${line}`));
  await writeFile(reportPath, `${lines.join("\n")}\n`);
  console.log(lines.slice(0, 4 + Object.keys(report.counts).length + 2 + Math.max(1, Object.keys(report.decisions).length)).join("\n"));
  console.log(`\nWarnings: ${[...report.warnings.values()].reduce((total, entries) => total + entries.length, 0)}; full report in ${reportPath}`);
} catch (error) {
  await query("ROLLBACK").catch(() => undefined);
  console.error("Import failed; nothing was written.", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
