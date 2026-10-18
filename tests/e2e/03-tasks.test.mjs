import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, localDateTime, runId } from "./helpers/data.mjs";

describe("Tasks and reminders", () => {
  const leadName = `Task Lead ${runId}`;
  const title = `Call about onboarding ${runId}`;
  let driver;
  let page;

  before(async () => {
    await waitForServices();
    await ensureAdmin();
    driver = await createDriver();
    page = new Page(driver);
    await page.signIn(admin);
    await addLead(page, { name: leadName });
    await page.toast(`${leadName} added to the pipeline`);
    await page.dialogTitle(leadName);
    await page.closeDialog();
  });
  after(async () => { await driver?.quit(); });

  uiTest("creates a task linked to a lead", async () => {
    await page.nav("Tasks & reminders");
    await page.heading("Tasks & reminders");
    await page.clickButton("Create task", { global: true });
    await page.dialogTitle("Create task");
    await page.fill("Title", title);
    await page.fill("Priority", "High");
    await page.fill("Due date and time", localDateTime(2, "10:00"));
    const picker = await (await page.dialog()).findElement(By.css(".lead-picker input"));
    await picker.sendKeys(leadName);
    await page.click(By.xpath(`.//span[contains(@class,"lead-picker-results")]//button[starts-with(normalize-space(.), ${xq(leadName)})]`));
    await page.wait(By.xpath(`//span[contains(@class,"chip-value") and starts-with(normalize-space(.), ${xq(leadName)})]`));
    await page.clickButton("Create task");
    await page.toast("Task created");
    const card = await page.wait(By.xpath(
      `//section[contains(@class,"task-column")][.//h2[contains(normalize-space(.),"Upcoming")]]//article[contains(@class,"task-card")][.//strong[normalize-space()=${xq(title)}]]`,
    ));
    assert.match(await card.getText(), /high priority/i);
    assert.match(await card.getText(), new RegExp(leadName));
  });

  uiTest("completes the task", async () => {
    await page.click(By.css(`button[aria-label="Complete ${title}"]`), { global: true });
    await page.toast("Task completed");
    await page.wait(By.xpath(`//section[contains(@class,"task-column")][.//h2[contains(normalize-space(.),"Done")]]//strong[normalize-space()=${xq(title)}]`));
  });

  uiTest("edits the task", async () => {
    await page.click(By.css(`button[aria-label="Edit ${title}"]`), { global: true });
    await page.dialogTitle("Edit task");
    await page.fill("Title", `${title} (updated)`);
    await page.clickButton("Save task");
    await page.toast("Task updated");
    await page.wait(By.xpath(`//strong[normalize-space()=${xq(`${title} (updated)`)}]`));
  });
});
