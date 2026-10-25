import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe } from "node:test";
import { By, Key, Page, createDriver, outputDir, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

describe("Leads", () => {
  const lead = { name: `Acme Robotics ${runId}`, executive: "Priya Patel", phone: "+1 416 555 0101", email: `priya.${runId}@acme.example` };
  const uploadPath = path.join(outputDir, `upload-${runId}.txt`);
  let driver;
  let page;

  before(async () => {
    await waitForServices();
    await ensureAdmin();
    await mkdir(outputDir, { recursive: true });
    await writeFile(uploadPath, "SalesTrackPro end-to-end upload\n");
    driver = await createDriver();
    page = new Page(driver);
    await page.signIn(admin);
  });
  after(async () => { await driver?.quit(); });

  uiTest("adds a lead from the action center", async () => {
    await page.clickButton("Add a lead", { global: true });
    await page.dialogTitle("Add a new lead");
    await page.fill("Client name", lead.name);
    await page.fill("Client executive", lead.executive);
    await page.fill("Contact number", lead.phone);
    await page.fill("Client email(s)", lead.email);
    await page.fill("City", "Toronto");
    await page.fill("Client industry", "Robotics");
    await page.fill("Address", "100 King St W, Toronto");
    await page.clickButton("Save lead");
    await page.toast(`${lead.name} added to the pipeline`);
    await page.dialogTitle(lead.name);
    await page.eyebrow("LEAD OVERVIEW");
    assert.equal(await (await page.wait(By.css(".client-executive-name"))).getText(), lead.executive);
    assert.equal(await (await page.wait(By.css(".detail-owner strong"))).getText(), admin.name);
  });

  uiTest("updates the BD action from the overview", async () => {
    const select = await page.wait(By.css('select[aria-label="BD action"]'));
    await page.setValue(select, "First Call");
    await page.toast("BD action updated");
    assert.equal(await page.selectedText(await page.wait(By.css('select[aria-label="BD action"]'))), "First Call");
  });

  uiTest("logs a call and adds a note on the timeline", async () => {
    await page.tab("Timeline");
    await page.clickButton("Log call");
    await page.fill("Summary", "Intro call with Priya");
    await page.fill("Notes (optional)", "Discussed the Q1 hiring plan.");
    await page.clickButton("Save call");
    await page.toast("Activity recorded");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Intro call with Priya"]'));
    await page.clickButton("Add note");
    const note = await page.fill("Interaction note", "Client wants profiles for two welders. ");
    // NOTE-03: the toolbar wraps the selection in the rich-text markup; NOTE-04: dictation is offered where the browser supports it.
    await page.click(By.css('form.activity-form button[aria-label="Bold"]'));
    assert.match(await note.getAttribute("value"), /\*\*text\*\*$/, "the Bold button inserts the markup");
    await note.sendKeys(" urgent");
    assert.equal((await driver.findElements(By.css('form.activity-form button[aria-label="Start dictation"]'))).length, 1, "the dictation button is shown in Chromium");
    await page.click(By.css('form.activity-form button[type="submit"]'));
    await page.toast("Activity recorded");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//div[contains(@class,"timeline-body")]//p[contains(normalize-space(.), "two welders")][.//strong]'));
  });

  uiTest("a note with a follow-up instruction offers to create the task", async () => {
    await page.clickButton("Add note");
    await page.fill("Interaction note", "Great conversation. Follow up next Monday at 10am about the welders.");
    const suggestion = await page.wait(By.css(".follow-up-suggestion"));
    assert.match(await suggestion.getText(), /Create a follow-up task from this note: understood \u201cnext Monday\u201d as .* 10:00 AM/);
    assert.equal(await (await page.wait(By.css('input[aria-label="Follow-up task title"]'))).getAttribute("value"), `Follow up with ${lead.executive}`);
    await page.click(By.css('form.activity-form button[type="submit"]'));
    await page.toast("Activity recorded and follow-up task created");
    await page.wait(By.xpath(`//article[contains(@class,"timeline-entry")]//strong[starts-with(normalize-space(.), ${xq(`Task created: Follow up with ${lead.executive}`)})]`));
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[starts-with(normalize-space(.), "Follow-up scheduled for")]'));
  });

  uiTest("posts a rich-text message with a mention, replies with a quote, edits it, and removes it", async () => {
    await page.tab("Collaboration");
    const editor = await page.wait(By.css(".message-composer textarea"));
    await editor.sendKeys("Team update: **profiles** ready for @adm");
    await page.click(By.xpath('.//div[contains(@class,"mention-menu")]//button[.//strong[normalize-space()="@admin"]]'));
    assert.match(await editor.getAttribute("value"), /@admin $/, "the picker inserts the mention");
    await editor.sendKeys("\n- send by Friday");
    await page.clickButton("Post message");
    await page.toast("Message posted");
    const thread = await page.wait(By.xpath('//article[contains(@class,"message")][.//p[contains(normalize-space(.), "Team update:")]]'));
    assert.ok(await thread.findElement(By.xpath('.//strong[normalize-space()="profiles"]')), "bold renders");
    assert.ok(await thread.findElement(By.xpath('.//li[normalize-space()="send by Friday"]')), "lists render");
    await page.click(By.xpath('.//article[contains(@class,"message")]//button[normalize-space()="Quote"]'));
    await page.wait(By.xpath('.//div[contains(@class,"message-composer-head")]//strong[contains(normalize-space(.), "quoting Ada Admin")]'));
    await (await page.wait(By.css(".message-composer textarea"))).sendKeys("Noted, will do.");
    await page.clickButton("Post reply");
    await page.toast("Message posted");
    await page.wait(By.xpath('//div[contains(@class,"message-replies")]//blockquote[contains(normalize-space(.), "Team update")]'));
    const reply = By.xpath('//div[contains(@class,"message-replies")]//article[.//p[normalize-space()="Noted, will do."]]');
    await page.wait(reply);
    await page.click(By.xpath('//div[contains(@class,"message-replies")]//article[.//p[normalize-space()="Noted, will do."]]//button[normalize-space()="Edit"]'));
    const editBox = await page.wait(By.css(".message-replies textarea"));
    await editBox.clear();
    await editBox.sendKeys("Noted, will do _tomorrow_.");
    await page.clickButton("Save changes");
    await page.toast("Message updated");
    await page.wait(By.xpath('//div[contains(@class,"message-replies")]//article[.//em[normalize-space()="tomorrow"]][.//small[contains(normalize-space(.), "edited")]]'));
    await page.click(By.xpath('//div[contains(@class,"message-replies")]//article//button[normalize-space()="Remove"]'));
    await page.clickButton("Confirm removal");
    await page.toast("Message removed");
    await page.wait(By.xpath('//div[contains(@class,"message-replies")]//p[contains(@class,"message-removed")][contains(normalize-space(.), "removed by Ada Admin")]'));
    assert.match(await (await page.wait(By.xpath('.//button[@role="tab" and starts-with(normalize-space(.), "Collaboration")]'))).getText(), /1$/, "the tab counts live messages only");
  });

  uiTest("the Emails tab explains that Gmail is not configured", async () => {
    await page.tab("Emails");
    const note = await page.wait(By.css(".lead-emails .note-warning"));
    assert.match(await note.getText(), /Gmail is not configured/);
  });

  uiTest("schedules a follow-up that becomes a task", async () => {
    await page.tab("Overview");
    await page.clickButton("Schedule follow-up");
    await page.fill("What needs to happen?", "Send the proposal draft.");
    await page.clickButton("Schedule follow-up");
    await page.toast("Follow-up scheduled and added to tasks");
    await page.tab("Tasks");
    await page.wait(By.xpath(`//article[contains(@class,"task-card")]//strong[normalize-space()=${xq(`Follow up with ${lead.executive}`)}]`));
  });

  uiTest("attaches a document", async () => {
    await page.tab("Documents");
    const fileInput = await page.wait(By.css('input[type="file"]'), { visible: false });
    await fileInput.sendKeys(uploadPath);
    await page.clickButton("Add document");
    await page.toast("Document attached");
    await page.wait(By.xpath(`//div[contains(@class,"attachment-row")]//strong[normalize-space()=${xq(path.basename(uploadPath))}]`));
  });

  uiTest("edits the lead and changes its status", async () => {
    await page.clickButton("Edit");
    await page.dialogTitle(`Edit ${lead.name}`);
    await page.fill("Client executive", "Priya Patel-Singh");
    await page.clickButton("Save changes");
    await page.toast("Lead updated");
    await page.tab("Overview");
    await page.waitText(By.css(".client-executive-name"), "Priya Patel-Singh");
    const status = await page.wait(By.css('select[aria-label="Update lead status"]'));
    await page.setValue(status, "Warm");
    await page.toast("Status updated");
  });

  uiTest("a closed status asks for its reason and shows it with the status", async () => {
    await page.setValue(await page.wait(By.css('select[aria-label="Update lead status"]')), "Disqualified");
    await page.dialogTitle(`Mark ${lead.name} as Disqualified`);
    await page.fill("Status reason", "Bad Timing / Not Right Now");
    await page.clickButton("Set status");
    await page.wait(By.css('select[aria-label="Status reason"]'));
    assert.equal(await page.selectedText(await page.wait(By.css('select[aria-label="Status reason"]'))), "Bad Timing / Not Right Now");
    assert.equal(await page.selectedText(await page.wait(By.css('select[aria-label="Update lead status"]'))), "Disqualified");
    await page.tab("Timeline");
    await page.wait(By.xpath('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Status changed from Warm to Disqualified – Bad Timing / Not Right Now"]'));
    await page.tab("Overview");
    // Back to Warm for the list checks that follow; the reason select disappears once the status is open again.
    await page.setValue(await page.wait(By.css('select[aria-label="Update lead status"]')), "Warm");
    await page.driver.wait(async () => (await page.driver.findElements(By.css('select[aria-label="Status reason"]'))).length === 0, 15000, "Reason select still shown");
    assert.equal(await page.selectedText(await page.wait(By.css('select[aria-label="Update lead status"]'))), "Warm");
  });

  uiTest("finds the lead under Warm leads and by global search", async () => {
    await page.closeDialog();
    await page.nav("Warm leads");
    await page.heading("Warm leads");
    await page.waitLeadRow(lead.name);
    const search = await page.wait(By.css('input[aria-label="Search all leads"]'));
    await search.sendKeys(lead.name, Key.ENTER);
    await page.heading("All leads");
    await page.waitLeadRow(lead.name);
    await page.waitText(By.css(".page-heading .eyebrow"), "1 RECORDS");
  });

  uiTest("archives the lead and restores it from the archive", async () => {
    await page.click(By.xpath(`//tr[.//strong[normalize-space()=${xq(lead.name)}]]//button[contains(@class,"client-cell")]`), { global: true });
    await page.dialogTitle(lead.name);
    await page.clickButton("Archive");
    await page.dialogTitle(`Archive ${lead.name}`);
    await page.fill("Reason (optional)", "Duplicate record");
    await page.clickButton("Archive lead");
    await page.toast("Lead archived");
    await page.eyebrow("ARCHIVED LEAD");
    await page.closeDialog();
    await page.nav("Archive");
    await page.heading("Archive");
    const row = await page.waitLeadRow(lead.name);
    assert.match(await row.getText(), /Duplicate record/);
    await row.findElement(By.xpath('.//button[normalize-space()="Restore"]')).click();
    await page.dialogTitle("Restore lead");
    await page.clickButton("Restore");
    await page.toast("Lead restored to the pipeline");
    await page.nav("All leads");
    await page.heading("All leads");
    await page.waitLeadRow(lead.name);
  });
});
