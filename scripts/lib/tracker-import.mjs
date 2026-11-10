import { createHash, randomBytes, scrypt } from "node:crypto";
import ExcelJS from "exceljs";
import {
  canonicalBdAction, clean, findValue, fingerprintText, isEmail, latestNonEmpty, looksLikeAddress, normalizeCompanyName, pairRowChanges, parseBdAction, parseCity,
  parseClientResponse, parseDate, parseEmails, parseLeadType, parsePhones, parseStatusCode, slugify, titleCase, truncate,
} from "./tracker-mapping.mjs";

/**
 * The incremental tracker import (SPEC §10.9), shared by the command line (scripts/import-tracker.mjs) and the app's
 * upload endpoint (src/app/api/imports/tracker). The caller opens the transaction, passes a `query(sql, params)` function
 * that understands `?` placeholders and returns `{ rows }`, and commits or rolls back (a dry run is a normal run whose
 * transaction is rolled back). Nothing here touches the file system or the network.
 */

export const defaultSheetName = "LeadsDec25";

// Sales Manager names as written in the sheet → account emails (from the workbook's MasterData sheet; Adam's is an assumption).
export const defaultOwnerMap = { daniel: "daniel@scilltech.com", david: "david@scilltech.com", gaya: "gaya@scilltech.com", sara: "sara@scilltech.com", adam: "adam@scilltech.com" };
export const ownerNotes = { adam: "email assumed: the workbook's MasterData sheet lists sara@scilltech.com for Adam" };

/** A refusal the person can act on (wrong sheet, a baseline needed, the same file again); anything else is a failure. */
export class TrackerImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** "Name=email" entries (command-line options or text-area lines) → { map, errors }. Names are matched case-insensitively. */
export function parseOwnerMappings(entries, base = defaultOwnerMap) {
  const map = { ...base };
  const errors = [];
  for (const entry of entries) {
    const text = clean(entry);
    if (!text || text.startsWith("#")) continue;
    const separator = text.indexOf("=");
    const name = separator === -1 ? "" : clean(text.slice(0, separator)).toLowerCase();
    const email = separator === -1 ? "" : clean(text.slice(separator + 1)).toLowerCase();
    if (!name || !isEmail(email)) { errors.push(`"${text}" is not Name=email`); continue; }
    map[name] = email;
  }
  return { map, errors };
}

export const fileHashOf = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

const sqlDateTime = (date) => date.toISOString().slice(0, 19).replace("T", " ");

async function hashPassword(value) {
  const salt = randomBytes(16);
  const key = await new Promise((resolve, reject) => scrypt(value, salt, 64, (error, derived) => (error ? reject(error) : resolve(derived))));
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Workbook reading
// ---------------------------------------------------------------------------------------------------------------------

/** exceljs cell values: strings, numbers, Dates, rich text, hyperlinks, formulas, errors. */
export function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== "object") return value;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if ("result" in value) return cellValue(value.result);
  if ("text" in value) return typeof value.text === "object" ? cellValue(value.text) : String(value.text);
  if ("error" in value) return null;
  return String(value);
}

const headerKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
const fingerprintOf = (raw) => createHash("sha256").update(fingerprintText(raw)).digest("hex").slice(0, 32);

export const mainAliases = {
  sr: ["sr"], type: ["type"], manager: ["salesmanager"], date: ["firstdate", "startdate", "contactdate"], name: ["clientname"], action: ["bdaction"],
  response: ["clientresponse", "clientreponse"], status: ["status"], addressOrComments: ["addresscomments", "address"], city: ["city"], followUp: ["followupdate"],
  executive: ["clientexecutive"], phone: ["contactno"], altPhone: ["extalternateno", "alternateno"], contactRemark: ["contactremark"], email: ["email"],
  industry: ["clientindustry", "industry"], positions: ["positions", "initialrequirements"], contract: ["contractsigneddate", "contractsigndate"], notes: ["notes"],
  stage: ["stage"], quarter: ["quarter"], agreementSent: ["agreementsentdate"],
};

/** Finds the header row (the one holding "Client Name") and maps logical names to 1-based column numbers. */
export function readSheet(worksheet, aliases = mainAliases) {
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
  if (!headerRow) throw new TrackerImportError("no_header", `Sheet "${worksheet.name}" has no header row with "Client Name".`);
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
    if (hasContent) { record.fingerprint = fingerprintOf(record); rows.push(record); }
  });
  return { headerRow, columns, rows };
}

export async function loadWorkbook(bytes) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch (error) {
    throw new TrackerImportError("unreadable", `The file is not a readable .xlsx workbook (${error instanceof Error ? error.message : "unknown error"}).`);
  }
  return workbook;
}

function sheetOrThrow(workbook, name, what) {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new TrackerImportError("sheet_missing", `Sheet "${name}" not found in ${what}. Sheets: ${workbook.worksheets.map((item) => item.name).join(", ")}.`, { sheets: workbook.worksheets.map((item) => item.name) });
  return sheet;
}

// ---------------------------------------------------------------------------------------------------------------------
// Row interpretation
// ---------------------------------------------------------------------------------------------------------------------

/** The most common non-empty value; the latest one on a tie. */
function mostFrequent(values) {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = null;
  for (const [value, total] of counts) if (best === null || total >= counts.get(best)) best = value;
  return best;
}

/** Rows of one company → the lead's fields (latest non-empty value per field) plus the activities to write. */
export function buildLead(rows, sheet) {
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
    commentLines: comments,
    comments: comments.join("\n"),
    executive: truncate(latestNonEmpty(rows, (row) => row.executive) ?? "", 160),
    phone: truncate(phones[0] ?? "", 40),
    altPhone: truncate(altPhones[0] ?? phones[1] ?? "", 40),
    contactRemark: truncate(remarkParts.join(" · "), 500),
    emails: [...new Set(rows.flatMap((row) => row.emails))],
    positions: [...new Set(rows.map((row) => row.positions).filter(Boolean))].join("; "),
    industry: truncate(latestNonEmpty(rows, (row) => row.industry) ?? "", 120),
    firstContact: dates[0] ?? null,
    lastActivity: dates[dates.length - 1] ?? null,
    followUp: latestNonEmpty(rows, (row) => row.followUp),
    contract: latestNonEmpty(rows, (row) => row.contract),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------------------------------

const section = (title, lines) => ["", `== ${title}`, ...(lines.length ? lines : ["  none"])];
const counted = (record) => Object.entries(record).map(([key, value]) => `${value.toString().padStart(6)}  ${key}`);
const listed = (lines) => lines.map((line) => `  ${line}`);

/** The plain-text report (what the command line writes to import-report.txt and the upload page offers for download). */
export function formatReport(report) {
  const lines = [
    `LeadTrailPro tracker import ${report.dryRun ? "(DRY RUN, nothing written) " : ""}— ${report.finishedAt}`,
    `File: ${report.fileName} (hash ${report.fileHash}); sheet ${report.sheetName}; actor ${report.actorEmail}; default owner ${report.defaultOwnerEmail}; previous import ${report.previousImportAt ?? "none"}; ${report.seconds.toFixed(1)} s`,
    "",
    "== Summary", ...counted(report.counts),
    ...section("Defaults and mappings applied", counted(report.decisions)),
    ...section("Fields changed on existing leads (sheet values applied)", counted(report.fieldChanges)),
    ...section("Accounts created", listed(report.createdUsers)),
    ...section("List values created", listed(report.createdValues)),
    ...section("Leads edited in the app since the previous import (check these)", listed(report.appEdited)),
    ...section("Rows removed from the sheet (timeline entries kept)", listed(report.removedRows)),
    ...section("Leads updated", listed(report.updatedLeads)),
    ...section("Rejected rows", listed(report.rejects)),
    ...section("Companies skipped", listed(report.skipped)),
  ];
  for (const [kind, entries] of Object.entries(report.warnings)) lines.push("", `== ${kind} (${entries.length})`, ...listed(entries));
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Runs the import inside the caller's transaction and returns the report. Options:
 *   query            (sql, params) => Promise<{ rows }>, `?` placeholders
 *   fileBytes        the workbook; fileName is used in the report and the audit entry
 *   dryRun           report only (the caller rolls back); the same workbook may be previewed again and again
 *   force            allow a workbook whose hash was already imported (rows already imported are left alone anyway)
 *   keepActionNames  keep the tracker's "Cold Call" / "Cold Email" instead of the BRD's "First Call" / "First Email"
 *   sheetName        the main sheet (LeadsDec25); archiveSheetName and clientsSheetName are opt-in
 *   baselineBytes    the workbook an earlier import (before fingerprints) was run from; stamps fingerprints by row number
 *   actorId | actorEmail   the administrator the audit entries name (default: the first active administrator)
 *   defaultOwnerEmail      the owner of leads whose rows name no Sales Manager (default: the actor)
 *   ownerMap         Sales Manager name (lower case) → account email
 *   log              progress lines
 */
export async function runTrackerImport(options) {
  const {
    query, fileBytes, fileName = "workbook.xlsx", dryRun = false, force = false, keepActionNames = false, sheetName = defaultSheetName,
    archiveSheetName = null, clientsSheetName = null, baselineBytes = null, baselineName = "baseline workbook", actorId = null, actorEmail = null,
    defaultOwnerEmail = null, ownerMap = defaultOwnerMap, log = () => undefined,
  } = options;
  const started = Date.now();
  const fileHash = fileHashOf(fileBytes);
  const todayYmd = new Date().toISOString().slice(0, 10);

  log(`Reading ${fileName} (${(fileBytes.length / 1024 / 1024).toFixed(1)} MB)…`);
  const workbook = await loadWorkbook(fileBytes);
  const main = readSheet(sheetOrThrow(workbook, sheetName, fileName), mainAliases);
  log(`${sheetName}: header on row ${main.headerRow}, ${main.rows.length} rows, columns ${Object.keys(main.columns).join(", ")}`);
  const archive = archiveSheetName ? readSheet(sheetOrThrow(workbook, archiveSheetName, fileName), mainAliases) : null;
  if (archive) log(`${archiveSheetName}: header on row ${archive.headerRow}, ${archive.rows.length} rows`);
  const clientKeys = new Set();
  if (clientsSheetName) {
    for (const raw of readSheet(sheetOrThrow(workbook, clientsSheetName, fileName), mainAliases).rows) { const key = normalizeCompanyName(clean(raw.name)); if (key) clientKeys.add(key); }
    log(`${clientsSheetName}: ${clientKeys.size} companies confirm status Client`);
  }

  // The baseline workbook: the one an earlier import (before fingerprints) was run from; its rows, by sheet row number.
  const baselineRows = new Map();
  if (baselineBytes) {
    const baselineSheet = sheetOrThrow(await loadWorkbook(baselineBytes), sheetName, baselineName);
    for (const raw of readSheet(baselineSheet, mainAliases).rows) baselineRows.set(raw.row, { fingerprint: raw.fingerprint, key: normalizeCompanyName(truncate(raw.name, 200)) });
    log(`Baseline ${baselineName}: ${baselineRows.size} rows on ${sheetName}`);
  }

  const report = { counts: {}, decisions: {}, fieldChanges: {}, warnings: new Map(), rejects: [], createdUsers: [], createdValues: [], updatedLeads: [], appEdited: [], removedRows: [], skipped: [] };
  const count = (key, by = 1) => { report.counts[key] = (report.counts[key] ?? 0) + by; };
  const decision = (key, by = 1) => { report.decisions[key] = (report.decisions[key] ?? 0) + by; };
  const warn = (kind, sheet, row, text) => { if (!report.warnings.has(kind)) report.warnings.set(kind, []); report.warnings.get(kind).push(`${sheet} row ${row}: ${text}`); };

  function interpretRow(raw, sheet) {
    const name = clean(raw.name);
    const record = { row: raw.row, sheet, name, key: normalizeCompanyName(truncate(name, 200)), fingerprint: raw.fingerprint, comments: [] }; // the key of the stored lead, whose name is cut at 200
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

  // Refuse a workbook that was already applied (a dry run may look at it again).
  const { rows: previous } = await query("SELECT details FROM audit_log WHERE action = 'import.tracker' AND details LIKE ? AND details NOT LIKE '%dry run%' ORDER BY id DESC LIMIT 1", [`%${fileHash}%`]);
  if (previous.length && !force && !dryRun) {
    throw new TrackerImportError("already_imported", `This workbook (hash ${fileHash}) was already imported: ${previous[0].details}. Run again with force to apply it anyway (rows already imported are left alone).`, { fileHash, previous: previous[0].details });
  }
  const { rows: [lastRun] } = await query("SELECT to_char(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') AS at FROM audit_log WHERE action = 'import.tracker' AND details NOT LIKE '%dry run%'");
  const lastImportAt = lastRun?.at ?? null;

  const now = new Date();
  const nowSql = sqlDateTime(now);

  // Actor and default owner.
  const userColumns = 'id, first_name AS "firstName", last_name AS "lastName", email';
  let actor = null;
  if (actorId) actor = (await query(`SELECT ${userColumns} FROM users WHERE id = ? AND is_active = TRUE`, [actorId])).rows[0];
  else if (actorEmail) actor = (await query(`SELECT ${userColumns} FROM users WHERE LOWER(email) = ?`, [actorEmail.toLowerCase()])).rows[0];
  else actor = (await query(`SELECT ${userColumns} FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`)).rows[0];
  if (!actor) throw new TrackerImportError("no_actor", actorEmail ? `No account with email ${actorEmail}.` : "Create the first administrator before importing.");
  const actorName = `${actor.firstName} ${actor.lastName}`.trim();
  const defaultOwner = defaultOwnerEmail ? (await query("SELECT id, email FROM users WHERE LOWER(email) = ? AND is_active = TRUE AND role <> 'recruiter'", [defaultOwnerEmail.toLowerCase()])).rows[0] : actor;
  if (!defaultOwner) throw new TrackerImportError("no_default_owner", `No active Sales Manager or administrator with email ${defaultOwnerEmail}.`);

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
      report.createdUsers.push(`${titleCase(managerName)} <${email}> (Sales Manager; signs in with Google${ownerNotes[key] ? `; ${ownerNotes[key]}` : ""})`);
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
  const listItem = (listKey, id) => (lists[listKey] ?? []).find((item) => item.id === id) ?? null;
  const statusIdByCode = Object.fromEntries((lists.status ?? []).map((item) => [item.code, item.id]));
  for (const code of ["cold", "warm", "hot", "client"]) if (!statusIdByCode[code]) throw new TrackerImportError("status_missing", `Status "${code}" is missing from the list of values.`);

  // Leads already in the database, one per normalised company name (an active lead first, then the oldest).
  const leadByKey = new Map();
  const leadById = new Map();
  const leadRows = (await query(
    `SELECT l.id, l.owner_id AS "ownerId", l.lead_type_id AS "leadTypeId", l.status_id AS "statusId", s.code AS "statusCode", s.value AS "statusLabel",
       l.bd_action_id AS "bdActionId", l.client_response_id AS "clientResponseId", l.city_id AS "cityId", l.client_name AS "clientName", l.address, l.comments,
       l.client_executive AS "clientExecutive", l.contact_phone AS "contactPhone", l.contact_alt_phone AS "contactAltPhone", l.contact_remark AS "contactRemark",
       l.client_emails AS "clientEmails", l.industry, l.positions, to_char(l.first_contact_date, 'YYYY-MM-DD') AS "firstContactDate",
       to_char(l.follow_up_date, 'YYYY-MM-DD') AS "followUpDate", to_char(l.contract_signed_date, 'YYYY-MM-DD') AS "contractSignedDate",
       to_char(l.last_activity_at, 'YYYY-MM-DD HH24:MI:SS') AS "lastActivityAt", l.record_state AS "recordState"
     FROM leads l JOIN list_values s ON s.id = l.status_id ORDER BY (l.record_state = 'active') DESC, l.id`,
  )).rows;
  for (const lead of leadRows) {
    lead.key = normalizeCompanyName(lead.clientName);
    leadById.set(lead.id, lead);
    if (lead.key && !leadByKey.has(lead.key)) leadByKey.set(lead.key, lead);
  }

  // Leads changed in the app since the previous import (any lead audit entry that the import did not write).
  const appEdits = new Map();
  if (lastImportAt) {
    const { rows: edited } = await query(
      "SELECT entity_id AS \"leadId\", to_char(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') AS at FROM audit_log WHERE entity_type = 'lead' AND action LIKE 'lead.%' AND created_at > ?::timestamp AND COALESCE(details, '') NOT LIKE '%sales tracker%' GROUP BY entity_id",
      [lastImportAt],
    );
    for (const row of edited) appEdits.set(Number(row.leadId), row.at);
  }

  // Timeline entries written by earlier imports of the main sheet, by row fingerprint.
  const imported = (await query(
    "SELECT id, lead_id AS \"leadId\", summary, to_char(occurred_at, 'YYYY-MM-DD') AS date, meta FROM lead_activities WHERE activity_type <> 'created' AND meta->>'imported' = 'true' AND meta->>'sheet' = ? ORDER BY id",
    [sheetName],
  )).rows;
  const unstamped = imported.filter((entry) => !entry.meta?.fingerprint);
  if (unstamped.length && !baselineRows.size) {
    throw new TrackerImportError("needs_baseline", `${unstamped.length} timeline entries from an earlier import of ${sheetName} carry no row fingerprint. Run once with the baseline workbook (the one that import was run from) so they can be matched; later runs need no baseline.`, { unstamped: unstamped.length });
  }
  for (const entry of unstamped) {
    const baseline = baselineRows.get(Number(entry.meta?.row));
    const lead = leadById.get(entry.leadId);
    if (!baseline || !lead || baseline.key !== lead.key) { warn("Baseline row does not match the timeline entry", sheetName, entry.meta?.row ?? "?", `${lead?.clientName ?? `lead ${entry.leadId}`}: left without a fingerprint`); continue; }
    await query("UPDATE lead_activities SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('fingerprint', ?::text) WHERE id = ?", [baseline.fingerprint, entry.id]);
    entry.meta = { ...(entry.meta ?? {}), fingerprint: baseline.fingerprint };
    count("timeline entries stamped from the baseline workbook");
  }
  const known = new Map();
  for (const entry of imported) if (entry.meta?.fingerprint) (known.get(entry.meta.fingerprint) ?? known.set(entry.meta.fingerprint, []).get(entry.meta.fingerprint)).push(entry);

  // Interpret the main sheet; split its rows into unchanged, new, edited, and removed.
  const allRows = new Map(); // company key → every row of the sheet (for rebuilding the lead's fields)
  const addedRows = [];
  for (const raw of main.rows) {
    const record = interpretRow(raw, sheetName);
    if (!record.key) { report.rejects.push(`${sheetName} row ${raw.row}: no client name`); count("rows rejected"); continue; }
    (allRows.get(record.key) ?? allRows.set(record.key, []).get(record.key)).push(record);
    count(`rows read from ${sheetName}`);
    const matches = known.get(record.fingerprint);
    if (matches?.length) { matches.shift(); count("rows unchanged since the previous import"); continue; }
    addedRows.push({ key: record.key, date: record.date, record });
  }
  const vanished = [];
  for (const entries of known.values()) for (const entry of entries) vanished.push({ key: leadById.get(entry.leadId)?.key ?? "", date: entry.date, entry });
  if (addedRows.length) count("rows not seen before (new or edited)", addedRows.length);
  if (vanished.length) count("rows of the previous import no longer in the sheet (edited or deleted)", vanished.length);
  const changes = pairRowChanges(vanished, addedRows);
  const editsByKey = new Map();
  for (const [old, fresh] of changes.edits) (editsByKey.get(fresh.key) ?? editsByKey.set(fresh.key, []).get(fresh.key)).push({ entry: old.entry, record: fresh.record });
  const insertsByKey = new Map();
  for (const item of changes.inserts) (insertsByKey.get(item.key) ?? insertsByKey.set(item.key, []).get(item.key)).push(item.record);
  for (const item of changes.removed) {
    const lead = leadById.get(item.entry.leadId);
    report.removedRows.push(`${lead?.clientName ?? `lead ${item.entry.leadId}`}: "${item.entry.summary}" (${item.entry.date}; ${sheetName} row ${item.entry.meta?.row ?? "?"} of the previous workbook)`);
    count("rows removed from the sheet (timeline entries kept)");
  }

  const activityInsert = (leadId, entry) => query(
    "INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, body, value_code, meta, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [leadId, entry.userId, entry.type, truncate(entry.summary, 500), entry.body || null, entry.valueCode, JSON.stringify(entry.meta), entry.occurredAt, nowSql],
  );

  /** The timeline entry one sheet row becomes. */
  async function rowActivity(row, fallbackDate) {
    const date = row.date ?? fallbackDate;
    const rowAction = row.action ? canonicalBdAction(row.action.name, keepActionNames) : null;
    let type = "note";
    let summary = row.notes || row.contactRemark || "Interaction recorded in the tracker";
    let valueCode = null;
    let body = null;
    if (rowAction) {
      type = "bd_action";
      summary = row.response ? `${rowAction} · ${row.response}` : rowAction;
      valueCode = listItem("bd_action", await ensureValue("bd_action", rowAction))?.code ?? null;
      body = [row.notes, row.contactRemark].filter(Boolean).join("\n") || null;
    } else if (row.response) {
      type = "client_response";
      summary = row.response;
      valueCode = listItem("client_response", await ensureValue("client_response", row.response))?.code ?? null;
      body = [row.notes, row.contactRemark].filter(Boolean).join("\n") || null;
    } else if (summary.length > 500) {
      body = summary; // the summary is cut at 500 characters; the full note stays in the body
    }
    return {
      userId: await ownerFor(row.manager), type, summary, body, valueCode, occurredAt: `${date} 12:00:00`,
      meta: { imported: true, sheet: row.sheet, row: row.row, fingerprint: row.fingerprint, step: row.action?.step ?? null, status: row.status, type: row.type, manager: row.manager || null },
    };
  }

  async function insertLead(lead, insertOptions) {
    const ownerId = await ownerFor(lead.manager);
    if (!lead.manager) decision("Leads with no Sales Manager in any row: assigned to the default owner");
    let leadType = lead.type;
    if (!leadType) { leadType = "Office"; decision('No lead type in any row: "Office" assumed'); }
    let statusCode = lead.status ?? "cold";
    if (!lead.status) decision('No status in any row: "Cold" assumed');
    if (!insertOptions.archived && clientKeys.has(lead.rows[0].key) && statusCode !== "client") { statusCode = "client"; decision('Listed on the Clients sheet: status set to "Client"'); }
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
        insertOptions.archived ? "archived" : "active", insertOptions.archived ? insertOptions.reason : null, insertOptions.archived ? actor.id : null, insertOptions.archived ? nowSql : null,
        `${lead.lastActivity ?? firstContact} 12:00:00`, `${firstContact} 09:00:00`,
      ],
    );
    const leadId = created.id;
    await activityInsert(leadId, {
      userId: ownerId, type: "created", summary: `Lead imported from the sales tracker (${insertOptions.archived ? "archive sheet" : `first contact ${firstContact}`})`, body: null, valueCode: statusCode,
      meta: { imported: true, sheet: lead.sheet, rows: lead.rows.length, file: fileHash }, occurredAt: `${firstContact} 09:00:00`,
    });
    count("timeline entries written");
    if (!insertOptions.archived) {
      for (const row of lead.rows) { await activityInsert(leadId, await rowActivity(row, firstContact)); count("timeline entries written"); }
    }
    await query("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after_json, details, created_at) VALUES (?, 'lead.created', 'lead', ?, ?, ?, ?)", [
      actor.id, leadId, JSON.stringify({ clientName: lead.name, status: statusCode, source: "tracker", sheet: lead.sheet, rows: lead.rows.length, archived: Boolean(insertOptions.archived) }),
      `${actorName} imported ${lead.name} from the sales tracker (${lead.rows.length} row${lead.rows.length === 1 ? "" : "s"})`, nowSql,
    ]);
    const summary = { id: leadId, key: lead.rows[0].key, clientName: lead.name, statusId: statusIdByCode[statusCode], statusCode, recordState: insertOptions.archived ? "archived" : "active" };
    leadById.set(leadId, summary);
    leadByKey.set(summary.key, summary);
    return leadId;
  }

  /** New and edited rows of a company already in the database: timeline entries first, then the lead's fields from the whole sheet. */
  async function updateLead(existing, lead, edits, inserts) {
    const fallbackDate = existing.firstContactDate ?? lead.firstContact ?? todayYmd;
    for (const { entry, record } of edits) {
      const activity = await rowActivity(record, fallbackDate);
      await query("UPDATE lead_activities SET user_id = ?, activity_type = ?, summary = ?, body = ?, value_code = ?, meta = ?, occurred_at = ? WHERE id = ?", [
        activity.userId, activity.type, truncate(activity.summary, 500), activity.body || null, activity.valueCode, JSON.stringify(activity.meta), activity.occurredAt, entry.id,
      ]);
      count("timeline entries updated (edited rows)");
    }
    for (const record of inserts) { await activityInsert(existing.id, await rowActivity(record, fallbackDate)); count("timeline entries added (new rows)"); }

    const changed = []; // { column, label, before, after }
    const change = (column, label, before, after) => { if (before !== after) changed.push({ column, label, before, after }); };
    const statusId = lead.status ? statusIdByCode[lead.status] : null;
    if (statusId && statusId !== existing.statusId) { change("status_id", "status", existing.statusId, statusId); changed.push({ column: "status_reason_id", label: null, before: undefined, after: null }); }
    const actionName = lead.action ? canonicalBdAction(lead.action.name, keepActionNames) : null;
    if (actionName) change("bd_action_id", "BD action", existing.bdActionId, await ensureValue("bd_action", actionName));
    if (lead.response) change("client_response_id", "client response", existing.clientResponseId, await ensureValue("client_response", lead.response));
    if (lead.city) change("city_id", "city", existing.cityId, await ensureValue("city", lead.city));
    if (lead.type) change("lead_type_id", "lead type", existing.leadTypeId, await ensureValue("lead_type", lead.type));
    if (lead.manager) change("owner_id", "owner", existing.ownerId, await ownerFor(lead.manager));
    if (lead.address) change("address", "address", existing.address, lead.address);
    if (lead.executive) change("client_executive", "client executive", existing.clientExecutive, lead.executive);
    if (lead.phone) change("contact_phone", "contact phone", existing.contactPhone, lead.phone);
    if (lead.altPhone) change("contact_alt_phone", "alternate phone", existing.contactAltPhone, lead.altPhone);
    if (lead.contactRemark) change("contact_remark", "contact remark", existing.contactRemark, lead.contactRemark);
    if (lead.industry) change("industry", "industry", existing.industry, lead.industry);
    const existingEmails = Array.isArray(existing.clientEmails) ? existing.clientEmails : [];
    const emails = [...new Set([...existingEmails, ...lead.emails])];
    if (emails.length !== existingEmails.length) change("client_emails", "client emails", JSON.stringify(existingEmails), JSON.stringify(emails));
    const existingPositions = clean(existing.positions).split(/\s*;\s*/).filter(Boolean);
    const positions = [...new Set([...existingPositions, ...lead.positions.split(/\s*;\s*/).filter(Boolean)])].join("; ");
    if (positions && positions !== existingPositions.join("; ")) change("positions", "positions", existing.positions, positions);
    const newComments = lead.commentLines.filter((line) => !(existing.comments ?? "").includes(line));
    if (newComments.length) change("comments", "comments", existing.comments, [existing.comments, ...newComments].filter(Boolean).join("\n"));
    if (lead.firstContact && (!existing.firstContactDate || lead.firstContact < existing.firstContactDate)) change("first_contact_date", "first contact date", existing.firstContactDate, lead.firstContact);
    if (lead.followUp) change("follow_up_date", "follow-up date", existing.followUpDate, lead.followUp);
    if (lead.contract) change("contract_signed_date", "contract signed date", existing.contractSignedDate, lead.contract);
    const lastActivity = lead.lastActivity ? `${lead.lastActivity} 12:00:00` : null;
    if (lastActivity && (!existing.lastActivityAt || lastActivity > existing.lastActivityAt)) change("last_activity_at", null, existing.lastActivityAt, lastActivity);
    if (!changed.length) { count("leads with new rows but no field changes"); return; }

    await query(`UPDATE leads SET ${changed.map((item) => `${item.column} = ?`).join(", ")} WHERE id = ?`, [...changed.map((item) => item.after), existing.id]);
    const labels = changed.filter((item) => item.label).map((item) => item.label);
    for (const label of labels) report.fieldChanges[label] = (report.fieldChanges[label] ?? 0) + 1;
    const rowDates = [...edits.map((item) => item.record.date), ...inserts.map((record) => record.date)].filter(Boolean).sort();
    const occurredAt = `${rowDates[rowDates.length - 1] ?? lead.lastActivity ?? todayYmd} 12:00:01`;
    const ownerId = await ownerFor(lead.manager);
    if (statusId && statusId !== existing.statusId) {
      const toLabel = listItem("status", statusId)?.value ?? lead.status;
      await activityInsert(existing.id, {
        userId: ownerId, type: "status_change", summary: `Status changed from ${existing.statusLabel} to ${toLabel} (sales tracker)`, body: null, valueCode: lead.status,
        meta: { imported: true, sheet: sheetName, fromStatusId: existing.statusId, toStatusId: statusId, fromCode: existing.statusCode, toCode: lead.status }, occurredAt,
      });
      count("status changes applied from the sheet");
    }
    const otherLabels = labels.filter((label) => label !== "status");
    if (otherLabels.length) {
      await activityInsert(existing.id, { userId: ownerId, type: "edit", summary: `Updated ${otherLabels.join(", ")} from the sales tracker`, body: null, valueCode: null, meta: { imported: true, sheet: sheetName, fields: otherLabels }, occurredAt });
    }
    const audited = changed.filter((item) => item.label);
    await query("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before_json, after_json, details, created_at) VALUES (?, 'lead.updated', 'lead', ?, ?, ?, ?, ?)", [
      actor.id, existing.id, JSON.stringify(Object.fromEntries(audited.map((item) => [item.column, item.before ?? null]))), JSON.stringify(Object.fromEntries(audited.map((item) => [item.column, item.after]))),
      truncate(`${actorName} updated ${labels.join(", ")} on ${existing.clientName} from the sales tracker (${edits.length} edited, ${inserts.length} new row${inserts.length === 1 ? "" : "s"})`, 500), nowSql,
    ]);
    count("leads updated");
    report.updatedLeads.push(`${existing.clientName}: ${labels.join(", ")} (${edits.length} edited, ${inserts.length} new row${inserts.length === 1 ? "" : "s"})`);
    if (appEdits.has(existing.id)) report.appEdited.push(`${existing.clientName}: changed in the app on ${appEdits.get(existing.id)}, after the previous import on ${lastImportAt}; the sheet's values were applied to ${labels.join(", ")}`);
    if (existing.recordState && existing.recordState !== "active") count(`leads updated that are ${existing.recordState}`);
  }

  const touched = new Set([...editsByKey.keys(), ...insertsByKey.keys()]);
  let done = 0;
  for (const key of touched) {
    const rows = allRows.get(key) ?? [];
    const existing = leadByKey.get(key);
    const edits = editsByKey.get(key) ?? [];
    const inserts = insertsByKey.get(key) ?? [];
    if (!rows.length) { for (const { entry } of edits) report.removedRows.push(`lead ${entry.leadId}: "${entry.summary}" (${entry.date})`); continue; }
    const lead = buildLead([...rows], sheetName);
    if (existing) await updateLead(existing, lead, edits, inserts);
    else { await insertLead(lead, { archived: false }); count("leads created (new companies)"); }
    done += 1;
    if (done % 500 === 0) log(`  ${done} companies…`);
  }

  if (archive) {
    const groups = new Map();
    for (const raw of archive.rows) {
      const record = interpretRow(raw, archiveSheetName);
      if (!record.key) { report.rejects.push(`${archiveSheetName} row ${raw.row}: no client name`); count("rows rejected"); continue; }
      (groups.get(record.key) ?? groups.set(record.key, []).get(record.key)).push(record);
      count(`rows read from ${archiveSheetName}`);
    }
    for (const [key, rows] of groups) {
      if (leadByKey.has(key)) { report.skipped.push(`${rows[0].name} (archive sheet): already present`); count("archive companies skipped (already present)"); continue; }
      const lead = buildLead(rows, archiveSheetName);
      lead.type ??= "Office";
      await insertLead(lead, { archived: true, reason: "Imported from the 2021–22 archive sheet of the sales tracker" });
      count("archived leads created from the archive sheet");
    }
  }

  const summary = Object.entries(report.counts).map(([key, value]) => `${key}: ${value}`).join(", ");
  await query("INSERT INTO audit_log (actor_id, action, entity_type, details, created_at) VALUES (?, 'import.tracker', 'setting', ?, ?)", [actor.id, truncate(`${actorName} imported ${fileName} (hash ${fileHash}${dryRun ? ", dry run" : ""}): ${summary}`, 500), nowSql]);

  const warnings = Object.fromEntries(report.warnings);
  const result = {
    dryRun, fileName, fileHash, sheetName, finishedAt: new Date().toISOString(), seconds: (Date.now() - started) / 1000,
    actorEmail: actor.email, defaultOwnerEmail: defaultOwner.email, previousImportAt: lastImportAt,
    counts: report.counts, decisions: report.decisions, fieldChanges: report.fieldChanges,
    createdUsers: report.createdUsers, createdValues: report.createdValues, appEdited: report.appEdited, removedRows: report.removedRows,
    updatedLeads: report.updatedLeads, rejects: report.rejects, skipped: report.skipped,
    warnings, warningCount: Object.values(warnings).reduce((total, entries) => total + entries.length, 0),
    text: "",
  };
  result.text = formatReport(result);
  return result;
}
