import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Key, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

const column = (stage) => `//section[contains(@class,"pipeline-column")][.//h2[normalize-space()=${xq(stage)}]]`;
const cardIn = (stage, name) => By.xpath(`${column(stage)}//article[contains(@class,"pipeline-card")][.//strong[normalize-space()=${xq(name)}]]`);
const statusColumn = (status) => `//section[contains(@class,"pipeline-column") and @aria-label=${xq(`${status} status`)}]`;
// HTML5 drag and drop as the browser fires it: WebDriver's own drag does not produce these events.
const DRAG = `const [card, target] = arguments; const data = new DataTransfer();
  card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));
  target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }));
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));`;
const PICK_FIRST = "const select = arguments[0]; select.selectedIndex = 1; select.dispatchEvent(new Event('change', { bubbles: true }));";

describe("Pipeline board (PIPE-*)", () => {
  const name = `Northern Fitness ${runId}`;
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

  uiTest("a new deal starts in New Deal and moves with the card's actions menu", async () => {
    await addLead(page, { name, executive: "Adam Reid" });
    await page.toast(`${name} added to the pipeline`);
    await page.closeDialog();
    await page.deals("board");
    await page.wait(cardIn("New Deal", name));
    await page.moveCard(name, "Contact Made");
    await page.toast(`${name} moved to Contact Made`);
    await page.wait(cardIn("Contact Made", name));
    // PIPE-09: the next-step prompt follows the move; Skip is one click.
    await page.dialogTitle(`What's next for ${name}?`);
    await page.clickButton("Skip");
  });

  uiTest("undo returns the deal to its previous stage", async () => {
    await page.clickButton("Undo", { global: true });
    await page.toast(`${name} moved to New Deal`);
    await page.wait(cardIn("New Deal", name));
  });

  uiTest("a BD action from a later stage moves the deal forward and the timeline records it", async () => {
    await page.click(By.xpath(`${column("New Deal")}//button[contains(@class,"pipeline-card-title")][.//strong[normalize-space()=${xq(name)}]]`), { global: true });
    await page.dialogTitle(name);
    await page.setValue(await page.wait(By.css('select[aria-label="BD action"]')), "Shared Profiles");
    await page.toast("BD action updated");
    // PIPE-09: the prompt is pre-filled from the Profile Shared suggestion (a call in three business days); save it as a task.
    await page.dialogTitle(`What's next for ${name}?`);
    assert.match(await (await page.control("Next step")).getAttribute("value"), /^Call Adam Reid$/);
    await page.fill("Next step", "Send the two welder profiles");
    await page.clickButton("Save next step");
    await page.toast("Next step saved: Send the two welder profiles");
    assert.equal(await page.selectedText(await page.wait(By.css('select[aria-label="Stage"]'))), "Profile Shared");
    await page.tab("Timeline");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Stage changed from New Deal to Profile Shared"]'));
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[starts-with(normalize-space(.), "Task created: Send the two welder profiles")]'));
    await page.closeDialog();
    await page.wait(cardIn("Profile Shared", name));
  });

  uiTest("the status filter narrows the board", async () => {
    await page.setValue(await page.wait(By.css('select[aria-label="All statuses"]')), "Warm");
    await driver.wait(async () => (await driver.findElements(cardIn("Profile Shared", name))).length === 0, 10000, "the cold deal leaves the board when only warm deals are shown");
    await page.setValue(await page.wait(By.css('select[aria-label="All statuses"]')), "All statuses");
    await page.wait(cardIn("Profile Shared", name));
  });

  uiTest("the stage bar on the deal page moves the deal after a confirmation", async () => {
    await page.click(By.xpath(`${column("Profile Shared")}//button[contains(@class,"pipeline-card-title")][.//strong[normalize-space()=${xq(name)}]]`), { global: true });
    await page.dialogTitle(name);
    assert.equal(await (await page.wait(By.css('.stage-bar button[aria-current="step"]'))).getAttribute("aria-label"), "Profile Shared (current stage)");
    await page.click(By.css('.stage-bar button[aria-label="Move to Qualified"]'));
    await page.dialogTitle(`Move ${name} to Qualified?`);
    await page.clickButton("Move to Qualified");
    await page.toast("Moved to Qualified");
    await page.dialogTitle(`What's next for ${name}?`);
    await page.clickButton("Skip");
    await page.wait(By.css('.stage-bar button[aria-current="step"][aria-label="Qualified (current stage)"]'));
    await page.closeDialog();
    await page.wait(cardIn("Qualified", name));
  });

  uiTest("the Action Center lists deals with no next step", async () => {
    const quiet = `Harbour Bakery ${runId}`;
    await addLead(page, { name: quiet });
    await page.toast(`${quiet} added to the pipeline`);
    await page.closeDialog();
    await page.nav("Action Center");
    const panel = '//section[contains(@class,"reminder-panel")][.//h2[normalize-space()="No next step"]]';
    await page.wait(By.xpath(`${panel}//strong[normalize-space()=${xq(quiet)}]`));
    assert.equal((await driver.findElements(By.xpath(`${panel}//strong[normalize-space()=${xq(name)}]`))).length, 0, "a deal with an open task is not listed");
  });

  uiTest("moves several deals to a stage from the deal list", async () => {
    const quiet = `Harbour Bakery ${runId}`;
    await page.deals("all");
    await page.click(By.css(`input[aria-label="Select ${name}"]`), { global: true });
    await page.click(By.css(`input[aria-label="Select ${quiet}"]`), { global: true });
    await page.clickButton("Move to stage", { global: true });
    await page.dialogTitle("Move 2 deals to a stage");
    await page.fill("Target stage", "Contact Made");
    await page.clickButton("Move deals");
    await page.toast("2 deals moved to Contact Made");
    for (const client of [name, quiet]) {
      await page.wait(By.xpath(`//table[contains(@class,"lead-table")]//tr[.//strong[normalize-space()=${xq(client)}]]//span[contains(@class,"stage-cell") and normalize-space()="Contact Made"]`));
    }
  });

  // PD-11, SPEC §10.15: the value is optional; once a deal has one, its card and its stage show it.
  uiTest("a deal value shows on the card and in the stage total", async () => {
    const valued = `Cedar Foods ${runId}`;
    await page.openAddDeal();
    await page.fill("Organization", valued);
    await page.fill("Value (CA$)", "25,000");
    await page.fill("Expected close date", "2026-12-15");
    await page.saveDeal();
    await page.toast(`${valued} added to the pipeline`);
    await page.wait(By.xpath('//div[contains(@class,"deal-page")]//div[contains(@class,"side-row")][small[normalize-space()="Value"]]//strong[normalize-space()="CA$25,000"]'));
    await page.closeDialog();
    await page.deals("board");
    const card = await page.wait(cardIn("New Deal", valued));
    assert.match(await card.getText(), /CA\$25,000/);
    assert.match(await (await page.wait(By.xpath(`${column("New Deal")}//header`))).getText(), /CA\$25,000 · \d+ deals?/);
  });

  // Comments of November 16, 2026 (SPEC §10.19)
  uiTest("the board uses the whole window, its columns scroll on their own, and the cards carry no next-step mark (PD-20, PD-22)", async () => {
    const [maxWidth, boardOverflow, columnOverflow] = await driver.executeScript(`
      const main = document.querySelector(".main-content"), board = document.querySelector(".pipeline-board"), body = document.querySelector(".pipeline-column-body");
      return [getComputedStyle(main).maxWidth, getComputedStyle(board).overflowX, getComputedStyle(body).overflowY];`);
    assert.deepEqual([maxWidth, boardOverflow, columnOverflow], ["none", "auto", "auto"]);
    assert.equal((await driver.findElements(By.css(".pipeline-card .deal-activity"))).length, 0);
    assert.equal(await driver.executeScript("return document.querySelector('.pipeline-board').scrollWidth > document.querySelector('.pipeline-board').clientWidth"), true, "seven stages at 1440 px scroll sideways inside the board");
  });

  uiTest("the date filter shows the deals created on a day and hides the rest (PD-23)", async () => {
    const valued = `Cedar Foods ${runId}`;
    await page.clickButton("Filters", { global: true });
    await page.setValue(await page.wait(By.css('select[aria-label="Date"]')), "Created (first contact)");
    await page.click(By.xpath('//div[@aria-label="Date filter"]//button[normalize-space()="Today"]'), { global: true });
    await page.wait(cardIn("New Deal", valued));
    await page.setValue(await page.wait(By.css('input[aria-label="From"]')), "2020-01-01");
    await page.setValue(await page.wait(By.css('input[aria-label="To"]')), "2020-01-31");
    await driver.wait(async () => (await driver.findElements(cardIn("New Deal", valued))).length === 0, 10000, "a deal created today is not in January 2020");
    await page.clickButton("Clear filters", { global: true });
    await page.wait(cardIn("New Deal", valued));
  });

  uiTest("the card's menu adds a follow-up, puts the deal on a To Do list and archives it (PD-22)", async () => {
    const valued = `Cedar Foods ${runId}`;
    await page.openCardMenu(valued);
    await page.click(By.xpath('//div[contains(@class,"card-menu")]//button[normalize-space()="Add follow-up"]'), { global: true });
    await page.dialogTitle("Schedule an activity");
    await page.fill("Note", "Send the rate card.");
    await page.clickButton("Save activity");
    await page.toast(`· ${valued}`);
    await page.waitText(cardIn("New Deal", valued), "Task");
    await page.openCardMenu(valued);
    await page.click(By.xpath('//div[contains(@class,"card-menu")]//button[normalize-space()="To be visited"]'), { global: true });
    await page.toast(`${valued} moved to To Do: To be visited`);
    await page.openCardMenu(valued);
    await page.click(By.xpath('//div[contains(@class,"card-menu")]//button[normalize-space()="Archive"]'), { global: true });
    await page.dialogTitle(`Archive ${valued}`);
    await page.clickButton("Archive deal");
    await page.toast(`${valued} archived`);
    await driver.wait(async () => (await driver.findElements(cardIn("New Deal", valued))).length === 0, 10000, "an archived deal leaves the board");
  });

  uiTest("on the board by status a drag changes the status, Lost asks for the reason, and Undo puts it back (PD-24)", async () => {
    await page.click('.view-switch button[aria-label="Board by status"]', { global: true });
    await page.wait(By.css('select[aria-label="All stages"]'));
    const card = await page.wait(By.xpath(`${statusColumn("Cold")}//article[contains(@class,"pipeline-card")][.//strong[normalize-space()=${xq(name)}]]`));
    await driver.executeScript(DRAG, card, await page.wait(By.xpath(statusColumn("Lost"))));
    await page.dialogTitle(`Mark ${name} as Lost`);
    await driver.executeScript(PICK_FIRST, await page.control("Status reason"));
    await page.clickButton("Set status");
    await page.toast(`${name} is now Lost`);
    await page.wait(By.xpath(`${statusColumn("Lost")}//article[.//strong[normalize-space()=${xq(name)}]]`));
    await page.clickButton("Undo", { global: true });
    await page.toast(`${name} is now Cold`);
    await page.wait(By.xpath(`${statusColumn("Cold")}//article[.//strong[normalize-space()=${xq(name)}]]`));
  });

  uiTest("Edit pipeline adds, renames, moves and deletes a stage (PD-21)", async () => {
    const pilot = `Pilot ${runId}`;
    const trial = `Trial ${runId}`;
    await page.deals("board");
    await page.clickButton("Edit pipeline", { global: true });
    await page.setValue(await page.wait(By.css('input[aria-label="New stage name"]')), pilot);
    await page.click(By.xpath('//form[contains(@class,"stage-add-form")]//button[normalize-space()="Stage"]'), { global: true });
    await page.toast(`Stage ${pilot} added`);
    const input = await page.wait(By.css(`input[aria-label="Stage name ${pilot}"]`));
    await page.setValue(input, trial);
    await input.sendKeys(Key.ENTER);
    await page.toast(`Stage renamed to ${trial}`);
    await page.click(`button[aria-label="Move ${trial} left"]`, { global: true });
    await page.toast(`${trial} moved left`);
    await page.click(`button[aria-label="Delete ${trial}"]`, { global: true });
    await page.dialogTitle(`Delete ${trial}?`);
    await page.clickButton("Delete stage");
    await page.toast(`${trial} deleted`);
    await driver.wait(async () => (await driver.findElements(By.css(`input[aria-label="Stage name ${trial}"]`))).length === 0, 10000, "the stage is gone");
    await page.clickButton("Done editing", { global: true });
  });

  // Second comments file of November 16, 2026 (SPEC §10.20)
  uiTest("a deal is added from its stage's menu, the top + Deal is gone, and the stage opens in the list (PD-28)", async () => {
    await page.deals("board");
    assert.equal((await driver.findElements(By.xpath('//div[contains(@class,"deals-head")]//button[normalize-space()="Deal"]'))).length, 0, "no + Deal at the top of the board");
    await page.click(By.xpath(`${column("Qualified")}//button[@aria-label="More for Qualified"]`), { global: true });
    await page.click(By.xpath('//div[contains(@class,"column-menu-list")]//button[normalize-space()="Add deal to this stage"]'), { global: true });
    await page.dialogTitle("Add deal");
    assert.equal(await page.selectedText(await page.control("Pipeline stage")), "Qualified");
    await page.closeDialog();
    await page.click(By.xpath(`${column("Qualified")}//button[@aria-label="More for Qualified"]`), { global: true });
    await page.click(By.xpath('//div[contains(@class,"column-menu-list")]//button[normalize-space()="View deals in this stage in list view"]'), { global: true });
    await page.wait(By.xpath('//button[starts-with(normalize-space(.), "Filters (1)")]'));
    await page.wait(By.xpath('//div[contains(@class,"deals-head")]//button[normalize-space()="Deal"]'));
  });

  uiTest("the Filter menu finds open deals with no next step and opens them in the list (PD-30)", async () => {
    await page.deals("board");
    await page.click(By.xpath('//div[contains(@class,"pipeline-toolbar")]//div[contains(@class,"quick-filter")]/button[contains(normalize-space(.), "Filter")]'), { global: true });
    await page.click(By.xpath('//div[contains(@class,"quick-filter-menu")]//button[normalize-space()="Open deals with no next step"]'), { global: true });
    await page.wait(By.xpath('//div[contains(@class,"pipeline-toolbar")]//span[contains(@class,"quick-filter-label") and normalize-space()="Open deals with no next step"]'));
    // This deal has an open task (the BD action test saved one), so the filter leaves it out.
    await driver.wait(async () => (await driver.findElements(By.xpath(`//article[contains(@class,"pipeline-card")][.//strong[normalize-space()=${xq(name)}]]`))).length === 0, 10000, "a deal with a next step is filtered out");
    await page.clickButton("Open in the list", { global: true });
    await page.wait(By.xpath('//span[contains(@class,"quick-filter-label") and normalize-space()="Open deals with no next step"]'));
    await page.click('button[aria-label="Clear the filter"]', { global: true });
    await driver.wait(async () => (await driver.findElements(By.css(".quick-filter-label"))).length === 0, 10000, "the filter clears");
  });
});
