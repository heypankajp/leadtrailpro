import assert from "node:assert/strict";
import { describe, test } from "node:test";
import ExcelJS from "exceljs";
import { TrackerImportError, buildLead, cellValue, defaultOwnerMap, fileHashOf, formatReport, loadWorkbook, parseOwnerMappings, readSheet } from "../../scripts/lib/tracker-import.mjs";
import { poolCompanyKey } from "../../scripts/lib/tracker-mapping.mjs";
import { headlineCounts, orderedCounts, parseTrackerImportOptions } from "../../src/features/tracker-import/model.ts";
import { trackerCard, trackerDraft } from "../../src/features/opportunities/model.ts";
import { normalizeCompanyName } from "../../src/features/trips/matching.ts";

async function workbookBytes(rows, sheetName = "LeadsDec25") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(["Sales Leads tracker"]);
  sheet.addRow(["Sr", "Type", "Sales Manager", "First Date", "Client Name", "BD Action", "Client Response", "Status", "Address / Comments", "City", "Email"]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("tracker import library (SPEC §10.9)", () => {
  test("Sales Manager mappings: built-in map, overrides, comments, and refusals", () => {
    const result = parseOwnerMappings(["Daniel = daniel.k@example.com", "# a comment", "", "Priya=priya@example.com", "nonsense", "Eve=not-an-email"]);
    assert.equal(result.map.daniel, "daniel.k@example.com");
    assert.equal(result.map.priya, "priya@example.com");
    assert.equal(result.map.gaya, defaultOwnerMap.gaya);
    assert.deepEqual(result.errors, ['"nonsense" is not Name=email', '"Eve=not-an-email" is not Name=email']);
    assert.equal(parseOwnerMappings([]).map.adam, defaultOwnerMap.adam);
  });

  test("cell values: rich text, formulas, hyperlinks, and errors", () => {
    assert.equal(cellValue({ richText: [{ text: "Acme " }, { text: "Ltd" }] }), "Acme Ltd");
    assert.equal(cellValue({ formula: "A1+1", result: 42 }), 42);
    assert.equal(cellValue({ text: "hr@example.com", hyperlink: "mailto:hr@example.com" }), "hr@example.com");
    assert.equal(cellValue({ error: "#N/A" }), null);
    assert.equal(cellValue(null), null);
    assert.equal(cellValue("plain"), "plain");
  });

  test("the sheet is read from its header row, columns map by name, and every row gets a fingerprint", async () => {
    const bytes = await workbookBytes([
      [1, "Office", "Daniel", new Date("2026-10-20T00:00:00Z"), "Acme Ltd", "1 .Cold Call", "Approach Later", "Cold", "Spoke to reception", "Brampton", "hr@acme.example"],
      [2, "", "", "", "", "", "", "", "", "", ""],
      [3, "Road_Trip", "Gaya", new Date("2026-10-21T00:00:00Z"), "Beta Inc", "3 .Followup Call", "", "Warm", "12 Main St, Oakville, ON L6J 1A1", "Oakville", ""],
    ]);
    const workbook = await loadWorkbook(bytes);
    const { headerRow, columns, rows } = readSheet(workbook.getWorksheet("LeadsDec25"));
    assert.equal(headerRow, 2);
    assert.equal(columns.name, 5);
    assert.equal(columns.manager, 3);
    assert.equal(rows.length, 2); // the empty row is skipped
    assert.equal(rows[0].row, 3);
    assert.equal(rows[0].name, "Acme Ltd");
    assert.match(rows[0].fingerprint, /^[0-9a-f]{32}$/);
    assert.notEqual(rows[0].fingerprint, rows[1].fingerprint);
    assert.equal(fileHashOf(bytes).length, 16);
    await assert.rejects(loadWorkbook(Buffer.from("not a workbook")), (error) => error instanceof TrackerImportError && error.code === "unreadable");
  });

  test("a sheet without the Client Name header is refused", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Other").addRow(["Company", "Date"]);
    assert.throws(() => readSheet(workbook.getWorksheet("Other")), (error) => error instanceof TrackerImportError && error.code === "no_header");
  });

  test("a company's rows merge into one lead: latest non-empty wins, emails union, dates widen", () => {
    const rows = [
      { row: 5, date: "2026-10-22", name: "Acme Ltd", manager: "Daniel", type: "Office", status: "warm", action: { step: 3, name: "Followup Call" }, response: null, city: "", address: null, comments: ["2026-10-22: call back"], executive: "", phones: ["905 111 2222"], altPhones: [], contactRemark: "", emails: ["ops@acme.example"], positions: "Welder", industry: "", followUp: null, contract: null, notes: "" },
      { row: 3, date: "2026-10-20", name: "Acme Ltd", manager: "Daniel", type: "Office", status: "cold", action: { step: 1, name: "Cold Call" }, response: "Approach Later", city: "Brampton", address: "1 King St, Brampton, ON", comments: [], executive: "Pat", phones: [], altPhones: [], contactRemark: "", emails: ["hr@acme.example"], positions: "", industry: "Logistics", followUp: null, contract: null, notes: "" },
    ];
    const lead = buildLead(rows, "LeadsDec25");
    assert.equal(lead.rows[0].row, 3); // ordered by date
    assert.equal(lead.status, "warm");
    assert.equal(lead.response, "Approach Later");
    assert.equal(lead.city, "Brampton");
    assert.equal(lead.executive, "Pat");
    assert.deepEqual(lead.emails, ["hr@acme.example", "ops@acme.example"]);
    assert.equal(lead.positions, "Welder");
    assert.equal(lead.firstContact, "2026-10-20");
    assert.equal(lead.lastActivity, "2026-10-22");
    assert.equal(lead.phone, "905 111 2222");
  });

  test("the text report lists every section", () => {
    const text = formatReport({
      dryRun: true, fileName: "Sales Leads 2026.xlsx", fileHash: "abc", sheetName: "LeadsDec25", finishedAt: "2026-11-10T12:00:00Z", seconds: 1.25, actorEmail: "admin@example.com", defaultOwnerEmail: "admin@example.com", previousImportAt: null,
      counts: { "rows read from LeadsDec25": 2, "leads created (new companies)": 1 }, decisions: { 'No status in any row: "Cold" assumed': 1 }, fieldChanges: {}, createdUsers: [], createdValues: ['city: "Oakville"'],
      appEdited: [], removedRows: [], updatedLeads: [], pooled: ["Harbour Metal Works: 2 rows, status cold, last contact 2026-10-08"], rejects: ["LeadsDec25 row 9: no client name"], skipped: [], warnings: { "Status not recognised": ["LeadsDec25 row 4: \"Luke\" ignored"] },
    });
    assert.match(text, /^LeadTrailPro tracker import \(DRY RUN, nothing written\) /);
    assert.match(text, /default owner admin@example.com;/);
    assert.match(text, /== Summary\n     2  rows read from LeadsDec25\n     1  leads created/);
    assert.match(text, /== List values created\n  city: "Oakville"/);
    assert.match(text, /== Fields changed on existing leads \(sheet values applied\)\n  none/);
    assert.match(text, /== Companies placed in the opportunity pool \(no Sales Manager\)\n  Harbour Metal Works: 2 rows/);
    assert.match(text, /== Status not recognised \(1\)\n  LeadsDec25 row 4/);
  });

  test("without a default owner the report says the pool takes the unassigned companies", () => {
    const text = formatReport({
      dryRun: false, fileName: "x.xlsx", fileHash: "abc", sheetName: "LeadsDec25", finishedAt: "2026-11-10T12:00:00Z", seconds: 1, actorEmail: "admin@example.com", defaultOwnerEmail: null, previousImportAt: null,
      counts: {}, decisions: {}, fieldChanges: {}, createdUsers: [], createdValues: [], appEdited: [], removedRows: [], updatedLeads: [], pooled: [], rejects: [], skipped: [], warnings: {},
    });
    assert.match(text, /default owner none \(companies without a Sales Manager go to the opportunity pool\)/);
    assert.match(text, /== Companies placed in the opportunity pool \(no Sales Manager\)\n  none/);
  });

  test("the pool's company key follows the app's normalisation, not the import's wider one", () => {
    for (const name of ["The Acme Packaging Co., Inc.", "Harbour Metal Works Ltd", "ABC Group", "Maple & Oak SA", "  Northern   Foods  "]) {
      assert.equal(poolCompanyKey(name), normalizeCompanyName(name), name);
    }
    assert.equal(poolCompanyKey("ABC Group"), "abc group"); // the import's own key strips "group"; the pool's does not
  });
});

describe("tracker import through the app (SPEC §10.9)", () => {
  const form = (fields) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };

  test("upload options: preview by default, flags, owner lines, and refusals", () => {
    assert.deepEqual(parseTrackerImportOptions(form({})), { mode: "preview", sheetName: "LeadsDec25", archiveSheetName: null, clientsSheetName: null, keepActionNames: false, force: false, defaultOwner: null, ownerLines: [] });
    const options = parseTrackerImportOptions(form({ mode: "apply", sheet: "Leads2027", keepActionNames: "1", force: "true", defaultOwner: "Sara@SCILLTECH.com", owners: "Daniel=daniel@x.com\n\nPriya=priya@x.com; Eve=eve@x.com", archiveSheet: "ArchiveSales" }));
    assert.deepEqual(options, { mode: "apply", sheetName: "Leads2027", archiveSheetName: "ArchiveSales", clientsSheetName: null, keepActionNames: true, force: true, defaultOwner: "sara@scilltech.com", ownerLines: ["Daniel=daniel@x.com", "Priya=priya@x.com", "Eve=eve@x.com"] });
    assert.deepEqual(parseTrackerImportOptions(form({ defaultOwner: "12" })).defaultOwner, "12");
    assert.ok("error" in parseTrackerImportOptions(form({ mode: "run" })));
    assert.ok("error" in parseTrackerImportOptions(form({ defaultOwner: "nobody" })));
    assert.ok("error" in parseTrackerImportOptions(form({ owners: Array.from({ length: 51 }, (_, index) => `P${index}=p${index}@x.com`).join("\n") })));
  });

  test("the headline counts come first in a fixed order", () => {
    const ordered = orderedCounts({ "timeline entries written": 5, "rows rejected": 1, "rows read from LeadsDec25": 9, "leads created (new companies)": 2, "companies with no Sales Manager placed in the opportunity pool": 3 });
    assert.deepEqual(ordered.map(([key]) => key), ["rows read from LeadsDec25", "leads created (new companies)", "companies with no Sales Manager placed in the opportunity pool", "rows rejected", "timeline entries written"]);
    assert.ok(headlineCounts.includes("leads updated"));
  });

  test("a pool card's draft is read back with its lead and entries; junk is rejected", () => {
    const draft = {
      key: "harbour metal works", sheet: "LeadsDec25", file: "abc", importedAt: "2026-11-10 12:00:00", rows: 2,
      lead: { name: "Harbour Metal Works Ltd", type: "Office", status: "warm", action: "Followup Call", response: null, city: "Oakville", address: "", comments: "", executive: "Jamie Ortiz", phone: "905 555 0100", altPhone: "", contactRemark: "", emails: ["jamie@harbour.example"], industry: "Metal", positions: "Welder", firstContact: "2026-10-01", followUp: null, contract: null, lastActivity: "2026-10-08" },
      entries: [
        { type: "bd_action", summary: "First Call · Call Back", body: null, valueCode: "first_call", occurredAt: "2026-10-01 12:00:00", meta: { imported: true, sheet: "LeadsDec25", row: 2, fingerprint: "f1" } },
        { type: "bd_action", summary: "Followup Call", body: "Spoke to Jamie", valueCode: "followup_call", occurredAt: "2026-10-08 12:00:00", meta: { imported: true, sheet: "LeadsDec25", row: 3, fingerprint: "f2" } },
      ],
    };
    const parsed = trackerDraft(JSON.stringify(draft));
    assert.deepEqual(parsed, draft);
    assert.deepEqual(trackerDraft(draft), draft);
    const card = trackerCard(parsed);
    assert.equal(card.rows, 2);
    assert.equal(card.lead.executive, "Jamie Ortiz");
    assert.deepEqual(card.entries, [{ date: "2026-10-01", summary: "First Call · Call Back", type: "bd_action" }, { date: "2026-10-08", summary: "Followup Call", type: "bd_action" }]);
    assert.equal(trackerDraft(null), null);
    assert.equal(trackerDraft("not json"), null);
    assert.equal(trackerDraft({ lead: { name: "" } }), null);
    assert.equal(trackerCard(null), null);
    const sparse = trackerDraft({ lead: { name: "Only a name" } });
    assert.equal(sparse.lead.status, "cold");
    assert.equal(sparse.lead.type, "Office");
    assert.deepEqual(sparse.entries, []);
  });
});
