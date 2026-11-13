import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

const column = (stage) => `//section[contains(@class,"pipeline-column")][.//h2[normalize-space()=${xq(stage)}]]`;
const cardIn = (stage, name) => By.xpath(`${column(stage)}//article[contains(@class,"pipeline-card")][.//strong[normalize-space()=${xq(name)}]]`);
// The Move to… menu is a select laid over an icon, so it is driven the way the page does: value plus a change event.
const SET_SELECT = "const [el, label] = arguments; const option = [...el.options].find((item) => item.textContent === label); if (!option) throw new Error(`No option ${label}`); el.value = option.value; el.dispatchEvent(new Event('change', { bubbles: true }));";

// PD-09, SPEC §10.18: a second pipeline has its own stages and its own board; nothing changes while there is only one.
describe("Several pipelines", () => {
  const pipeline = `Renewals ${runId}`;
  const deal = `Harbour Renewal ${runId}`;
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

  uiTest("with one pipeline the board has no picker", async () => {
    await page.deals("board");
    assert.equal((await driver.findElements(By.css('select[aria-label="Pipeline"]'))).length, 0);
  });

  uiTest("an administrator adds a pipeline and gives it a stage whose name the default pipeline also uses", async () => {
    await page.nav("List of values");
    await page.heading("List of values");
    await page.click(By.xpath('.//nav[contains(@class,"values-nav")]//button[starts-with(normalize-space(.), "Pipeline stage")]'), { global: true });
    await (await page.wait(By.css('input[aria-label="New pipeline name"]'))).sendKeys(pipeline);
    await page.clickButton("Pipeline", { global: true });
    await page.toast(`Pipeline "${pipeline}" added with its first stage, New`);
    await page.wait(By.xpath('//table[contains(@class,"values-table")]//tr[.//*[normalize-space()="New"]]'));
    await (await page.wait(By.css('form.values-add:not(.pipeline-new) input'))).sendKeys("Qualified");
    await page.clickButton("Add value", { global: true });
    await page.toast('Added "Qualified" to Pipeline stage');
    assert.equal((await driver.findElements(By.xpath('//table[contains(@class,"values-table")]//tbody/tr'))).length, 2, "the list shows this pipeline's two stages only");
  });

  uiTest("a deal is added to the new pipeline and shows on its board, not on the default one", async () => {
    await page.openAddDeal();
    await page.fill("Client name", deal);
    await page.fill("Pipeline stage", `${pipeline}: New`);
    await page.clickButton("Save deal");
    await page.toast(`${deal} added to the pipeline`);
    // The stage bar of the deal has its pipeline's two steps.
    await page.wait(By.css('.stage-bar button[aria-current="step"][aria-label="New (current stage)"]'));
    assert.equal((await driver.findElements(By.css(".deal-page .stage-bar .stage-step"))).length, 2);
    await page.closeDialog();
    await page.deals("board");
    assert.equal((await driver.findElements(cardIn("New Deal", deal))).length, 0, "not on the default pipeline's board");
    await page.setValue(await page.wait(By.css('select[aria-label="Pipeline"]')), pipeline);
    await page.wait(cardIn("New", deal));
  });

  uiTest("the deal moves through its own pipeline's stages", async () => {
    const select = await page.wait(By.css(`select[aria-label="Move ${deal} to stage"]`), { visible: false });
    assert.deepEqual(await driver.executeScript("return [...arguments[0].options].map((option) => option.textContent)", select), ["New", "Qualified"]);
    await driver.executeScript(SET_SELECT, select, "Qualified");
    await page.toast(`${deal} moved to Qualified`);
    await page.dialogTitle(`What's next for ${deal}?`);
    await page.clickButton("Skip");
    await page.wait(cardIn("Qualified", deal));
  });
});
