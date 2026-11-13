import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, runId } from "./helpers/data.mjs";

// SPEC §10.14: work can start from a contact. A person and an organization exist before any deal, deals are added
// from their pages (several per organization), and what is edited on a contact shows on its deals.
describe("Contacts first", () => {
  const organization = `Northern Fitness ${runId}`;
  const person = `Adam Brooks ${runId}`;
  const spare = `Spare Parts Co ${runId}`;
  const duplicate = `Northen Fitnes ${runId}`;
  const newcomer = `Dana Lee ${runId}`;
  const onContact = (rest) => By.xpath(`//div[contains(@class,"contact-page")]${rest}`);
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

  uiTest("a person is added before any deal, together with a new organization", async () => {
    await page.nav("Contacts");
    await page.wait(By.css('div[aria-label="Contacts list"]'));
    await page.clickButton("Person", { global: true });
    await page.dialogTitle("Add person");
    await page.fill("Name", person);
    await page.fill("Organization", organization);
    await page.fill("Email(s)", `adam.${runId}@northern.example`);
    await page.fill("Phone", "+1 645 697 5476");
    await page.clickButton("Save person");
    await page.toast(`${person} added`);
    await page.dialogTitle(person);
    await page.eyebrow("PERSON");
    await page.wait(onContact('//strong[normalize-space()="No deals yet"]'));
    await page.wait(onContact(`//button[contains(@class,"contact-name") and normalize-space()=${xq(organization)}]`));
  });

  uiTest("a deal is started from the person: the form carries the contact, and the deal links back to it", async () => {
    await page.clickButton("Deal");
    await page.dialogTitle("Add deal");
    assert.equal(await (await page.control("Client name")).getAttribute("value"), organization);
    assert.equal(await (await page.control("Client executive")).getAttribute("value"), person);
    assert.equal(await (await page.control("Contact number")).getAttribute("value"), "+1 645 697 5476");
    await page.clickButton("Save deal");
    await page.toast(`${organization} added to the pipeline`);
    await page.eyebrow("DEAL");
    assert.equal(await (await page.wait(By.css("button.client-executive-name"))).getText(), person);
  });

  uiTest("the organization's page lists its people and deals, and a second deal is added from it without the duplicate guard", async () => {
    await page.click(By.xpath(`.//button[contains(@class,"contact-name") and normalize-space()=${xq(organization)}]`));
    await page.eyebrow("ORGANIZATION");
    await page.dialogTitle(organization);
    await page.wait(onContact('//summary[contains(normalize-space(.), "People (1)")]'));
    await page.wait(onContact(`//button[contains(@class,"contact-name") and normalize-space()=${xq(person)}]`));
    await page.clickButton("Deal");
    await page.dialogTitle("Add deal");
    assert.equal(await (await page.control("Client name")).getAttribute("value"), organization);
    await page.fill("Position(s)", "Second site: forklift operators");
    await page.clickButton("Save deal");
    await page.toast(`${organization} added to the pipeline`);
    await page.eyebrow("DEAL");
    await page.closeDialog();
    await page.eyebrow("ORGANIZATION");
    await driver.wait(async () => (await driver.findElements(By.css(".contact-page .contact-deal-row"))).length === 2, 15000, "two deals on the organization");
  });

  uiTest("editing the organization updates the company details on its deals", async () => {
    await page.clickButton("Edit");
    await page.dialogTitle(`Edit ${organization}`);
    await page.fill("Address", "500 Lakeshore Rd, Oakville");
    await page.clickButton("Save changes");
    await page.toast("Organization updated");
    await page.click(By.css(".contact-page .contact-deal-row"), { global: true });
    await page.eyebrow("DEAL");
    await page.wait(By.xpath('//div[contains(@class,"deal-page")]//details[.//summary[contains(normalize-space(.), "Organization")]]//strong[normalize-space()="500 Lakeshore Rd, Oakville"]'));
    await page.closeDialog();
    await page.eyebrow("ORGANIZATION");
  });

  uiTest("an organization without deals is added and removed; one with deals offers no Remove", async () => {
    assert.equal((await driver.findElements(onContact('//button[normalize-space()="Remove"]'))).length, 0, "no Remove on an organization with deals");
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Organizations"]'), { global: true });
    await page.clickButton("Organization", { global: true });
    await page.dialogTitle("Add organization");
    await page.fill("Name", spare);
    await page.clickButton("Save organization");
    await page.toast(`${spare} added`);
    await page.eyebrow("ORGANIZATION");
    await page.dialogTitle(spare);
    await page.clickButton("Remove");
    await page.dialogTitle(`Remove ${spare}?`);
    await page.clickButton("Remove organization");
    await page.toast(`${spare} removed`);
    await (await page.wait(By.css('input[aria-label="Search organizations"]'))).sendKeys(spare);
    await page.wait(By.xpath('//table[contains(@class,"contacts-table")]//td[contains(normalize-space(.), "No organizations match this search.")]'));
  });

  // SPEC §10.16
  uiTest("a note is written on a person who has no deal and no organization yet", async () => {
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="People"]'), { global: true });
    await page.clickButton("Person", { global: true });
    await page.dialogTitle("Add person");
    await page.fill("Name", newcomer);
    await page.clickButton("Save person");
    await page.toast(`${newcomer} added`);
    await page.eyebrow("PERSON");
    await page.clickButton("Add note");
    await page.fill("Note", "Met at the trade fair. Wants a call in January.");
    await page.clickButton("Save note");
    await page.toast("Note saved");
    await page.wait(onContact('//article[contains(@class,"timeline-entry")]//div[contains(@class,"timeline-body")][contains(normalize-space(.), "trade fair")]'));
  });

  uiTest("a person without deals is filed under another organization", async () => {
    await page.clickButton("Edit");
    await page.dialogTitle(`Edit ${newcomer}`);
    await page.fill("Organization", organization);
    await page.clickButton("Save changes");
    await page.toast("Person updated");
    await page.wait(onContact(`//button[contains(@class,"contact-name") and normalize-space()=${xq(organization)}]`));
  });

  uiTest("a duplicate organization is merged: its people move, its notes stay in the history, and it is gone", async () => {
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Organizations"]'), { global: true });
    await page.clickButton("Organization", { global: true });
    await page.dialogTitle("Add organization");
    await page.fill("Name", duplicate);
    await page.clickButton("Save organization");
    await page.toast(`${duplicate} added`);
    await page.eyebrow("ORGANIZATION");
    await page.clickButton("Log call");
    await page.fill("Summary", "Reception gave the HR manager's name");
    await page.clickButton("Save call");
    await page.toast("Activity recorded");
    await page.click(By.xpath('.//div[contains(@class,"side-actions")]/button[normalize-space()="Person"]'));
    await page.dialogTitle("Add person");
    await page.fill("Name", "Elvis Park");
    await page.clickButton("Save person");
    await page.toast("Elvis Park added");
    // Open the real organization from the duplicate's person list is not possible, so go through the list.
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Organizations"]'), { global: true });
    await (await page.wait(By.css('input[aria-label="Search organizations"]'))).sendKeys(organization);
    await page.click(By.xpath(`//table[contains(@class,"contacts-table")]//tr[.//strong[normalize-space()=${xq(organization)}]]//button[contains(@class,"client-cell")]`), { global: true });
    await page.dialogTitle(organization);
    await page.clickButton("Merge");
    await page.dialogTitle(`Merge a duplicate into ${organization}`);
    await page.fill("The duplicate organization", duplicate.slice(0, 12));
    await page.click(By.xpath(`.//div[contains(@class,"merge-matches")]//button[.//strong[normalize-space()=${xq(duplicate)}]]`));
    await page.clickButton("Merge");
    await page.toast(`${duplicate} merged into ${organization}`);
    await page.wait(onContact('//summary[contains(normalize-space(.), "People (3)")]'));
    await page.wait(onContact('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Reception gave the HR manager\'s name"]'));
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Organizations"]'), { global: true });
    await (await page.wait(By.css('input[aria-label="Search organizations"]'))).sendKeys(duplicate);
    await page.wait(By.xpath('//table[contains(@class,"contacts-table")]//td[contains(normalize-space(.), "No organizations match this search.")]'));
  });

  // SPEC §10.17
  uiTest("the contacts timeline counts this month's contact with a person", async () => {
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Timeline"]'), { global: true });
    await (await page.wait(By.css('input[aria-label="Search the timeline"]'))).sendKeys(newcomer);
    const dot = await page.wait(By.xpath(`//table[contains(@class,"timeline-table")]//tr[.//strong[normalize-space()=${xq(newcomer)}]]//span[contains(@class,"tl-dot")]`));
    assert.equal(await dot.getText(), "1");
    assert.equal(await dot.getAttribute("title"), "1 note");
  });
});
