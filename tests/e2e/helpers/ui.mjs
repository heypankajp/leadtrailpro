// Shared Selenium helpers for the LeadTrailPro end-to-end suite (tests/e2e).
// The browser runs in the `selenium` compose service and talks to the `app-test` service.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import webdriver from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import remote from "selenium-webdriver/remote/index.js";
import selectModule from "selenium-webdriver/lib/select.js";

const { Builder, By, Key, until } = webdriver;
const { Select } = selectModule;
export { By, Key, until };

export const baseUrl = (process.env.E2E_BASE_URL || "http://app-test:3000").replace(/\/$/, "");
export const seleniumUrl = (process.env.E2E_SELENIUM_URL || "http://selenium:4444").replace(/\/$/, "");
export const outputDir = path.resolve("tests/e2e/output");

const DEFAULT_TIMEOUT = 15000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** XPath string literal for arbitrary text (handles quotes). */
export function xq(text) {
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  return `concat('${text.split("'").join(`', "'", '`)}')`;
}

// Sets a value on a React-controlled input/textarea the way the browser would (native setter + input event).
const NATIVE_SET = `
  const [element, value] = arguments;
  const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
`;

/** Waits until the app answers and the Selenium grid reports itself ready. */
export async function waitForServices(timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const app = await fetch(`${baseUrl}/api/auth/session`);
      const grid = await fetch(`${seleniumUrl}/status`).then((response) => response.json());
      if (app.ok && grid?.value?.ready) return;
      lastError = `app ${app.status}, grid ready=${grid?.value?.ready}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(2000);
  }
  throw new Error(`Services not ready after ${timeoutMs / 1000}s (${lastError})`);
}

export async function createDriver() {
  const options = new chrome.Options().addArguments("--window-size=1440,1000", "--lang=en-US", "--disable-gpu");
  const driver = await new Builder().forBrowser("chrome").usingServer(seleniumUrl).setChromeOptions(options).build();
  driver.setFileDetector(new remote.FileDetector());
  await driver.manage().window().setRect({ x: 0, y: 0, width: 1440, height: 1000 });
  registerDriver(driver);
  return driver;
}

let activeDriver = null;
export function registerDriver(driver) { activeDriver = driver; }

/** Saves a screenshot and the DOM of the current page under tests/e2e/output. */
export async function saveFailureArtifacts(name) {
  if (!activeDriver) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  await mkdir(outputDir, { recursive: true });
  try { await writeFile(path.join(outputDir, `${slug}.png`), Buffer.from(await activeDriver.takeScreenshot(), "base64")); } catch { /* best effort */ }
  try { await writeFile(path.join(outputDir, `${slug}.html`), await activeDriver.getPageSource()); } catch { /* best effort */ }
}

/** node:test wrapper that keeps a screenshot and the DOM when a test fails. */
export function uiTest(name, fn) {
  return test(name, async (t) => {
    try {
      await fn(t);
    } catch (error) {
      await saveFailureArtifacts(name);
      throw error;
    }
  });
}

export class Page {
  constructor(driver) { this.driver = driver; }

  async goto(hash = "") { await this.driver.get(`${baseUrl}/${hash}`); }

  /** The topmost open dialog, or null. */
  async dialog() {
    const dialogs = await this.driver.findElements(By.css('section[role="dialog"]'));
    return dialogs.length ? dialogs[dialogs.length - 1] : null;
  }

  /** The open deal page (#/deal/<id>), or null. The page the person came from stays in the DOM underneath, hidden. */
  async dealPage() {
    const pages = await this.driver.findElements(By.css("div.deal-page"));
    return pages.length ? pages[0] : null;
  }

  /** Search root: the topmost dialog when one is open (forms live in dialogs), else the open deal page, otherwise the page. */
  async scope(global = false) {
    if (global) return this.driver;
    return (await this.dialog()) ?? (await this.dealPage()) ?? this.driver;
  }

  /** Waits for the element; when the page redraws it between finding it and checking it, looks for it again. */
  async wait(locator, { timeout = DEFAULT_TIMEOUT, visible = true } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const element = await this.driver.wait(until.elementLocated(locator), Math.max(1, deadline - Date.now()));
      if (!visible) return element;
      try {
        await this.driver.wait(until.elementIsVisible(element), Math.max(1, deadline - Date.now()));
        return element;
      } catch (error) {
        if (error?.name !== "StaleElementReferenceError" || Date.now() >= deadline) throw error;
      }
    }
  }

  async waitText(locator, text, timeout = DEFAULT_TIMEOUT) {
    const element = await this.wait(locator, { timeout });
    await this.driver.wait(async () => (await element.getText()).includes(text), timeout, `Expected "${text}" in ${locator}`);
    return element;
  }

  /** A page heading, or the heading of a deal list inside the Deals page ("All deals", "Archive"). */
  heading(text) { return this.wait(By.xpath(`(//h1 | //div[contains(@class,"list-subhead")]/h2)[normalize-space()=${xq(text)}]`)); }
  /** The title of the topmost dialog, or of the open deal page (a deal opens as a page, not as a dialog). */
  dialogTitle(text) { return this.wait(By.xpath(`(//section[@role="dialog"]//h2 | //div[contains(@class,"deal-page")]//h1)[contains(normalize-space(.), ${xq(text)})]`)); }
  eyebrow(text) { return this.wait(By.xpath(`//span[contains(@class,"eyebrow") and normalize-space()=${xq(text)}]`)); }

  /** Clicks once the element is present and visible; falls back to a script click when something overlays it. */
  async click(target, { global = false, timeout = DEFAULT_TIMEOUT } = {}) {
    const locator = typeof target === "string" ? By.css(target) : target;
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const root = await this.scope(global);
        const element = await root.findElement(locator);
        await this.driver.wait(until.elementIsVisible(element), 2000);
        try {
          await element.click();
        } catch (error) {
          if (!/intercept|not clickable|obscur/i.test(String(error))) throw error;
          await this.driver.executeScript("arguments[0].click()", element);
        }
        return;
      } catch (error) {
        lastError = error;
        await sleep(250);
      }
    }
    throw lastError;
  }

  clickButton(text, options = {}) {
    return this.click(By.xpath(`.//button[normalize-space()=${xq(text)}]`), options);
  }

  /** The input/select/textarea under a visible label ("Organization", "Email address"). */
  async control(label, global = false) {
    const root = await this.scope(global);
    const t = xq(label);
    const labels = await root.findElements(By.xpath(`.//label[normalize-space(text()[1])=${t} or normalize-space(span[1]/text()[1])=${t}]`));
    for (const candidate of labels) {
      if (!(await candidate.isDisplayed())) continue;
      return candidate.findElement(By.xpath(".//input | .//select | .//textarea"));
    }
    throw new Error(`No visible field labelled "${label}"`);
  }

  /** A field of the topmost dialog by its accessible name (aria-label), as Schedule an activity labels its fields. */
  async fillNamed(name, value) {
    const element = await this.wait(By.css(`section[role="dialog"] [aria-label=${JSON.stringify(name)}]`));
    await this.setValue(element, value);
    return element;
  }

  async fill(label, value, { global = false } = {}) {
    const element = await this.driver.wait(() => this.control(label, global).catch(() => null), DEFAULT_TIMEOUT, `Field "${label}" not found`);
    await this.setValue(element, value);
    return element;
  }

  async setValue(element, value) {
    const tag = (await element.getTagName()).toLowerCase();
    const type = ((await element.getAttribute("type")) || "text").toLowerCase();
    if (tag === "select") { await new Select(element).selectByVisibleText(value); return; }
    if (["date", "datetime-local", "time", "month", "week"].includes(type)) { await this.driver.executeScript(NATIVE_SET, element, value); return; }
    await element.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE, value);
  }

  selectedText(element) { return this.driver.executeScript("return arguments[0].selectedOptions[0]?.textContent ?? ''", element); }

  /** Waits for the toast notification containing the text and returns its full message. */
  async toast(text, timeout = 10000) {
    const element = await this.driver.wait(
      until.elementLocated(By.xpath(`//div[contains(@class,"toast-message") and contains(normalize-space(.), ${xq(text)})]`)),
      timeout,
      `No toast containing "${text}"`,
    );
    return element.getText();
  }

  async alertText() { return (await this.wait(By.css('p[role="alert"]'))).getText(); }

  nav(label) { return this.click(By.xpath(`.//nav[contains(@class,"side-nav")]//button[starts-with(normalize-space(.), ${xq(label)})]`), { global: true }); }
  tab(label) { return this.click(By.xpath(`.//button[@role="tab" and starts-with(normalize-space(.), ${xq(label)})]`)); }

  leadRow(name) { return By.xpath(`//table[contains(@class,"lead-table")]//tr[.//strong[normalize-space()=${xq(name)}]]`); }
  waitLeadRow(name) { return this.wait(this.leadRow(name)); }

  /** Closes the topmost dialog; with no dialog open, leaves the open deal page through its Back button. */
  async closeDialog() {
    const dialog = await this.dialog();
    if (dialog) {
      await dialog.findElement(By.css('button[aria-label="Close dialog"]')).click();
      await this.driver.wait(until.stalenessOf(dialog), DEFAULT_TIMEOUT);
      return;
    }
    const deal = await this.dealPage();
    if (!deal) return;
    // A script click: after scrolling, Selenium may bring the button up underneath the sticky top bar.
    await this.driver.executeScript("arguments[0].click()", await deal.findElement(By.css("button.deal-back")));
    await this.driver.wait(until.stalenessOf(deal), DEFAULT_TIMEOUT);
  }

  /**
   * Deals → one of its views: "board", "all" (the list, everyone's deals), "mine" (the list, my deals), "archive",
   * or "queued" (deals waiting for approval).
   */
  async deals(view = "board") {
    await this.nav("Pipeline");
    const label = { board: "Board", all: "List", mine: "List", archive: "Archive", queued: "Queued for approval" }[view];
    await this.click(`.view-switch button[aria-label="${label}"]`, { global: true });
    if (view === "board") { await this.wait(By.css(".pipeline-toolbar")); return; }
    if (view === "all" || view === "mine") await this.click(By.xpath(`.//div[@aria-label="Whose deals"]/button[normalize-space()=${xq(view === "all" ? "Everyone" : "My deals")}]`), { global: true });
    await this.heading({ all: "All deals", mine: "My deals", archive: "Archive", queued: "Queued deals" }[view]);
  }

  /**
   * Saves the add-deal dialog. A new organization or contact is created only after the dialog's confirmation (PD-15),
   * which is given here when it appears; a duplicate notice or an error is left for the caller to read.
   */
  async saveDeal() {
    const dialog = await this.dialog();
    await this.clickButton("Save deal");
    const outcome = await this.driver.wait(async () => {
      try {
        if (!dialog || !(await dialog.isDisplayed())) return "closed";
        const confirm = await dialog.findElements(By.xpath('.//button[normalize-space()="Create and add deal"]'));
        if (confirm.length && (await confirm[0].isDisplayed())) return confirm[0];
        const notices = await dialog.findElements(By.css('.duplicate-note, p[role="alert"]'));
        return notices.length ? "notice" : null;
      } catch {
        return "closed";
      }
    }, DEFAULT_TIMEOUT, "Saving the deal neither closed the dialog nor asked for a confirmation");
    if (typeof outcome !== "string") await outcome.click();
  }

  /**
   * PD-22: opens a board card's actions menu. The ⇄ button only shows on hover (opacity 0 otherwise), which WebDriver
   * counts as hidden, so it is pressed the way a keyboard user would reach it: a click on the element itself.
   */
  async openCardMenu(name) {
    const button = await this.wait(By.css(`button[aria-label="Actions for ${name}"]`), { visible: false });
    // The menu closes when the page scrolls, so the card is brought into view first and the click waits for that scroll to settle.
    await this.driver.executeScript("arguments[0].scrollIntoView({ block: 'nearest' });", button);
    await sleep(300);
    await this.driver.executeScript("arguments[0].click();", button);
    return this.wait(By.css(".card-menu"));
  }

  /** HTML5 drag and drop of `card` onto `target`, as the browser fires it (WebDriver's own drag does not produce these events). */
  async drag(card, target) {
    await this.driver.executeScript(`const [card, target] = arguments; const data = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));`, card, target);
  }

  /**
   * Moves a board card to the named stage by dragging it there. The card's ⇄ menu offered the stages until the review of
   * November 18, 2026 (PD-33); a drag gives the same toast, undo bar and "What's next?" prompt.
   */
  async moveCard(name, stage) {
    const card = await this.wait(By.xpath(`//article[contains(@class,"pipeline-card")][.//strong[normalize-space()=${xq(name)}]]`));
    const column = await this.wait(By.xpath(`//section[contains(@class,"pipeline-column")][.//h2[normalize-space()=${xq(stage)}]]`));
    await this.drag(card, column);
  }

  /** The stage columns of the board on screen, in order. */
  async boardStages() {
    await this.wait(By.css("section.pipeline-column h2"));
    return this.driver.executeScript('return [...document.querySelectorAll("section.pipeline-column h2")].map((h) => h.textContent.trim());');
  }

  /** PD-31: the stage chosen with the add-deal dialog's arrows (the checked arrow's name). */
  async stagePicked() {
    const checked = await this.wait(By.css('.stage-picker button[role="radio"][aria-checked="true"]'), { visible: false });
    return (await this.driver.executeScript("return arguments[0].textContent.trim();", checked));
  }

  /**
   * Picks `from` (and `to`, for a range) on the open By Period / Followup calendar named `label`, then Apply. Days are
   * YYYY-MM-DD; the calendar is moved on a month at a time until the day shows.
   */
  async pickPeriod(label, from, to = from) {
    const calendar = `//div[@role="dialog" and @aria-label=${xq(label)}]`;
    const dayName = (ymd) => {
      const [y, m, d] = ymd.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    };
    await this.wait(By.xpath(calendar));
    for (const day of from === to ? [from] : [from, to]) {
      const name = dayName(day);
      const button = By.xpath(`${calendar}//button[@aria-label=${xq(name)} or @aria-label=${xq(`${name} (today)`)}]`);
      for (let step = 0; step < 24 && !(await this.driver.findElements(button)).length; step += 1) {
        await this.click(By.xpath(`${calendar}//button[@aria-label=${xq(day < (await this.driver.executeScript("return new Date().toISOString().slice(0, 10)")) ? "Previous month" : "Next month")}]`), { global: true });
      }
      await this.click(button, { global: true });
    }
    await this.click(By.xpath(`${calendar}//button[normalize-space()="Apply"]`), { global: true });
  }

  /** The add-deal dialog, opened the way it opens from every page: the quick-add button in the top bar. */
  async openAddDeal() {
    await this.click('button[aria-label="Quick add"]', { global: true });
    await this.click(By.xpath('.//div[contains(@class,"quick-add-menu")]/button[normalize-space()="Deal"]'), { global: true });
    await this.dialogTitle("Add deal");
  }

  async signIn({ email, password }) {
    await this.goto();
    await this.heading("Welcome back");
    await this.fill("Email address", email, { global: true });
    await this.fill("Password", password, { global: true });
    await this.clickButton("Sign in", { global: true });
    await this.wait(By.css("nav.side-nav"));
  }

  async signOut() {
    await this.click("button.profile-button", { global: true });
    await this.heading("Welcome back");
  }
}

/** Opens the add-deal dialog from the quick-add button in the top bar, fills the form, and saves. Callers wait for the toast that follows. */
export async function addLead(page, { name, executive = "", firstContactDate = "" }) {
  await page.openAddDeal();
  await page.fill("Organization", name);
  if (executive) await page.fill("Contact", executive);
  if (firstContactDate) await page.fill("First contact date", firstContactDate);
  await page.saveDeal();
}
