import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

const todoTab = (label) => By.xpath(`//div[contains(@class,"todo-tabs")]//button[@role="tab" and starts-with(normalize-space(.), ${xq(label)})]`);
const badge = (name) => By.xpath(`//table[contains(@class,"lead-table")]//tr[.//strong[normalize-space()=${xq(name)}]]//small[contains(@class,"todo-badge")]`);

describe("To Do lists (TODO-*)", () => {
  const name = `Harbour Packaging ${runId}`;
  const second = `Call back ${runId}`;
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

  uiTest("a deal is put on To be visited from its page and the timeline records it", async () => {
    await addLead(page, { name, executive: "Priya Nair" });
    await page.toast(`${name} added to the pipeline`);
    const select = await page.wait(By.css('select[aria-label="To Do list"]'));
    assert.equal(await page.selectedText(select), "Not on a list");
    await page.setValue(select, "To be visited");
    await page.toast("Moved to To Do: To be visited");
    await page.tab("Timeline");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="To Do: added to To be visited"]'));
    await page.closeDialog();
  });

  uiTest("the To Do page lists it under its list, with the count on the tab and in the sidebar", async () => {
    await page.nav("To Do");
    await page.heading("To Do");
    await page.waitLeadRow(name);
    assert.match(await (await page.wait(badge(name))).getText(), /^To Do: To be visited/);
    assert.match(await (await page.wait(todoTab("To be visited"))).getText(), /To be visited\s+[1-9]/);
    assert.match(await (await page.wait(By.xpath('//nav[contains(@class,"side-nav")]//button[starts-with(normalize-space(.), "To Do")]'))).getText(), /[1-9]/);
    await page.click(todoTab("To be visited"), { global: true });
    await page.waitLeadRow(name);
  });

  uiTest("selected deals are taken off the list from the To Do page", async () => {
    await page.click(By.css(`input[aria-label=${JSON.stringify(`Select ${name}`)}]`), { global: true });
    await page.clickButton("Take off To Do", { global: true });
    await page.toast("1 deal taken off To Do");
    await page.wait(By.xpath('//td[contains(@class,"empty-state")]'));
    assert.equal((await driver.findElements(page.leadRow(name))).length, 0, "the deal left the To Do page");
  });

  uiTest("an administrator adds another list and deals are moved to it in bulk from All deals", async () => {
    await page.nav("List of values");
    await page.heading("List of values");
    await page.click(By.xpath('.//nav[contains(@class,"values-nav")]//button[starts-with(normalize-space(.), "To Do list")]'), { global: true });
    const input = await page.wait(By.css("form.values-add input"));
    await input.sendKeys(second);
    await page.clickButton("Add value", { global: true });
    await page.toast(`Added "${second}" to To Do list`);

    await page.deals("all");
    await (await page.wait(By.css('input[aria-label="Search deals"]'))).sendKeys(name);
    await page.waitLeadRow(name);
    await page.click(By.css(`input[aria-label=${JSON.stringify(`Select ${name}`)}]`), { global: true });
    await page.clickButton("Move to To Do", { global: true });
    await page.dialogTitle("Move deal to a To Do list");
    await page.setValue(await page.wait(By.css('section[role="dialog"] select[aria-label="To Do list"]')), second);
    await page.clickButton("Move deals");
    await page.toast(`1 deal moved to To Do: ${second}`);
    assert.match(await (await page.wait(badge(name))).getText(), new RegExp(`^To Do: ${second}`));

    await page.nav("To Do");
    await page.heading("To Do");
    await page.click(todoTab(second), { global: true });
    await page.waitLeadRow(name);
  });
});
