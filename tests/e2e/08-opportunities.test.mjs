import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, createDriver, uiTest, waitForServices } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

// Runs on the sample job source (TRIPS_PROVIDER=stub): the keyword "baker" near Mississauga finds three sample companies.
describe("Opportunity pool", () => {
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
    await page.nav("Opportunities");
    await page.heading("Opportunities");
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
    await page.tab("Pool");
    const row = await page.wait(cardRow(company));
    assert.match(await row.getText(), /2 roles/);
    assert.match(await row.getText(), /Sample listings/);
  });

  uiTest("assigning a card creates the lead, pre-filled, and the card leaves the pool", async () => {
    const row = await page.wait(cardRow(company));
    await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Assign as lead")]')).click();
    await page.dialogTitle("Add a new lead");
    assert.equal(await (await page.control("Client name")).getAttribute("value"), company);
    assert.match(await (await page.control("Position(s)")).getAttribute("value"), /Baker/);
    await page.clickButton("Save lead");
    await page.toast("is now a lead owned by");
    await page.tab("Assigned as leads");
    const assigned = await page.wait(cardRow(company));
    assert.match(await assigned.getText(), /Lead:/);
  });

  uiTest("the duplicate guard stops a second lead for the same company and opens the existing one", async () => {
    await page.nav("Action center");
    await page.clickButton("Add a lead", { global: true });
    await page.dialogTitle("Add a new lead");
    await page.fill("Client name", "Lakeshore Bakery Co");
    await page.clickButton("Save lead");
    const notice = await page.wait(By.css(".duplicate-note"));
    assert.match(await notice.getText(), /already exists as a Cold lead/);
    await page.clickButton(`Open ${company}`);
    await page.dialogTitle(company);
    await page.tab("Timeline");
    await page.waitText(By.css('section[role="dialog"]'), "Created from the opportunity pool");
    await page.closeDialog();
  });

  uiTest("a card can be marked not relevant and brought back", async () => {
    await page.nav("Opportunities");
    await page.heading("Opportunities");
    await page.tab("Pool");
    const row = await page.wait(cardRow("Streetsville Pastry Kitchen"));
    await row.findElement(By.xpath('.//button[contains(normalize-space(.), "Not relevant")]')).click();
    await page.dialogTitle("Not relevant: Streetsville Pastry Kitchen");
    await page.fill("Reason", "Role not relevant");
    await page.clickButton("Mark not relevant");
    await page.toast("marked not relevant");
    await page.tab("Not relevant");
    const hidden = await page.wait(cardRow("Streetsville Pastry Kitchen"));
    assert.match(await hidden.getText(), /Role not relevant/);
    await hidden.findElement(By.xpath('.//button[contains(normalize-space(.), "Back to the pool")]')).click();
    await page.toast("back in the pool");
    await page.tab("Pool");
    await page.wait(cardRow("Streetsville Pastry Kitchen"));
  });
});
