import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, isoDate, runId } from "./helpers/data.mjs";

const todoTab = (label) => By.xpath(`//div[contains(@class,"todo-tabs")]//button[@role="tab" and starts-with(normalize-space(.), ${xq(label)})]`);
const tripLink = (title) => By.xpath(`//table[contains(@class,"trip-table")]//button[contains(@class,"trip-title") and normalize-space()=${xq(title)}]`);

// Sales Trips (review of November 18, 2026; PRD PD-39..41, SPEC §10.21).
describe("Sales Trips (PD-39..41)", () => {
  const name = `Birch Logistics ${runId}`;
  const title = `Brampton round ${runId}`;
  const tripDate = isoDate(2);
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

  const openToBeVisited = async () => {
    await page.nav("To Do");
    await page.heading("To Do");
    await page.click(todoTab("To be visited"), { global: true });
  };

  uiTest("a deal on To be visited is put on a new sales trip and leaves the list", async () => {
    await addLead(page, { name, executive: "Dana Brooks" });
    await page.toast(`${name} added to the pipeline`);
    await page.closeDialog();
    // The deal page has no To Do list control since November 19, 2026: the Pipeline list's bulk action puts it on the list.
    await page.deals("all");
    await (await page.wait(By.css('input[aria-label="Search deals"]'))).sendKeys(name);
    await page.waitLeadRow(name);
    await page.click(By.css(`input[aria-label=${JSON.stringify(`Select ${name}`)}]`), { global: true });
    await page.clickButton("Move to To Do", { global: true });
    await page.dialogTitle("Move deal to a To Do list");
    await page.setValue(await page.wait(By.css('section[role="dialog"] select[aria-label="To Do list"]')), "To be visited");
    await page.clickButton("Move deals");
    await page.toast("1 deal moved to To Do: To be visited");

    await openToBeVisited();
    await page.waitLeadRow(name);
    await page.click(By.css(`input[aria-label=${JSON.stringify(`Select ${name}`)}]`), { global: true });
    await page.clickButton("Add to sales trip", { global: true });
    // With trips already planned the dialog offers them first; a new trip is one click away.
    await driver.wait(async () => (await driver.findElements(By.xpath('//section[@role="dialog"]//h2[normalize-space()="New sales trip"] | //button[contains(normalize-space(.), "Plan a new sales trip instead")]'))).length > 0, 15000, "the add-to-trip dialog opens");
    const instead = await driver.findElements(By.xpath('//button[contains(normalize-space(.), "Plan a new sales trip instead")]'));
    if (instead.length) await instead[0].click();
    await page.dialogTitle("New sales trip");
    await page.fill("Title", title);
    await page.fill("Date", tripDate);
    await page.clickButton("Plan sales trip");
    await page.toast(`1 deal added to the new sales trip ${title}`);
    // The trip's page opens with the deal on it.
    await page.heading(title);
    await page.waitLeadRow(name);

    await openToBeVisited();
    await driver.wait(async () => (await driver.findElements(page.leadRow(name))).length === 0, 10000, "the deal left To be visited");
  });

  uiTest("Sales Trips finds the trip by a company on it and by its date (By Period)", async () => {
    await page.nav("Sales Trips");
    await page.heading("Sales Trips");
    await page.click(By.xpath('//div[@aria-label="Whose trips"]/button[normalize-space()="Everyone"]'), { global: true });
    const search = await page.wait(By.css('input[aria-label="Search sales trips"]'));
    await search.sendKeys(name);
    await page.wait(tripLink(title));
    await page.setValue(search, `nothing-${runId}`);
    await page.wait(By.xpath('//*[normalize-space()="No sales trip matches these filters"]'));
    await page.setValue(search, "");
    await page.clickButton("By Period", { global: true });
    await page.pickPeriod("By Period", tripDate);
    await page.wait(tripLink(title));
    await page.click(By.css('button[aria-label="Clear By Period"]'), { global: true });
  });

  uiTest("deleting the trip asks what happens to its deals, and Move back to To Do returns the deal to To be visited", async () => {
    await page.click(tripLink(title), { global: true });
    await page.heading(title);
    await page.clickButton("Delete", { global: true });
    await page.dialogTitle(`Delete ${title}?`);
    const chosen = await page.wait(By.xpath('//label[contains(@class,"trip-delete-option")][.//strong[normalize-space()="Move back to To Do"]]//input'));
    assert.equal(await chosen.isSelected(), true, "Move back to To Do is the default");
    await page.wait(By.xpath('//label[contains(@class,"trip-delete-option")]//strong[normalize-space()="Keep in the Pipeline only"]'));
    await page.wait(By.xpath('//label[contains(@class,"trip-delete-option")]//strong[normalize-space()="Archive the deals"]'));
    await page.clickButton("Delete trip");
    await page.toast(`Sales trip ${title} deleted`);
    await page.heading("Sales Trips");

    await openToBeVisited();
    await page.waitLeadRow(name);
  });
});
