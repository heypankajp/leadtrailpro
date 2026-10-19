import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, baseUrl, createDriver, uiTest, waitForServices } from "./helpers/ui.mjs";
import { admin, managementKey } from "./helpers/data.mjs";

describe("Sign-in and first-time setup", () => {
  let driver;
  let page;

  before(async () => {
    await waitForServices();
    driver = await createDriver();
    page = new Page(driver);
  });
  after(async () => { await driver?.quit(); });

  uiTest("shows the sign-in screen", async () => {
    await page.goto();
    await page.heading("Welcome back");
    assert.ok(await page.control("Email address", true));
  });

  uiTest("creates the first administrator from the setup link", async (t) => {
    const session = await fetch(`${baseUrl}/api/auth/session`).then((response) => response.json());
    if (!session.needsSetup) {
      t.skip("an account already exists");
      return;
    }
    await page.clickButton("First time setup? Create the initial administrator account", { global: true });
    await page.heading("Create the first administrator");
    await page.fill("User-management key", managementKey, { global: true });
    await page.fill("First name", admin.firstName, { global: true });
    await page.fill("Last name", admin.lastName, { global: true });
    await page.fill("Email", admin.email, { global: true });
    await page.fill("Phone", admin.phone, { global: true });
    await page.fill("Password", admin.password, { global: true });
    await page.fill("Confirm password", admin.password, { global: true });
    await page.clickButton("Create administrator", { global: true });
    await page.wait(By.css("nav.side-nav"));
    const greeting = await (await page.wait(By.css(".welcome-row h1"))).getText();
    assert.match(greeting, new RegExp(admin.firstName));
  });

  uiTest("signs out and the setup link disappears", async () => {
    if (!(await driver.findElements(By.css("nav.side-nav"))).length) await page.signIn(admin);
    await page.signOut();
    const links = await driver.findElements(By.xpath('//button[contains(normalize-space(.), "First time setup")]'));
    assert.equal(links.length, 0);
  });

  uiTest("rejects a wrong password", async () => {
    await page.fill("Email address", admin.email, { global: true });
    await page.fill("Password", "definitely-not-the-password", { global: true });
    await page.clickButton("Sign in", { global: true });
    assert.equal(await page.alertText(), "Email or password is incorrect.");
  });

  uiTest("explains that password reset email is not configured", async () => {
    await page.clickButton("Forgot your password?", { global: true });
    await page.heading("Reset your password");
    await page.fill("Email address", admin.email, { global: true });
    await page.clickButton("Send reset link", { global: true });
    assert.match(await page.alertText(), /not configured/);
    await page.clickButton("Back to sign in", { global: true });
    await page.heading("Welcome back");
  });

  uiTest("signs in with the right password", async () => {
    await page.fill("Email address", admin.email, { global: true });
    await page.fill("Password", admin.password, { global: true });
    await page.clickButton("Sign in", { global: true });
    await page.wait(By.css("nav.side-nav"));
    const signedInAs = await (await page.wait(By.css(".sidebar-tip p"))).getText();
    assert.equal(signedInAs, admin.email);
  });

  uiTest("changes the password and signs back in with it", async () => {
    const changeTo = async (current, next) => {
      await page.click(By.xpath('//div[contains(@class,"sidebar-tip")]//button'), { global: true });
      await page.dialogTitle("Change your password");
      await page.fill("Current password", current);
      await page.fill("New password", next);
      await page.fill("Confirm new password", next);
      await page.clickButton("Change password");
      await page.toast("Password changed");
    };
    await changeTo(admin.password, admin.altPassword);
    await page.signOut();
    await page.signIn({ email: admin.email, password: admin.altPassword });
    // Put the original password back so the other suites can sign in.
    await changeTo(admin.altPassword, admin.password);
  });
});
