import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { after, before, describe } from "node:test";
import ExcelJS from "exceljs";
import { By, Key, Page, createDriver, outputDir, uiTest, waitForServices } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

// Move to Pipeline (request of November 19, 2026): the dialog asks the stage and the status; the deal takes the lead's details.
// At file level: both suites below use it, each with its own page.
async function moveToPipeline(page, row, name, stage, status) {
  await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Move to Pipeline")]')).click();
  await page.dialogTitle(`Move ${name} to the Pipeline`);
  await page.fill("Pipeline stage", stage);
  await page.fill("Status", status);
  await page.clickButton("Move to Pipeline");
  await page.toast(`${name} moved to the Pipeline: ${stage}, ${status}`);
}

/** Opens a deal from the top bar search (both suites below). */
async function openDeal(page, name) {
  const search = await page.wait(By.css('input[aria-label="Search all deals"]'));
  await search.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE, name, Key.ENTER);
  await page.heading("All deals");
  await page.click(By.xpath(`//tr[.//strong[normalize-space()="${name}"]]//button[contains(@class,"client-cell")]`), { global: true });
  await page.wait(By.css("div.deal-page"));
}

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
    await page.nav("Lead Generation");
    await page.heading("Lead Generation");
    await page.tab("Searches & runs");
    await page.clickButton("Add search");
    await page.dialogTitle("Add a search");
    await page.fill("Name", `Bakery staff ${runId}`);
    await page.fill("Job titles", "baker");
    await page.fill("Location", "Mississauga, ON");
    await page.clickButton("Save search");
    await page.toast("saved");
    await page.clickButton("Execute", { global: true });
    await page.toast("new companies");
    await page.tab("Inbox");
    const row = await page.wait(cardRow(company));
    assert.match(await row.getText(), /2 roles/);
    assert.match(await row.getText(), /Sample listings/);
  });

  uiTest("Move to Pipeline creates the deal at the chosen stage and status, and the card leaves the pool", async () => {
    const row = await page.wait(cardRow(company));
    await moveToPipeline(page, row, company, "Qualified", "Warm");
    await page.tab("Converted to deals");
    const assigned = await page.wait(cardRow(company));
    assert.match(await assigned.getText(), /Deal:/);
  });

  uiTest("Add deal: a near-match name meets the duplicate guard, and the exact company shows its open deals (PD-15)", async () => {
    await page.nav("Action Center");
    await page.openAddDeal();
    await page.fill("Company", "Lakeshore Bakery Co");
    await page.saveDeal();
    const notice = await page.wait(By.css(".duplicate-note"));
    assert.match(await notice.getText(), /already exists as a Warm deal/);
    await page.fill("Company", company);
    const open = await page.wait(By.css(".open-deals-note"));
    assert.match(await open.getText(), /already has an open deal/);
    await page.click(By.xpath(`//div[contains(@class,"open-deals-note")]//button[normalize-space()=${JSON.stringify(company)}]`));
    await page.dialogTitle(company);
    await page.tab("Timeline");
    await page.waitText(By.css("div.deal-page"), "Created from the leads inbox");
    await page.closeDialog();
  });

  uiTest("a lead added by hand carries its source, BD action and client response into the deal (request of November 19, 2026)", async () => {
    const manual = `Hand Added Lead ${runId}`;
    await page.nav("Leads");
    await page.clickButton("Add lead", { global: true });
    await page.dialogTitle("Add lead");
    // Company and contacts as in Add deal: "+ Add ... as new company" opens Add company with the name; a new contact opens
    // Add contact. The second contact is typed after a comma.
    const pickOption = (label) => page.click(By.xpath(`//ul[contains(@class,"suggest-list")]//li[@role="option"][contains(normalize-space(.), ${JSON.stringify(label)})]`), { global: true });
    await page.fill("Company", manual);
    await pickOption(`Add '${manual}' as new company`);
    await page.dialogTitle("Add company");
    assert.equal(await (await page.control("Name")).getAttribute("value"), manual);
    await page.clickAndClose("Save company");
    await page.dialogTitle("Add lead");
    await page.fillNamed("Contact", "Nora Hand");
    await pickOption("Add 'Nora Hand' as new contact");
    await page.dialogTitle("Add contact");
    await page.clickAndClose("Save contact");
    await page.dialogTitle("Add lead");
    await page.fillNamed("Contact", "Omar Hand,");
    await page.dialogTitle("Add contact");
    await page.clickAndClose("Save contact");
    await page.dialogTitle("Add lead");
    await page.setValue(await page.control("Lead source"), "Referral");
    await page.setValue(await page.control("BD action"), "First Call");
    await page.setValue(await page.control("Client response"), "Approach Later");
    await page.clickButton("Add lead");
    await page.toast(`${manual} added to the leads inbox`);
    const row = await page.wait(cardRow(manual));
    assert.match(await row.getText(), /Lead source: Referral/);
    assert.match(await row.getText(), /First Call/);
    assert.match(await row.getText(), /Nora Hand, Omar Hand/);
    // Leads keeps only its inbox and Not relevant.
    assert.equal((await driver.findElements(By.xpath('//button[@role="tab"][starts-with(normalize-space(.), "Converted to deals")]'))).length, 0);
    await moveToPipeline(page, row, manual, "New Deal", "Cold");
    await openDeal(page, manual);
    await page.waitText(By.css("div.deal-page"), "Referral");
    await page.waitText(By.css("div.deal-page"), "BD Action : First Call");
    await page.waitText(By.css("div.deal-page"), "Other contacts: Omar Hand");
  });

  uiTest("a card can be marked not relevant and brought back", async () => {
    await page.nav("Lead Generation");
    await page.heading("Lead Generation");
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
    await page.nav("Tracker Import");
    await page.heading("Tracker Import");
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
    // The sheet's status is the dialog's starting status.
    await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Move to Pipeline")]')).click();
    await page.dialogTitle(`Move ${company} to the Pipeline`);
    assert.equal(await page.selectedText(await page.control("Status")), "Warm");
    await page.closeDialog();
    await moveToPipeline(page, await page.wait(cardRow(company)), company, "New Deal", "Warm");
    await openDeal(page, company);
    await page.waitText(By.css("div.deal-page"), "Jamie Ortiz");
    await page.waitText(By.css("div.deal-page"), "Oakville");
    await page.tab("Timeline");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[starts-with(normalize-space(.), "First Call")]'));
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Created from the leads inbox: 2 timeline entries from the sales tracker"]'));
  });
});
