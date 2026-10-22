import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mentionRecipients, parseMentions, parseMessageInput } from "../../src/features/messages/model.ts";

const directory = [
  { id: 1, name: "Ada Admin" },
  { id: 2, name: "Sam Seller" },
  { id: 3, name: "Sam Sellers" },
];
const users = [
  { id: 1, role: "admin", active: true },
  { id: 2, role: "sales_manager", active: true },
  { id: 3, role: "recruiter", active: true },
  { id: 4, role: "recruiter", active: false },
];

describe("collaboration mentions (COLL-02)", () => {
  test("finds group mentions regardless of case and ignores email addresses", () => {
    assert.deepEqual(parseMentions("Ping @Admin and @all; mail sam@seller.example", []), [{ kind: "all" }, { kind: "admin" }]);
    assert.deepEqual(parseMentions("@recruiters please", []), []);
  });

  test("finds people by name, longest name first, without duplicates", () => {
    assert.deepEqual(parseMentions("@Sam Sellers and @sam seller and @Sam Seller again", directory), [
      { kind: "user", userId: 3, name: "Sam Sellers" },
      { kind: "user", userId: 2, name: "Sam Seller" },
    ]);
  });

  test("resolves groups to active users of that role", () => {
    assert.deepEqual(mentionRecipients([{ kind: "recruiter" }], users), [3]);
    assert.deepEqual(mentionRecipients([{ kind: "salesmanager" }, { kind: "user", userId: 1, name: "Ada Admin" }], users), [2, 1]);
    assert.deepEqual(mentionRecipients([{ kind: "all" }], users).sort(), [1, 2, 3]);
  });

  test("validates the message input", () => {
    const ok = parseMessageInput({ body: "  Hello  ", parentId: "4", quotedMessageId: null, attachmentIds: [1, "1", 2] });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.input, { body: "Hello", parentId: 4, quotedMessageId: null, attachmentIds: [1, 2] });
    assert.deepEqual(parseMessageInput({ body: "" }).errors, ["Write a message first."]);
    assert.deepEqual(parseMessageInput({ body: "x", parentId: "abc" }).errors, ["Thread is not valid."]);
  });
});
