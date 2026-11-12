import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

const column = (stage) => `//section[contains(@class,"pipeline-column")][.//h2[normalize-space()=${xq(stage)}]]`;
const cardIn = (stage, name) => By.xpath(`${column(stage)}//article[contains(@class,"pipeline-card")][.//strong[normalize-space()=${xq(name)}]]`);
// The Move to… menu is a select laid over the arrows icon (invisible to WebDriver's visibility check), so it is driven like the UI does: value plus a change event.
const SET_SELECT = "const [el, label] = arguments; const option = [...el.options].find((item) => item.textContent === label); if (!option) throw new Error(`No option ${label}`); el.value = option.value; el.dispatchEvent(new Event('change', { bubbles: true }));";

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

  uiTest("a new lead starts in New Deal and moves with the stage menu", async () => {
    await addLead(page, { name, executive: "Adam Reid" });
    await page.toast(`${name} added to the pipeline`);
    await page.closeDialog();
    await page.nav("Pipeline");
    await page.heading("Pipeline");
    await page.wait(cardIn("New Deal", name));
    const select = await page.wait(By.css(`select[aria-label="Move ${name} to stage"]`), { visible: false });
    await driver.executeScript(SET_SELECT, select, "Contact Made");
    await page.toast(`${name} moved to Contact Made`);
    await page.wait(cardIn("Contact Made", name));
    // PIPE-09: the next-step prompt follows the move; Skip is one click.
    await page.dialogTitle(`What's next for ${name}?`);
    await page.clickButton("Skip");
  });

  uiTest("undo returns the lead to its previous stage", async () => {
    await page.clickButton("Undo", { global: true });
    await page.toast(`${name} moved to New Deal`);
    await page.wait(cardIn("New Deal", name));
  });

  uiTest("a BD action from a later stage moves the lead forward and the timeline records it", async () => {
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
    await driver.wait(async () => (await driver.findElements(cardIn("Profile Shared", name))).length === 0, 10000, "the cold lead leaves the board when only warm leads are shown");
    await page.setValue(await page.wait(By.css('select[aria-label="All statuses"]')), "All statuses");
    await page.wait(cardIn("Profile Shared", name));
  });

  uiTest("the Action Center lists leads with no next step", async () => {
    const quiet = `Harbour Bakery ${runId}`;
    await addLead(page, { name: quiet });
    await page.toast(`${quiet} added to the pipeline`);
    await page.closeDialog();
    await page.nav("Action center");
    const panel = '//section[contains(@class,"reminder-panel")][.//h2[normalize-space()="No next step"]]';
    await page.wait(By.xpath(`${panel}//strong[normalize-space()=${xq(quiet)}]`));
    assert.equal((await driver.findElements(By.xpath(`${panel}//strong[normalize-space()=${xq(name)}]`))).length, 0, "a lead with an open task is not listed");
  });
});
