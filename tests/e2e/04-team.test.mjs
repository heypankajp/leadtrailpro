import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, isoDate, manager, runId } from "./helpers/data.mjs";

describe("Team, roles, and lead ownership", () => {
  const queuedLead = `Queued Co ${runId}`;
  const transferLead = `Transfer Co ${runId}`;
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

  uiTest("admin creates a sales manager account", async () => {
    await page.nav("User management");
    await page.heading("User management");
    await page.clickButton("Add user", { global: true });
    await page.dialogTitle("Add user");
    await page.fill("First name", manager.firstName);
    await page.fill("Last name", manager.lastName);
    await page.fill("Email", manager.email);
    await page.fill("Phone", manager.phone);
    await page.fill("Role", "Sales Manager");
    await page.fill("Initial password", manager.password);
    await page.fill("Confirm password", manager.password);
    await page.clickButton("Create user");
    await page.toast(`Account created for ${manager.name}`);
    await page.wait(By.xpath(`//table//tr[.//strong[normalize-space()=${xq(manager.name)}]]`));
  });

  uiTest("the sales manager sees a limited menu", async () => {
    await page.signOut();
    await page.signIn(manager);
    const labels = await Promise.all((await driver.findElements(By.css("nav.side-nav .nav-item > span"))).map((element) => element.getText()));
    assert.ok(labels.includes("My leads"), "sales managers see My leads");
    assert.ok(!labels.includes("User management"), "sales managers cannot manage users");
    assert.ok(!labels.includes("Queued leads"), "sales managers cannot review queued leads");
  });

  uiTest("a historical first-contact date queues the lead for approval", async () => {
    await page.clickButton("Add a lead", { global: true });
    await page.dialogTitle("Add a new lead");
    await page.fill("Client name", queuedLead);
    await page.fill("First contact date", isoDate(-10));
    await page.wait(By.xpath('//small[contains(@class,"field-hint") and contains(normalize-space(.), "queued for Admin approval")]'));
    await page.clickButton("Save lead");
    await page.toast(`${queuedLead} saved and queued for Admin approval`);
    await page.eyebrow("QUEUED FOR APPROVAL");
    await page.closeDialog();
  });

  uiTest("admin approves the queued lead", async () => {
    await page.signOut();
    await page.signIn(admin);
    await page.nav("Queued leads");
    await page.heading("Queued leads");
    const row = await page.waitLeadRow(queuedLead);
    await row.findElement(By.xpath('.//button[normalize-space()="Approve"]')).click();
    await page.dialogTitle(`Approve ${queuedLead}`);
    await page.fill("Comment (optional)", "Verified with the team.");
    await page.clickButton("Approve lead");
    await page.toast(`${queuedLead} approved and added to the pipeline`);
    await page.nav("All leads");
    await page.heading("All leads");
    const approved = await page.waitLeadRow(queuedLead);
    assert.match(await approved.getText(), new RegExp(manager.name), "the lead keeps its creator as owner");
  });

  uiTest("admin transfers a lead to the sales manager", async () => {
    await addLead(page, { name: transferLead });
    await page.toast(`${transferLead} added to the pipeline`);
    await page.dialogTitle(transferLead);
    await page.clickButton("Transfer");
    await page.dialogTitle("Transfer lead");
    await page.click(By.xpath(`.//article[contains(@class,"user-directory-row")][.//strong[normalize-space()=${xq(manager.name)}]]//button`));
    await page.dialogTitle(`Transfer to ${manager.name}`);
    await page.clickButton("Transfer lead");
    await page.toast(`transferred to ${manager.name}`);
    await page.waitText(By.css(".detail-owner strong"), manager.name);
    await page.closeDialog();
  });

  uiTest("terminating the manager reassigns their leads", async () => {
    await page.nav("User management");
    await page.heading("User management");
    await page.click(By.css(`button[aria-label="Terminate ${manager.name}"]`), { global: true });
    await page.dialogTitle(`Terminate ${manager.name}`);
    await page.fill("Reassign leads and tasks to", `${admin.name} (me)`);
    await page.fill("Reason (optional)", "Left the company.");
    await page.clickButton("Terminate and reassign");
    const message = await page.toast(`${manager.name} terminated`);
    assert.match(message, /2 lead\(s\)/, "the approved lead and the transferred lead move to the successor");
    await page.wait(By.xpath(`//table//tr[.//strong[normalize-space()=${xq(manager.name)}]][.//span[normalize-space()="Terminated"]]`));
  });

  uiTest("a terminated account can no longer sign in", async () => {
    await page.signOut();
    await page.fill("Email address", manager.email, { global: true });
    await page.fill("Password", manager.password, { global: true });
    await page.clickButton("Sign in", { global: true });
    assert.ok((await page.alertText()).length > 0);
    await page.heading("Welcome back");
  });
});
