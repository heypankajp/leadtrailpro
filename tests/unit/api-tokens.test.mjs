import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apiTokenDisplayPrefix, apiTokenExpiry, apiTokenPattern, apiTokenUsable, bearerToken, hashApiToken, isApiToken, newApiToken, parseCreateApiToken } from "../../src/features/users/api-tokens.ts";

describe("API tokens (SPEC §4)", () => {
  test("a new token has the ltp_ prefix, 43 random characters, and is never the same twice", () => {
    const token = newApiToken();
    assert.match(token, apiTokenPattern);
    assert.equal(token.length, 47);
    assert.notEqual(token, newApiToken());
    assert.equal(isApiToken(token), true);
    assert.equal(isApiToken("ltp_short"), false);
    assert.equal(isApiToken(`abc_${"x".repeat(43)}`), false);
    assert.equal(isApiToken(42), false);
    assert.equal(apiTokenDisplayPrefix(token), token.slice(0, 12));
  });

  test("only the SHA-256 hash is stored", () => {
    const token = newApiToken();
    assert.match(hashApiToken(token), /^[0-9a-f]{64}$/);
    assert.equal(hashApiToken(token), hashApiToken(token));
    assert.notEqual(hashApiToken(token), hashApiToken(newApiToken()));
  });

  test("the bearer header is parsed case-insensitively and other schemes are ignored", () => {
    assert.equal(bearerToken("Bearer ltp_abc"), "ltp_abc");
    assert.equal(bearerToken("bearer   ltp_abc  "), "ltp_abc");
    assert.equal(bearerToken("Basic dXNlcjpwYXNz"), null);
    assert.equal(bearerToken("Bearer"), null);
    assert.equal(bearerToken(null), null);
    assert.equal(bearerToken(undefined), null);
  });

  test("creation input: a name is required, expiry defaults to 90 days and may be never", () => {
    assert.deepEqual(parseCreateApiToken({ name: " Laptop " }), { name: "Laptop", expiresInDays: 90 });
    assert.deepEqual(parseCreateApiToken({ name: "CI", expiresInDays: 30 }), { name: "CI", expiresInDays: 30 });
    assert.deepEqual(parseCreateApiToken({ name: "CI", expiresInDays: "365" }), { name: "CI", expiresInDays: 365 });
    assert.deepEqual(parseCreateApiToken({ name: "CI", expiresInDays: null }), { name: "CI", expiresInDays: null });
    assert.deepEqual(parseCreateApiToken({ name: "CI", expiresInDays: "never" }), { name: "CI", expiresInDays: null });
    assert.ok("error" in parseCreateApiToken({}));
    assert.ok("error" in parseCreateApiToken({ name: "x".repeat(81) }));
    assert.ok("error" in parseCreateApiToken({ name: "CI", expiresInDays: 0 }));
    assert.ok("error" in parseCreateApiToken({ name: "CI", expiresInDays: 1.5 }));
    assert.ok("error" in parseCreateApiToken(null));
  });

  test("expiry and usability", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    assert.equal(apiTokenExpiry(null, now), null);
    assert.equal(apiTokenExpiry(30, now)?.toISOString(), "2026-12-10T12:00:00.000Z");
    assert.equal(apiTokenUsable({ expiresAt: null, revokedAt: null }, now), true);
    assert.equal(apiTokenUsable({ expiresAt: "2026-11-11T00:00:00Z", revokedAt: null }, now), true);
    assert.equal(apiTokenUsable({ expiresAt: "2026-11-10T11:59:59Z", revokedAt: null }, now), false);
    assert.equal(apiTokenUsable({ expiresAt: null, revokedAt: "2026-11-01T00:00:00Z" }, now), false);
  });
});
