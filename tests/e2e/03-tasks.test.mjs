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

  uiTest("comments on the task with a mention, edits the comment, and removes it", async () => {
    await page.click(By.css(`button[aria-label="Edit ${title} (updated)"]`), { global: true });
    await page.dialogTitle("Edit task");
    const editor = await page.wait(By.css('.task-comment-composer textarea[aria-label="Comment"]'));
    await editor.sendKeys("Please review before the call @Ada");
    await page.click(By.xpath('.//div[contains(@class,"mention-menu")]//button[.//strong[normalize-space()="Ada Admin"]]'));
    assert.match(await editor.getAttribute("value"), /@Ada Admin $/, "the picker completes the name");
    await page.clickButton("Post comment");
    await page.toast("Comment posted");
    const comment = By.xpath('//section[contains(@class,"task-comments")]//article[contains(@class,"message")][.//p[contains(normalize-space(.), "Please review before the call")]]');
    await page.wait(comment);
    await page.waitText(By.css(".task-comments h3"), "Comments (1)");
    await page.click(By.xpath('//section[contains(@class,"task-comments")]//article//button[normalize-space()="Edit"]'));
    const editBox = await page.wait(By.css('.task-comments textarea[aria-label="Edit comment"]'));
    await editBox.clear();
    await editBox.sendKeys("Reviewed, **all good**.");
    await page.clickButton("Save changes");
    await page.toast("Comment updated");
    await page.wait(By.xpath('//section[contains(@class,"task-comments")]//article[.//strong[normalize-space()="all good"]][.//small[contains(normalize-space(.), "edited")]]'));
    await page.click(By.xpath('//section[contains(@class,"task-comments")]//article//button[normalize-space()="Remove"]'));
    await page.clickButton("Confirm removal");
    await page.toast("Comment removed");
    await page.wait(By.xpath('//section[contains(@class,"task-comments")]//p[contains(@class,"message-removed")]'));
    await page.closeDialog();
  });

  uiTest("understands a due date typed in words", async () => {
    const typed = `Send the proposal ${runId}`;
    await page.clickButton("Create task", { global: true });
    await page.dialogTitle("Create task");
    await page.fill("Title", typed);
    // "in two weeks" always lands in Upcoming whatever the weekday or the browser's timezone ("next Monday" is "today" on a Sunday evening).
    await page.fill("Type a due date", "in two weeks at 10am");
    const hint = await page.wait(By.css(".natural-date-hint.is-resolved"));
    assert.match(await hint.getText(), /Understood \u201cin two weeks\u201d as .* 10:00 AM/);
    assert.match(await (await page.control("Due date and time")).getAttribute("value"), /^\d{4}-\d{2}-\d{2}T10:00$/, "the resolved date is shown in the date picker for confirmation");
    await page.clickButton("Create task");
    await page.toast("Task created");
    await page.wait(By.xpath(`//section[contains(@class,"task-column")][.//h2[contains(normalize-space(.),"Upcoming")]]//strong[normalize-space()=${xq(typed)}]`));
  });
});
