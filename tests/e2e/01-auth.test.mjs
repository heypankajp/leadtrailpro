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
    await page.heading("Welcome Back");
    assert.ok(await page.control("Email Address", true));
  });

  uiTest("creates the first administrator from the setup link", async (t) => {
    const session = await fetch(`${baseUrl}/api/auth/session`).then((response) => response.json());
    if (!session.needsSetup) {
      t.skip("an account already exists");
      return;
    }
    await page.clickButton("First Time Setup? Create the Initial Administrator Account", { global: true });
    await page.heading("Create the First Administrator");
    await page.fill("User-Management Key", managementKey, { global: true });
    await page.fill("First Name", admin.firstName, { global: true });
    await page.fill("Last Name", admin.lastName, { global: true });
    await page.fill("Email", admin.email, { global: true });
    await page.fill("Phone", admin.phone, { global: true });
    await page.fill("Password", admin.password, { global: true });
    await page.fill("Confirm Password", admin.password, { global: true });
    await page.clickButton("Create Administrator", { global: true });
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
    await page.fill("Email Address", admin.email, { global: true });
    await page.fill("Password", "definitely-not-the-password", { global: true });
    await page.clickButton("Sign In", { global: true });
    assert.equal(await page.alertText(), "Email or password is incorrect.");
  });

  uiTest("accepts a password reset request (stub mail mode records it in the outbox)", async () => {
    await page.clickButton("Forgot Your Password?", { global: true });
    await page.heading("Reset Your Password");
    await page.fill("Email Address", admin.email, { global: true });
    await page.clickButton("Send Reset Link", { global: true });
    await page.waitText(By.css("p.login-message"), "on its way");
    await page.clickButton("Back to Sign In", { global: true });
    await page.heading("Welcome Back");
  });

  uiTest("signs in with the right password", async () => {
    await page.fill("Email Address", admin.email, { global: true });
    await page.fill("Password", admin.password, { global: true });
    await page.clickButton("Sign In", { global: true });
    await page.wait(By.css("nav.side-nav"));
    // The account menu in the top bar names the signed-in person and their email address.
    await page.click("button.topbar-user", { global: true });
    const signedInAs = await (await page.wait(By.css(".menu-heading .menu-email"))).getText();
    assert.equal(signedInAs, admin.email);
    await page.click("button.topbar-user", { global: true });
  });

  uiTest("changes the password and signs back in with it", async () => {
    const changeTo = async (current, next) => {
      await page.click("button.topbar-user", { global: true });
      await page.click(By.xpath('.//div[@role="menu"]//button[normalize-space()="Change Password"]'), { global: true });
      await page.dialogTitle("Change Your Password");
      await page.fill("Current Password", current);
      await page.fill("New Password", next);
      await page.fill("Confirm New Password", next);
      await page.clickButton("Change Password");
      await page.toast("Password changed");
    };
    await changeTo(admin.password, admin.altPassword);
    await page.signOut();
    await page.signIn({ email: admin.email, password: admin.altPassword });
    // Put the original password back so the other suites can sign in.
    await changeTo(admin.altPassword, admin.password);
  });
});
