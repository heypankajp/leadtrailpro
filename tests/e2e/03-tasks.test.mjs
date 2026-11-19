import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, localDateTime, runId } from "./helpers/data.mjs";

describe("Tasks and reminders", () => {
  const leadName = `Task Deal ${runId}`;
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

  uiTest("schedules an activity linked to a deal", async () => {
    await page.nav("Activities");
    await page.heading("Activity Dashboard");
    await page.clickButton("Schedule an Activity", { global: true });
    await page.dialogTitle("Schedule an Activity");
    await page.fillNamed("Subject", title);
    await page.fillNamed("Priority", "Priority: High");
    await page.fillNamed("Date", localDateTime(2, "10:00").slice(0, 10));
    await page.fillNamed("Start time", "10:00");
    await (await page.wait(By.css('section[role="dialog"] input[aria-label="Deal"]'))).sendKeys(leadName);
    await page.click(By.xpath(`//section[@role="dialog"]//ul[contains(@class,"suggest-list")]//li[.//strong[normalize-space()=${xq(leadName)}]]`));
    await page.wait(By.xpath(`//div[contains(@class,"activity-link-field") and contains(@class,"is-set")][contains(normalize-space(.), ${xq(leadName)})]`));
    await page.clickButton("Save");
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
    await page.dialogTitle("Edit Activity");
    await page.fillNamed("Subject", `${title} (updated)`);
    await page.clickButton("Save");
    await page.toast("Task updated");
    await page.wait(By.xpath(`//strong[normalize-space()=${xq(`${title} (updated)`)}]`));
  });

  uiTest("comments on the task with a mention, edits the comment, and removes it", async () => {
    await page.click(By.css(`button[aria-label="Edit ${title} (updated)"]`), { global: true });
    await page.dialogTitle("Edit Activity");
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
    await page.clickButton("Schedule an Activity", { global: true });
    await page.dialogTitle("Schedule an Activity");
    await page.fillNamed("Subject", typed);
    // "in two weeks" always lands in Upcoming whatever the weekday or the browser's timezone ("next Monday" is "today" on a Sunday evening).
    await page.fillNamed("Type a due date", "in two weeks at 10am");
    const hint = await page.wait(By.css(".natural-date-hint.is-resolved"));
    assert.match(await hint.getText(), /Understood \u201cin two weeks\u201d as .* 10:00 AM/);
    // The resolved date and time are shown in the date and start fields for confirmation.
    assert.match(await (await page.wait(By.css('section[role="dialog"] input[aria-label="Date"]'))).getAttribute("value"), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(await (await page.wait(By.css('section[role="dialog"] input[aria-label="Start time"]'))).getAttribute("value"), "10:00");
    await page.clickButton("Save");
    await page.toast("Task created");
    await page.wait(By.xpath(`//section[contains(@class,"task-column")][.//h2[contains(normalize-space(.),"Upcoming")]]//strong[normalize-space()=${xq(typed)}]`));
  });
});
