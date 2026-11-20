import assert from "node:assert/strict";
import { test } from "node:test";
import { sameWebsite, websiteKey } from "../../src/lib/website-key.ts";

test("websiteKey drops the protocol, www., the query and the trailing slash, in lower case", () => {
  assert.equal(websiteKey("HTTPS://www.Acme.ca/"), "acme.ca");
  assert.equal(websiteKey("http://acme.ca"), "acme.ca");
  assert.equal(websiteKey("www.ACME.ca"), "acme.ca");
  assert.equal(websiteKey("  acme.ca/careers/?utm_source=x#top "), "acme.ca/careers");
  assert.equal(websiteKey(""), "");
  assert.equal(websiteKey(null), "");
});

test("sameWebsite compares the keys and never matches two empty websites", () => {
  assert.ok(sameWebsite("https://www.acme.ca", "ACME.CA/"));
  assert.ok(sameWebsite("http://Acme.ca/About", "https://acme.ca/about"));
  assert.ok(!sameWebsite("acme.ca", "acme.com"));
  assert.ok(!sameWebsite("acme.ca", "shop.acme.ca"));
  assert.ok(!sameWebsite("", ""));
  assert.ok(!sameWebsite(null, "acme.ca"));
});
