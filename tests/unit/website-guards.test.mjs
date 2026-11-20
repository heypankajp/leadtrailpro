import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isPrivateAddress, readWithin, ReadTimeout } from "../../src/features/contacts/websiteGuards.ts";

describe("Fetch guards (check of November 19, 2026)", () => {
  test("private, loopback and link-local addresses are refused, also written inside IPv6", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1"]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
    // A URL writes [::ffff:127.0.0.1] as [::ffff:7f00:1]: both spellings are the IPv4 address inside.
    for (const raw of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://[::ffff:10.0.0.5]/", "http://[::127.0.0.1]/"]) {
      const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
      assert.equal(isPrivateAddress(host), true, `${raw} (${host})`);
    }
    assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  });

  test("public addresses pass, also an IPv4 public address inside IPv6", () => {
    for (const address of ["8.8.8.8", "142.250.80.46", "2607:f8b0:4005:80b::200e"]) assert.equal(isPrivateAddress(address), false, address);
    assert.equal(isPrivateAddress(new URL("http://[::ffff:8.8.8.8]/").hostname.replace(/^\[|\]$/g, "")), false);
  });

  test("reading a page stops at its time limit instead of holding up the server", () => {
    assert.equal(readWithin(() => 2 + 2), 4);
    const started = Date.now();
    // The kind of malformed page that kept the extraction busy for minutes: the same regular expression shape on stray "<".
    assert.throws(() => readWithin(() => /<[^>]*itemprop\s*=\s*["']streetAddress["'][^>]*>([\s\S]*?)<\//i.test("<".repeat(200_000)), 300), ReadTimeout);
    assert.ok(Date.now() - started < 5000);
  });
});
