import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import axe from "@axe-core/webdriverjs";
import { By, Page, createDriver, uiTest, waitForServices, addLead } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

// NFR-07: automated WCAG 2.1 A/AA audit of the main screens with axe-core. Serious and critical violations fail the
// test; moderate and minor ones are printed for follow-up.
const AxeBuilder = axe.AxeBuilder ?? axe.default ?? axe;

describe("Accessibility", () => {
  let driver;
  let page;
  const leadName = `Accessible Industries ${runId}`;

  before(async () => {
    await waitForServices();
    await ensureAdmin();
    driver = await createDriver();
    page = new Page(driver);
  });
  after(async () => { await driver?.quit(); });

  // Findings are collected across screens and asserted once at the end, so one run reports every screen.
  const blocking = [];
  const audit = async (screen) => {
    const results = await new AxeBuilder(driver).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const describe = (violation) => `${screen}: ${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(" ")).join(" | ")}${violation.nodes.length > 4 ? ` (+${violation.nodes.length - 4})` : ""}`;
    for (const violation of results.violations) {
      if (violation.impact === "serious" || violation.impact === "critical") blocking.push(describe(violation));
      else console.log(`# a11y advisory ${describe(violation)}`);
    }
  };

  uiTest("sign-in screen", async () => {
    await page.goto();
    await page.heading("Welcome back");
    await audit("sign-in");
    await page.signIn(admin);
  });

  uiTest("action center and lead list", async () => {
    await page.wait(By.css(".performance-grid"));
    await audit("action center");
    await addLead(page, { name: leadName, executive: "Ana Lee" });
    await page.toast(`${leadName} added to the pipeline`);
    await page.dialogTitle(leadName);
    await audit("lead detail dialog");
    await page.tab("Timeline");
    await audit("lead timeline");
    await page.closeDialog();
    await page.nav("All leads");
    await page.heading("All leads");
    await page.waitLeadRow(leadName);
    await audit("lead list");
  });

  uiTest("tasks, reports, settings, list of values, and the trip planner", async () => {
    await page.nav("Tasks & reminders");
    await page.heading("Tasks & reminders");
    await audit("tasks");
    await page.nav("Reports & dashboard");
    await page.heading("Reports & dashboard");
    await page.wait(By.css(".report-table"));
    await audit("reports");
    await page.nav("Settings");
    await page.heading("Settings");
    await audit("settings");
    await page.nav("List of values");
    await page.heading("List of values");
    await audit("list of values");
    await page.nav("User management");
    await page.heading("User management");
    await audit("user management");
    await page.nav("Sales trip planner");
    await page.heading("Sales trip planner");
    await audit("sales trip planner");
  });

  uiTest("no serious or critical violations on any screen", () => {
    assert.deepEqual(blocking, [], "serious or critical accessibility violations");
  });
});
