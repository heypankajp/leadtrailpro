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

  uiTest("a contact is added before any deal, together with a new company that is confirmed first", async () => {
    await page.nav("Contacts");
    await page.wait(By.css('div[aria-label="Contacts list"]'));
    await page.clickButton("Contact", { global: true });
    await page.dialogTitle("Add contact");
    // The organization comes first: the name is looked up among its contacts.
    await page.fill("Company", organization);
    await page.fill("Name", person);
    await page.fill("Email(s)", `adam.${runId}@northern.example`);
    await page.fill("Phone", "+1 645 697 5476");
    await page.clickButton("Save contact");
    // PD-17: the organization is new, so it is created only after the confirmation.
    await page.waitText(By.css(".confirm-new-note"), "is not a company yet");
    await page.clickButton("Create company and save");
    await page.toast(`${person} added`);
    await page.dialogTitle(person);
    await page.eyebrow("CONTACT");
    await page.wait(onContact('//strong[normalize-space()="No deals yet"]'));
    await page.wait(onContact(`//button[contains(@class,"contact-name") and normalize-space()=${xq(organization)}]`));
  });

  uiTest("a deal is started from the contact: the form carries it, and the deal links back to it", async () => {
    await page.clickButton("Deal");
    await page.dialogTitle("Add deal");
    assert.equal(await (await page.control("Company")).getAttribute("value"), organization);
    assert.equal(await (await page.control("Contact")).getAttribute("value"), person);
    assert.equal(await (await page.control("Contact number")).getAttribute("value"), "+1 645 697 5476");
    await page.saveDeal();
    await page.toast(`${organization} added to the pipeline`);
    await page.eyebrow("DEAL");
    assert.equal(await (await page.wait(By.css("button.client-executive-name"))).getText(), person);
  });

  uiTest("the company's page lists its contacts and deals, and a second deal is added from it without the duplicate guard", async () => {
    await page.click(By.xpath(`.//button[contains(@class,"contact-name") and normalize-space()=${xq(organization)}]`));
    await page.eyebrow("COMPANY");
    await page.dialogTitle(organization);
    await page.wait(onContact('//summary[contains(normalize-space(.), "Contacts (1)")]'));
    await page.wait(onContact(`//button[contains(@class,"contact-name") and normalize-space()=${xq(person)}]`));
    await page.clickButton("Deal");
    await page.dialogTitle("Add deal");
    assert.equal(await (await page.control("Company")).getAttribute("value"), organization);
    await page.fill("Position(s)", "Second site: forklift operators");
    await page.saveDeal();
    await page.toast(`${organization} added to the pipeline`);
    await page.eyebrow("DEAL");
    await page.closeDialog();
    await page.eyebrow("COMPANY");
    await driver.wait(async () => (await driver.findElements(By.css(".contact-page .contact-deal-row"))).length === 2, 15000, "two deals on the company");
  });

  uiTest("editing the company updates the company details on its deals", async () => {
    await page.clickButton("Edit");
    await page.dialogTitle(`Edit ${organization}`);
    await page.fill("Address", "500 Lakeshore Rd, Oakville");
    await page.clickButton("Save changes");
    await page.toast("Company updated");
    await page.click(By.css(".contact-page .contact-deal-row"), { global: true });
    await page.eyebrow("DEAL");
    await page.wait(By.xpath('//div[contains(@class,"deal-page")]//details[.//summary[contains(normalize-space(.), "Company")]]//strong[normalize-space()="500 Lakeshore Rd, Oakville"]'));
    await page.closeDialog();
    await page.eyebrow("COMPANY");
  });

  uiTest("a company without deals is added and removed; one with deals offers no Remove", async () => {
    assert.equal((await driver.findElements(onContact('//button[normalize-space()="Remove"]'))).length, 0, "no Remove on a company with deals");
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Companies"]'), { global: true });
    await page.clickButton("Company", { global: true });
    await page.dialogTitle("Add company");
    await page.fill("Name", spare);
    await page.clickButton("Save company");
    await page.toast(`${spare} added`);
    await page.eyebrow("COMPANY");
    await page.dialogTitle(spare);
    await page.clickButton("Remove");
    await page.dialogTitle(`Remove ${spare}?`);
    await page.clickButton("Remove company");
    await page.toast(`${spare} removed`);
    await (await page.wait(By.css('input[aria-label="Search companies"]'))).sendKeys(spare);
    await page.wait(By.xpath('//table[contains(@class,"contacts-table")]//td[contains(normalize-space(.), "No companies match this search.")]'));
  });

  // SPEC §10.16
  uiTest("a note is written on a contact who has no deal yet", async () => {
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Contacts"]'), { global: true });
    await page.clickButton("Contact", { global: true });
    await page.dialogTitle("Add contact");
    await page.fill("Company", `Trade Fair Leads ${runId}`);
    await page.fill("Name", newcomer);
    await page.clickButton("Save contact");
    await page.clickButton("Create company and save");
    await page.toast(`${newcomer} added`);
    await page.eyebrow("CONTACT");
    await page.clickButton("Add note");
    await page.fill("Note", "Met at the trade fair. Wants a call in January.");
    await page.clickButton("Save note");
    await page.toast("Note saved");
    await page.wait(onContact('//article[contains(@class,"timeline-entry")]//div[contains(@class,"timeline-body")][contains(normalize-space(.), "trade fair")]'));
  });

  uiTest("a contact without deals is filed under another company", async () => {
    await page.clickButton("Edit");
    await page.dialogTitle(`Edit ${newcomer}`);
    await page.fill("Company", organization);
    await page.clickButton("Save changes");
    await page.toast("Contact updated");
    await page.wait(onContact(`//button[contains(@class,"contact-name") and normalize-space()=${xq(organization)}]`));
  });

  uiTest("a duplicate company is merged: its contacts move, its notes stay in the history, and it is gone", async () => {
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Companies"]'), { global: true });
    await page.clickButton("Company", { global: true });
    await page.dialogTitle("Add company");
    await page.fill("Name", duplicate);
    await page.clickButton("Save company");
    await page.toast(`${duplicate} added`);
    await page.eyebrow("COMPANY");
    await page.clickButton("Log call");
    await page.fill("Summary", "Reception gave the HR manager's name");
    await page.clickButton("Save call");
    await page.toast("Activity recorded");
    await page.click(By.xpath('.//div[contains(@class,"side-actions")]/button[normalize-space()="Contact"]'));
    await page.dialogTitle("Add contact");
    await page.fill("Name", "Elvis Park");
    await page.clickButton("Save contact");
    await page.toast("Elvis Park added");
    // Open the real organization from the duplicate's person list is not possible, so go through the list.
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Companies"]'), { global: true });
    await (await page.wait(By.css('input[aria-label="Search companies"]'))).sendKeys(organization);
    await page.click(By.xpath(`//table[contains(@class,"contacts-table")]//tr[.//strong[normalize-space()=${xq(organization)}]]//button[contains(@class,"client-cell")]`), { global: true });
    await page.dialogTitle(organization);
    await page.clickButton("Merge");
    await page.dialogTitle(`Merge a duplicate into ${organization}`);
    await page.fill("The duplicate company", duplicate.slice(0, 12));
    await page.click(By.xpath(`.//div[contains(@class,"merge-matches")]//button[.//strong[normalize-space()=${xq(duplicate)}]]`));
    await page.clickButton("Merge");
    await page.toast(`${duplicate} merged into ${organization}`);
    await page.wait(onContact('//summary[contains(normalize-space(.), "Contacts (3)")]'));
    await page.wait(onContact('//article[contains(@class,"timeline-entry")]//strong[normalize-space()="Reception gave the HR manager\'s name"]'));
    await page.nav("Contacts");
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Companies"]'), { global: true });
    await (await page.wait(By.css('input[aria-label="Search companies"]'))).sendKeys(duplicate);
    await page.wait(By.xpath('//table[contains(@class,"contacts-table")]//td[contains(normalize-space(.), "No companies match this search.")]'));
  });

  // SPEC §10.17
  uiTest("the contacts timeline counts this month's contact with a person", async () => {
    await page.click(By.xpath('.//div[@aria-label="Contacts list"]/button[normalize-space()="Timeline"]'), { global: true });
    await (await page.wait(By.css('input[aria-label="Search the timeline"]'))).sendKeys(newcomer);
    const dot = await page.wait(By.xpath(`//table[contains(@class,"timeline-table")]//tr[.//strong[normalize-space()=${xq(newcomer)}]]//span[contains(@class,"tl-dot")]`));
    assert.equal(await dot.getText(), "1");
    assert.equal(await dot.getAttribute("title"), "1 note");
  });

  // PD-15, PD-32: our own suggestion lists in Add deal; contacts are looked up inside the organization chosen.
  uiTest("Add deal suggests companies as you type, then that company's contacts, by name or email", async () => {
    await page.openAddDeal();
    // No organization yet: the Contact field waits for one.
    assert.equal(await (await page.control("Contact")).getAttribute("disabled"), "true");
    const orgInput = await page.control("Company");
    await orgInput.sendKeys(organization.slice(0, -1));
    const option = await page.wait(By.xpath(`//ul[contains(@class,"suggest-list")]//li[@role="option"][.//strong[normalize-space()=${xq(organization)}]]`));
    assert.match(await option.getText(), /open deals?/);
    await option.click();
    await page.wait(By.css(".open-deals-note"));
    const email = `adam.${runId}@northern.example`;
    await (await page.control("Email(s)")).sendKeys(`adam.${runId}@`);
    await page.click(By.xpath(`//ul[contains(@class,"suggest-list")]//li[@role="option"][.//strong[normalize-space()=${xq(email)}]]`));
    assert.equal(await (await page.control("Company")).getAttribute("value"), organization);
    assert.equal(await (await page.control("Contact")).getAttribute("value"), person);
    assert.equal(await (await page.control("Email(s)")).getAttribute("value"), email);
    await page.closeDialog();
  });
});
