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

  uiTest("action center metrics link to the reports page", async () => {
    await page.nav("Action center");
    await page.click(By.css('button[aria-label="View Calls made report"]'), { global: true });
    await page.heading("Reports & dashboard");
  });
});
