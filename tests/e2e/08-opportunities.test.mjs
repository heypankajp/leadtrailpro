import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { after, before, describe } from "node:test";
import ExcelJS from "exceljs";
import { By, Page, createDriver, outputDir, uiTest, waitForServices } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

// Runs on the sample job source (TRIPS_PROVIDER=stub): the keyword "baker" near Mississauga finds three sample companies.
describe("Leads inbox", () => {
  const company = "Lakeshore Bakery Co.";
  const cardRow = (name) => By.xpath(`//table[contains(@class,"opp-table")]//tr[.//strong[normalize-space()="${name}"]]`);
  let driver;
  let page;

  before(async () => {
    await waitForServices();
    await ensureAdmin();
    driver = await createDriver();
    page = new Page(driver);
    await page.signIn(admin);
  });
  after(async () => { await driver?.quit(); });

  uiTest("an administrator adds a search and runs it; hiring companies appear as cards", async () => {
    await page.nav("Leads");
    await page.heading("Leads");
    await page.tab("Searches & runs");
    await page.clickButton("Add search");
    await page.dialogTitle("Add a search");
    await page.fill("Name", `Bakery staff ${runId}`);
    await page.fill("Job titles", "baker");
    await page.fill("Location", "Mississauga, ON");
    await page.clickButton("Save search");
    await page.toast("saved");
    await page.clickButton("Run searches now", { global: true });
    await page.toast("new companies");
    await page.tab("Inbox");
    const row = await page.wait(cardRow(company));
    assert.match(await row.getText(), /2 roles/);
    assert.match(await row.getText(), /Sample listings/);
  });

  uiTest("assigning a card creates the deal, pre-filled, and the card leaves the pool", async () => {
    const row = await page.wait(cardRow(company));
    await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Convert to deal")]')).click();
    await page.dialogTitle("Add deal");
    assert.equal(await (await page.control("Client name")).getAttribute("value"), company);
    assert.match(await (await page.control("Position(s)")).getAttribute("value"), /Baker/);
    await page.clickButton("Save deal");
    await page.toast("is now a deal owned by");
    await page.tab("Converted to deals");
    const assigned = await page.wait(cardRow(company));
    assert.match(await assigned.getText(), /Deal:/);
  });

  uiTest("the duplicate guard stops a second deal for the same company and opens the existing one", async () => {
    await page.nav("Action center");
    await page.openAddDeal();
    await page.fill("Client name", "Lakeshore Bakery Co");
    await page.clickButton("Save deal");
    const notice = await page.wait(By.css(".duplicate-note"));
    assert.match(await notice.getText(), /already exists as a Cold deal/);
    await page.clickButton(`Open ${company}`);
    await page.dialogTitle(company);
    await page.tab("Timeline");
    await page.waitText(By.css("div.deal-page"), "Created from the leads inbox");
    await page.closeDialog();
  });

  uiTest("a card can be marked not relevant and brought back", async () => {
    await page.nav("Leads");
    await page.heading("Leads");
    await page.tab("Inbox");
    const row = await page.wait(cardRow("Streetsville Pastry Kitchen"));
    await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Not relevant")]')).click();
    await page.dialogTitle("Not relevant: Streetsville Pastry Kitchen");
    await page.fill("Reason", "Role not relevant");
    await page.clickButton("Mark not relevant");
    await page.toast("marked not relevant");
    await page.tab("Not relevant");
    const hidden = await page.wait(cardRow("Streetsville Pastry Kitchen"));
    assert.match(await hidden.getText(), /Role not relevant/);
    await hidden.findElement(By.xpath('.//button[contains(normalize-space(.), "Back to the inbox")]')).click();
    await page.toast("back in the inbox");
    await page.tab("Inbox");
    await page.wait(cardRow("Streetsville Pastry Kitchen"));
  });
});

// The tracker import (SPEC §10.9) puts a company whose sheet rows name no Sales Manager in the inbox with its drafted lead
// and timeline; assigning the card creates the lead with that history.
describe("Leads inbox cards from the sales tracker", () => {
  const company = `Harbour Metal Works ${runId}`;
  const cardRow = (name) => By.xpath(`//table[contains(@class,"opp-table")]//tr[.//strong[normalize-space()="${name}"]]`);
  const workbookPath = path.join(outputDir, `tracker-${runId}.xlsx`);
  let driver;
  let page;

  before(async () => {
    await waitForServices();
    await ensureAdmin();
    await mkdir(outputDir, { recursive: true });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("LeadsDec25");
    sheet.addRow(["Sr", "Type", "Sales Manager", "First Date", "Client Name", "BD Action", "Client Response", "Status", "Address/Comments", "City", "Follow up Date", "Client Executive", "Contact No", "Email", "Client Industry", "Positions", "Notes"]);
    sheet.addRow([1, "Office", "", "Oct/01/26", company, "1 . Cold Call", "Call Back", "Cold", "", "Oakville", "", "Jamie Ortiz", "905 555 0100", "jamie@harbour.example", "Metal fabrication", "Welder", "Asked for a brochure"]);
    sheet.addRow([2, "Office", "", "Oct/08/26", company, "3 . Followup Call", "", "Warm", "", "Oakville", "", "Jamie Ortiz", "", "", "", "", "Interested in two welders"]);
    await workbook.xlsx.writeFile(workbookPath);
    driver = await createDriver();
    page = new Page(driver);
    await page.signIn(admin);
  });
  after(async () => { await driver?.quit(); });

  uiTest("the tracker import places a company with no Sales Manager in the inbox", async () => {
    await page.nav("Tracker import");
    await page.heading("Tracker import");
    const fileInput = await page.wait(By.css('input[type="file"]'), { visible: false });
    await fileInput.sendKeys(workbookPath);
    await page.clickButton("Preview", { global: true });
    await page.toast("Preview ready");
    await page.wait(By.xpath('//div[contains(@class,"import-count")][.//span[normalize-space()="companies with no Sales Manager placed in the leads inbox"]][.//strong[normalize-space()="1"]]'));
    await page.clickButton("Apply", { global: true });
    await page.dialogTitle("Apply the import?");
    await page.clickButton("Apply import");
    await page.toast("Sales tracker imported");
  });

  uiTest("the card shows the sheet's history, and assigning it creates the deal with that history", async () => {
    await page.nav("Leads");
    await page.heading("Leads");
    const row = await page.wait(cardRow(company));
    const text = await row.getText();
    assert.match(text, /Sales tracker/);
    assert.match(text, /2 tracker entries/);
    assert.match(text, /Jamie Ortiz/);
    await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Convert to deal")]')).click();
    await page.dialogTitle("Add deal");
    assert.equal(await (await page.control("Client name")).getAttribute("value"), company);
    assert.equal(await (await page.control("Client executive")).getAttribute("value"), "Jamie Ortiz");
    assert.equal(await (await page.control("First contact date")).getAttribute("value"), "2026-10-01");
    assert.equal(await page.selectedText(await page.control("Status")), "Warm");
    assert.equal(await page.selectedText(await page.control("City")), "Oakville");
    await page.clickButton("Save deal");
    await page.toast("is now a deal owned by");
    await page.tab("Converted to deals");
    const assigned = await page.wait(cardRow(company));
    assert.match(await assigned.getText(), /Deal:/);
    await assigned.findElement(By.xpath('.//button[normalize-space()="Open deal"]')).click();
    await page.tab("Timeline");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[starts-with(normalize-space(.), "First Call")]'));
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Created from the leads inbox: 2 timeline entries from the sales tracker"]'));
  });
});
