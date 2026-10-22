import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, addLead, baseUrl, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
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

  uiTest("admin assigns a task to the new sales manager", async () => {
    await page.nav("Tasks & reminders");
    await page.heading("Tasks & reminders");
    await page.clickButton("Create task", { global: true });
    await page.dialogTitle("Create task");
    await page.fill("Title", `Welcome call ${runId}`);
    await page.fill("Assignee", manager.name);
    await page.clickButton("Create task");
    await page.toast("Task created");
    // Back to User management, where the next test edits the account.
    await page.nav("User management");
    await page.heading("User management");
  });

  uiTest("a per-account sign-out time ends sessions started before it", async (t) => {
    // The manager signs in through the API first, so this session predates the cutoff the admin is about to set.
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ email: manager.email, password: manager.password }),
    });
    assert.equal(login.status, 200, await login.text().catch(() => ""));
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const sessionUser = async () => (await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } }).then((response) => response.json())).user;
    assert.equal((await sessionUser())?.email, manager.email);

    // Cutoff = the next whole minute in the business timezone (app-test runs with BUSINESS_TIMEZONE=America/Toronto).
    const clock = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const minutes = Number(clock.hour) * 60 + Number(clock.minute) + 1;
    if (minutes >= 24 * 60) { t.skip("too close to midnight for a same-day cutoff"); return; }
    const cutoff = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

    await page.click(By.css(`button[aria-label="Edit ${manager.name}"]`), { global: true });
    await page.dialogTitle(`Edit ${manager.name}`);
    await page.click(By.xpath('.//label[contains(normalize-space(.), "Automatic daily sign-out")]/input'));
    await page.fill("Sign out every day at", cutoff);
    await page.clickButton("Save changes");
    await page.toast(`${manager.name} updated`);
    await page.wait(By.xpath(`//table//tr[.//strong[normalize-space()=${xq(manager.name)}]]//span[contains(@class,"badge") and starts-with(normalize-space(.), "On")]`));

    // Once the cutoff passes, the session that started before it is rejected on its next request.
    const deadline = Date.now() + 90 * 1000;
    let user = await sessionUser();
    while (user && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      user = await sessionUser();
    }
    assert.equal(user, null, `the session should end once ${cutoff} passes`);
  });

  uiTest("the sales manager sees a limited menu", async () => {
    await page.signOut();
    await page.signIn(manager);
    const labels = await Promise.all((await driver.findElements(By.css("nav.side-nav .nav-item > span"))).map((element) => element.getText()));
    assert.ok(labels.includes("My leads"), "sales managers see My leads");
    assert.ok(!labels.includes("User management"), "sales managers cannot manage users");
    assert.ok(!labels.includes("Queued leads"), "sales managers cannot review queued leads");
  });

  uiTest("the assigned task appears as a notification for the sales manager", async () => {
    const bell = await page.wait(By.css("button.notif-button"));
    await driver.wait(async () => /\d+ unread/.test(await bell.getAttribute("aria-label")), 15000, "unread badge");
    await bell.click();
    await page.wait(By.xpath(`//div[contains(@class,"notif-dropdown")]//strong[normalize-space()=${xq(`Task assigned: Welcome call ${runId}`)}]`));
    await page.clickButton("Mark all read", { global: true });
    await driver.wait(async () => (await bell.getAttribute("aria-label")) === "Notifications", 15000, "badge cleared");
    await page.click(By.css("button.notif-button"), { global: true });
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
    await page.tab("Collaboration");
    await (await page.wait(By.css(".message-composer textarea"))).sendKeys(`@${manager.name} please introduce yourself this week.`);
    await page.clickButton("Post message");
    await page.toast("Message posted and mentions notified");
    await page.closeDialog();
  });

  uiTest("the mention reaches the sales manager as a notification", async () => {
    await page.signOut();
    await page.signIn(manager);
    const bell = await page.wait(By.css("button.notif-button"));
    await driver.wait(async () => /\d+ unread/.test(await bell.getAttribute("aria-label")), 15000, "unread badge after the mention");
    await bell.click();
    await page.wait(By.xpath(`//div[contains(@class,"notif-dropdown")]//strong[normalize-space()=${xq(`${admin.name} mentioned you on ${transferLead}`)}]`));
    await page.click(By.css("button.notif-button"), { global: true });
    await page.signOut();
    await page.signIn(admin);
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
