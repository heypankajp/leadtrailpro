import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import {
  decodeGoogleState, encodeGoogleState, googleRedirectUri, googleScope, grantsMailbox, mailboxScope, newGoogleState, profileFromIdToken, sendScope,
} from "../../src/features/users/google-signin.ts";

const idToken = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

describe("Google sign-in helpers", () => {
  test("profileFromIdToken: verified email with Google's name claims, email lower-cased", () => {
    assert.deepEqual(
      profileFromIdToken(idToken({ sub: "1", email: "Jane.Doe@Example.com", email_verified: true, given_name: "Jane", family_name: "Doe", name: "Jane Doe" })),
      { email: "jane.doe@example.com", firstName: "Jane", lastName: "Doe" },
    );
  });

  test("profileFromIdToken: falls back to the full name, then to the mailbox name", () => {
    assert.deepEqual(profileFromIdToken(idToken({ email: "pat@example.com", email_verified: true, name: "Pat Q Lee" })), { email: "pat@example.com", firstName: "Pat", lastName: "Q Lee" });
    assert.deepEqual(profileFromIdToken(idToken({ email: "ops@example.com", email_verified: "true" })), { email: "ops@example.com", firstName: "ops", lastName: "" });
  });

  test("profileFromIdToken: refuses unverified, missing, or malformed tokens", () => {
    assert.equal(profileFromIdToken(idToken({ email: "x@example.com", email_verified: false })), null);
    assert.equal(profileFromIdToken(idToken({ email: "x@example.com" })), null);
    assert.equal(profileFromIdToken(idToken({ email_verified: true })), null);
    assert.equal(profileFromIdToken("not-a-token"), null);
    assert.equal(profileFromIdToken(undefined), null);
  });

  test("state cookie: fresh state, 32-byte PKCE verifier with its S256 challenge, round trip through the cookie value", () => {
    const round = newGoogleState("signin");
    assert.equal(round.verifier.length, 43);
    assert.equal(round.challenge, createHash("sha256").update(round.verifier).digest("base64url"));
    assert.notEqual(newGoogleState("signin").state, round.state);
    assert.deepEqual(decodeGoogleState(encodeGoogleState(round)), { purpose: "signin", state: round.state, verifier: round.verifier });
    assert.deepEqual(decodeGoogleState(encodeGoogleState(newGoogleState("connect"))).purpose, "connect");
  });

  test("state cookie: anything but purpose.state.verifier is rejected", () => {
    assert.equal(decodeGoogleState(undefined), null);
    assert.equal(decodeGoogleState(""), null);
    assert.equal(decodeGoogleState("signin.only-state"), null);
    assert.equal(decodeGoogleState("admin.state.verifier"), null);
    assert.equal(decodeGoogleState("signin.state.verifier.extra"), null);
  });

  test("scopes: identity plus read-only Gmail, and the granted-scope check Google's answer goes through", () => {
    assert.equal(googleScope, `openid email profile ${mailboxScope} ${sendScope}`);
    assert.equal(grantsMailbox(`openid https://www.googleapis.com/auth/userinfo.email ${mailboxScope}`), true);
    assert.equal(grantsMailbox("openid email profile"), false);
    assert.equal(grantsMailbox(undefined), false);
  });

  test("the redirect URI follows APP_URL unless GOOGLE_REDIRECT_URI overrides it", () => {
    const saved = process.env.GOOGLE_REDIRECT_URI;
    try {
      delete process.env.GOOGLE_REDIRECT_URI;
      assert.equal(googleRedirectUri("http://localhost:3000"), "http://localhost:3000/api/auth/google/callback");
      process.env.GOOGLE_REDIRECT_URI = "https://sales.example.com/api/auth/google/callback";
      assert.equal(googleRedirectUri("http://localhost:3000"), "https://sales.example.com/api/auth/google/callback");
    } finally {
      if (saved === undefined) delete process.env.GOOGLE_REDIRECT_URI; else process.env.GOOGLE_REDIRECT_URI = saved;
    }
  });
});
