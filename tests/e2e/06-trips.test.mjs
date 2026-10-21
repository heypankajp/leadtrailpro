import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { By, Page, createDriver, uiTest, waitForServices, xq } from "./helpers/ui.mjs";
import { admin, ensureAdmin, isoDate, runId } from "./helpers/data.mjs";

// Runs against the stub provider (TRIPS_PROVIDER=stub in compose.yaml): fixed companies around Mississauga.
describe("Sales trip planner", () => {
  const tripTitle = `Mississauga industrial ${runId}`;
  const company = "Northgate Packaging";
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

  uiTest("plans a trip and recognises a company that is already a lead", async () => {
    // A lead whose website domain matches a stub company, so the Action column can find it.
    await page.clickButton("Add a lead", { global: true });
    await page.dialogTitle("Add a new lead");
    await page.fill("Client name", `${company} ${runId}`);
    await page.fill("Company website", "https://www.northgatepackaging.example/");
    await page.clickButton("Save lead");
    await page.toast("added to the pipeline");
    await page.closeDialog();

    await page.nav("Sales trip planner");
    await page.heading("Sales trip planner");
    await page.fill("Trip title", tripTitle);
    await page.fill("Address", "Mississauga, ON");
    await page.fill("Radius type", "Kilometres");
    await page.fill("Radius (km)", "25");
    await page.fill("Business type", "Any");
    await page.fill("Number of results", "10");
    await page.clickButton("Search companies");
    await page.toast("companies found");
    await page.heading(tripTitle);
    const row = await page.wait(By.xpath(`//table[contains(@class,"trip-table")]//tr[.//strong[normalize-space()=${xq(company)}]]`));
    assert.match(await row.getText(), /Cold Lead/);
    assert.match(await row.getText(), /3 Jobs/);
    const link = await row.findElement(By.css("a.company-link"));
    assert.equal(await link.getAttribute("target"), "_blank");
  });

  uiTest("the hiring count opens the job listings", async () => {
    await page.click(By.css(`button[aria-label="Job listings for ${company}"]`), { global: true });
    await page.dialogTitle(`Job listings: ${company}`);
    await page.wait(By.xpath('//section[@role="dialog"]//strong[normalize-space()="Packaging Line Operator"]'));
    assert.match(await (await page.wait(By.xpath('//section[@role="dialog"]//a[contains(normalize-space(.), "View job")]'))).getAttribute("href"), /^https:\/\/jobs\.example\//);
    await page.closeDialog();
  });

  uiTest("shortlists a company, plans the visit, filters by action, and offers the Excel export", async () => {
    await page.click(By.css(`input[aria-label="Shortlist ${company}"]`), { global: true });
    await page.toast(`${company} shortlisted`);
    const date = await page.wait(By.css(`input[aria-label="Planned visit date for ${company}"]`));
    await page.setValue(date, isoDate(3));
    await page.toast("planned for");
    await page.setValue(await page.wait(By.css('select[aria-label="Show"]')), "Planned visits");
    await page.waitText(By.css(".trip-scope-note"), "Planned visits");
    assert.equal((await driver.findElements(By.css("table.trip-table tbody tr"))).length, 1);
    await page.setValue(await page.wait(By.css('select[aria-label="Show"]')), "All results");
    await page.setValue(await page.wait(By.css('select[aria-label="Filter by action"]')), "New / Not in CRM");
    await page.waitText(By.css(".trip-scope-note"), "Filtered results");
    assert.equal((await driver.findElements(By.xpath(`//table[contains(@class,"trip-table")]//tr[.//strong[normalize-space()=${xq(company)}]]`))).length, 0);
    const exportLink = await page.wait(By.xpath('//a[contains(normalize-space(.), "Export Excel")]'));
    const href = await exportLink.getAttribute("href");
    assert.match(href, /\/api\/trips\/\d+\/export\?scope=filtered&action=/);
    const response = await driver.executeAsyncScript(
      "const [url, done] = arguments; fetch(url, { credentials: 'same-origin' }).then((r) => done(`${r.status} ${r.headers.get('content-type')}`)).catch((e) => done(`error ${e}`));",
      href,
    );
    assert.match(response, /^200 application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  });

  uiTest("the trip is listed and reopens from the list", async () => {
    await page.click(By.css("button.back-link"), { global: true });
    await page.heading("Sales trip planner");
    const row = await page.wait(By.xpath(`//table[contains(@class,"trips-table")]//tr[.//strong[normalize-space()=${xq(tripTitle)}]]`));
    assert.match(await row.getText(), /\b10\b/);
    await row.findElement(By.xpath('.//button[normalize-space()="Open"]')).click();
    await page.heading(tripTitle);
  });
});
