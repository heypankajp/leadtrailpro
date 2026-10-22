import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

describe("Administration and reports", () => {
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

  uiTest("adds a value to the list of values", async () => {
    await page.nav("List of values");
    await page.heading("List of values");
    await page.click(By.xpath('.//nav[contains(@class,"values-nav")]//button[starts-with(normalize-space(.), "City")]'), { global: true });
    const value = `Testville ${runId}`;
    const input = await page.wait(By.css("form.values-add input"));
    await input.sendKeys(value);
    await page.clickButton("Add value", { global: true });
    await page.toast(`Added "${value}" to City`);
    await page.wait(By.xpath(`//table//strong[normalize-space()=${xq(value)}]`));
  });

  uiTest("renames a role in settings and the sidebar follows", async () => {
    await page.nav("Settings");
    await page.heading("Settings");
    await page.fill("Admin is shown as", "Owner", { global: true });
    await page.clickButton("Save settings", { global: true });
    await page.toast("Settings saved");
    await page.waitText(By.css(".workspace-switcher strong"), "Owner");
    await page.fill("Admin is shown as", "Admin", { global: true });
    await page.clickButton("Save settings", { global: true });
    await page.toast("Settings saved");
    await page.waitText(By.css(".workspace-switcher strong"), "Admin");
  });

  uiTest("adds a needs-attention rule for a status", async () => {
    await page.clickButton("Add rule", { global: true });
    await page.setValue(await page.wait(By.css('select[aria-label="Rule 1 status"]')), "Hot");
    await page.setValue(await page.wait(By.css('input[aria-label="Rule 1 days"]')), "3");
    await page.clickButton("Save settings", { global: true });
    await page.toast("Settings saved");
    await driver.navigate().refresh();
    await page.heading("Settings");
    assert.equal(await page.selectedText(await page.wait(By.css('select[aria-label="Rule 1 status"]'))), "Hot");
    assert.equal(await (await page.wait(By.css('input[aria-label="Rule 1 days"]'))).getAttribute("value"), "3");
    await page.nav("Action center");
    await page.waitText(By.xpath('//section[contains(@class,"reminder-panel")][.//h2[normalize-space()="Needs attention"]]//p'), "1 status/action rule");
    await page.nav("Settings");
    await page.heading("Settings");
  });

  uiTest("a set-password link from the stub outbox resets the password", async () => {
    await page.nav("User management");
    await page.heading("User management");
    await page.click(By.css(`button[aria-label="Email a set-password link to ${admin.name}"]`), { global: true });
    await page.toast("set-password link was emailed");
    await page.nav("Settings");
    await page.heading("Settings");
    const row = await page.wait(By.xpath('//table[contains(@class,"outbox-table")]//tr[.//strong[normalize-space()="Reset your SalesTrackPro password"]]'));
    assert.ok((await row.getText()).includes(admin.email), "the newest outbox row is addressed to the administrator");
    await page.click(By.css(`button[aria-label="Show message to ${admin.email}"]`), { global: true });
    const body = await (await page.wait(By.css(".outbox-body"))).getText();
    const link = body.match(/https?:\/\/\S+\?reset=\S+/)?.[0];
    assert.ok(link, "the stubbed message carries the reset link");
    // The reset form is part of the signed-out screen, so sign out before following the link.
    await page.signOut();
    await driver.get(link);
    await page.heading("Choose a new password");
    await page.fill("New password", admin.password, { global: true });
    await page.fill("Confirm password", admin.password, { global: true });
    await page.clickButton("Set password", { global: true });
    await page.heading("Welcome back");
    await page.signIn(admin);
    await page.nav("Settings");
    await page.heading("Settings");
  });

  uiTest("sends the daily digest on demand to the outbox and the bell", async () => {
    await page.clickButton("Send me today's digest", { global: true });
    await page.toast("Daily digest sent");
    await page.wait(By.xpath(`//table[contains(@class,"outbox-table")]//tr[.//strong[starts-with(normalize-space(.), "Your daily SalesTrackPro digest")]]`));
    const bell = await page.wait(By.css("button.notif-button"));
    await driver.wait(async () => /\d+ unread/.test(await bell.getAttribute("aria-label")), 15000, "unread badge after the digest");
    await bell.click();
    await page.wait(By.xpath('//div[contains(@class,"notif-dropdown")]//strong[starts-with(normalize-space(.), "Daily digest:")]'));
    await page.click(By.css("button.notif-button"), { global: true });
  });

  uiTest("adds a holiday to the business calendar", async () => {
    const name = `Company holiday ${runId}`;
    const row = By.xpath(`//li[contains(@class,"holiday-row")][.//span[normalize-space()=${xq(name)}]]`);
    await page.fill("Holiday date", "2026-12-24", { global: true });
    await page.fill("Holiday name", name, { global: true });
    await page.clickButton("Add holiday", { global: true });
    await page.wait(row);
    await page.clickButton("Save settings", { global: true });
    await page.toast("Settings saved");
    await driver.navigate().refresh();
    await page.heading("Settings");
    await page.wait(row);
  });

  uiTest("creates a target template", async () => {
    await page.nav("Targets & templates");
    await page.heading("Targets & templates");
    await page.clickButton("New template", { global: true });
    await page.dialogTitle("New target template");
    const name = `Ramp-up ${runId}`;
    await page.fill("Template name", name);
    await page.fill("Stage", "Training");
    await page.fill("Leads per day", "3");
    await page.clickButton("Save template");
    await page.toast("Template created");
    await page.wait(By.xpath(`//table//strong[normalize-space()=${xq(name)}]`));
  });

  uiTest("reports open a drill-down for a metric", async () => {
    await page.nav("Reports & dashboard");
    await page.heading("Reports & dashboard");
    const firstRow = await page.wait(By.xpath('(//table[contains(@class,"report-table")]//tbody/tr)[1]'));
    const name = await firstRow.findElement(By.css("strong")).getText();
    const numbers = await firstRow.findElements(By.css("button.link-button.number"));
    await numbers[1].click(); // Calls column
    await page.dialogTitle(`${name} · calls`);
    await page.wait(By.xpath('//section[@role="dialog"]//div[contains(@class,"timeline-list")]'));
    await page.closeDialog();
  });

  uiTest("reports filter by stage and export to PDF and Excel", async () => {
    await page.setValue(await page.wait(By.css('select[aria-label="Stage"]')), "Full Productive");
    await page.wait(By.xpath('(//table[contains(@class,"report-table")]//tbody/tr)[1]'));
    await page.setValue(await page.wait(By.css('select[aria-label="Stage"]')), "All stages");
    for (const [label, type] of [["Export PDF", "application/pdf"], ["Export Excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]]) {
      const href = await (await page.wait(By.xpath(`//a[contains(normalize-space(.), "${label}")]`))).getAttribute("href");
      const response = await driver.executeAsyncScript(
        "const [url, done] = arguments; fetch(url, { credentials: 'same-origin' }).then((r) => done(`${r.status} ${r.headers.get('content-type')}`)).catch((e) => done(`error ${e}`));",
        href,
      );
      assert.match(response, new RegExp(`^200 ${type.replace(/[.+]/g, "\\$&")}`), label);
    }
  });

  uiTest("action center metrics link to the reports page", async () => {
    await page.nav("Action center");
    await page.click(By.css('button[aria-label="View Calls made report"]'), { global: true });
    await page.heading("Reports & dashboard");
  });
});
