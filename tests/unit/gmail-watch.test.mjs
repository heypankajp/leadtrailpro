import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractAddresses, gmailSearchQuery, mailboxWatchBackfillDays, mailboxWatchMaxPages, mailboxWatchPageSize, matchMessage, messageDirection,
  outsideAddresses, parseWatchMessage, processMailbox, replyWaiting, senderName, watchPeriodKey,
} from "../../src/features/gmail/watch-model.ts";

const mailbox = "amanda@scilltech.com";
const team = new Set([mailbox, "daniel@scilltech.com"]);
const leads = [
  { id: 1, ownerId: 11, clientName: "Acme Foundry", clientEmails: ["Buyer@Acme.com", "ops@acme.com"] },
  { id: 2, ownerId: 12, clientName: "Beta Plastics", clientEmails: ["hello@beta.example"] },
];
const message = (overrides = {}) => ({ id: "m1", threadId: "t1", internalDate: 1_700_000_000_000, from: "Jane Buyer <buyer@acme.com>", to: "Amanda <amanda@scilltech.com>", cc: "", subject: "Re: quote", snippet: "Thanks, looks good.", ...overrides });

describe("mailbox watch rules (MAIL-01)", () => {
  test("period keys floor to the scan interval and the search query follows the watermark", () => {
    assert.equal(watchPeriodKey(new Date("2026-11-07T10:07:59Z")), "2026-11-07T10:05");
    assert.equal(watchPeriodKey(new Date("2026-11-07T10:04:00Z")), "2026-11-07T10:00");
    assert.equal(gmailSearchQuery(null), `newer_than:${mailboxWatchBackfillDays}d -in:drafts -in:chats -in:spam -in:trash`);
    assert.equal(gmailSearchQuery(1_700_000_000_500), "after:1700000000 -in:drafts -in:chats -in:spam -in:trash");
  });

  test("addresses and sender names come out of RFC 822 headers", () => {
    assert.deepEqual(extractAddresses('"Buyer, Jane" <Buyer@Acme.com>, ops@acme.com; ops@acme.com'), ["buyer@acme.com", "ops@acme.com"]);
    assert.deepEqual(extractAddresses(""), []);
    assert.equal(senderName('"Jane Buyer" <buyer@acme.com>'), "Jane Buyer");
    assert.equal(senderName("buyer@acme.com"), "buyer@acme.com");
  });

  test("a Gmail metadata response becomes a watch message; junk does not", () => {
    const parsed = parseWatchMessage({ id: "abc", threadId: "th", internalDate: "1700000000000", snippet: "hi", payload: { headers: [{ name: "From", value: "a@b.c" }, { name: "Subject", value: "" }, { name: "To", value: "x@y.z" }] } });
    assert.deepEqual(parsed, { id: "abc", threadId: "th", internalDate: 1_700_000_000_000, from: "a@b.c", to: "x@y.z", cc: "", subject: "(no subject)", snippet: "hi" });
    assert.equal(parseWatchMessage(null), null);
    assert.equal(parseWatchMessage({ id: "abc" }), null);
    assert.equal(parseWatchMessage({ id: "", internalDate: "5" }), null);
  });

  test("direction and outside addresses", () => {
    assert.equal(messageDirection(message(), mailbox), "received");
    assert.equal(messageDirection(message({ from: "Amanda <AMANDA@scilltech.com>", to: "buyer@acme.com" }), mailbox), "sent");
    assert.deepEqual(outsideAddresses(message({ cc: "daniel@scilltech.com, ops@acme.com" }), team), ["buyer@acme.com", "ops@acme.com"]);
    assert.deepEqual(outsideAddresses(message({ from: "daniel@scilltech.com", to: mailbox }), team), []);
  });

  test("matching: the client as sender is a reply, the client in copy is related mail, team-only mail is nothing", () => {
    const [reply] = matchMessage(message(), mailbox, leads, team, { notify: true });
    assert.equal(reply.lead.id, 1);
    assert.equal(reply.direction, "received");
    assert.equal(reply.clientReplied, true);
    assert.equal(reply.notify, true);
    const [copied] = matchMessage(message({ from: "someone@else.example", cc: "ops@acme.com" }), mailbox, leads, team, { notify: true });
    assert.equal(copied.clientReplied, false);
    assert.equal(copied.notify, false);
    const [sent] = matchMessage(message({ from: mailbox, to: "hello@beta.example" }), mailbox, leads, team, { notify: true });
    assert.equal(sent.lead.id, 2);
    assert.equal(sent.direction, "sent");
    assert.equal(sent.notify, false);
    assert.deepEqual(matchMessage(message({ from: "daniel@scilltech.com", to: mailbox }), mailbox, leads, team, { notify: true }), []);
    assert.deepEqual(matchMessage(message({ from: "nobody@unknown.example" }), mailbox, leads, team, { notify: true }), []);
    // The first (backfill) scan records without telling anyone.
    assert.equal(matchMessage(message(), mailbox, leads, team, { notify: false })[0].notify, false);
  });

  test("a lead waits for a reply when the client's email is newer than the team's last email and last activity", () => {
    assert.equal(replyWaiting({ lastClientEmailAt: null, lastTeamEmailAt: null, lastActivityAt: "2026-11-01T00:00:00Z" }), false);
    assert.equal(replyWaiting({ lastClientEmailAt: "2026-11-07T10:00:00Z", lastTeamEmailAt: null, lastActivityAt: "2026-11-01T00:00:00Z" }), true);
    assert.equal(replyWaiting({ lastClientEmailAt: "2026-11-07T10:00:00Z", lastTeamEmailAt: "2026-11-07T11:00:00Z", lastActivityAt: "2026-11-01T00:00:00Z" }), false);
    assert.equal(replyWaiting({ lastClientEmailAt: "2026-11-07T10:00:00Z", lastTeamEmailAt: null, lastActivityAt: "2026-11-07T12:00:00Z" }), false);
  });
});

describe("mailbox scan (processMailbox)", () => {
  const makeDeps = ({ since, pages, messages, seen = [] }) => {
    const calls = { list: [], got: [], recorded: [] };
    return {
      calls,
      deps: {
        mailbox, since, teamAddresses: team,
        async listMessages(query, pageToken) {
          calls.list.push({ query, pageToken });
          const index = pageToken ? Number(pageToken) : 0;
          return { ids: pages[index], nextPageToken: index + 1 < pages.length ? String(index + 1) : null };
        },
        async getMessage(id) { calls.got.push(id); if (id === "boom") throw new Error("read failed"); return messages[id] ?? null; },
        async alreadySeen(ids) { return new Set(ids.filter((id) => seen.includes(id))); },
        async findLeads(addresses) { return leads.filter((lead) => lead.clientEmails.some((email) => addresses.includes(email.toLowerCase()))); },
        async record(match) { calls.recorded.push(match); },
      },
    };
  };

  test("the first scan backfills silently, later scans notify the owner about client replies only", async () => {
    const messages = {
      a: message({ id: "a", internalDate: 3000 }),
      b: message({ id: "b", internalDate: 2000, from: mailbox, to: "ops@acme.com" }),
      c: message({ id: "c", internalDate: 1000, from: "daniel@scilltech.com", to: mailbox }),
    };
    const first = makeDeps({ since: null, pages: [["a", "b", "c"]], messages });
    const result = await processMailbox(first.deps);
    assert.deepEqual(result, { scanned: 3, matched: 2, notified: 0, newest: 3000, truncated: false, failures: 0 });
    assert.match(first.calls.list[0].query, /^newer_than:/);
    assert.deepEqual(first.calls.recorded.map((match) => [match.message.id, match.direction, match.clientReplied, match.notify]), [["a", "received", true, false], ["b", "sent", false, false]]);

    const second = makeDeps({ since: 3000, pages: [["d", "a"]], messages: { ...messages, d: message({ id: "d", internalDate: 4000 }) }, seen: ["a"] });
    const next = await processMailbox(second.deps);
    assert.deepEqual(next, { scanned: 1, matched: 1, notified: 1, newest: 4000, truncated: false, failures: 0 });
    assert.equal(second.calls.list[0].query.startsWith("after:3"), true);
    assert.deepEqual(second.calls.got, ["d"], "a stored message is not read again");
  });

  test("an empty scan keeps the watermark, an unreadable message counts as a failure", async () => {
    const empty = makeDeps({ since: 5000, pages: [[]], messages: {} });
    assert.deepEqual(await processMailbox(empty.deps), { scanned: 0, matched: 0, notified: 0, newest: 5000, truncated: false, failures: 0 });
    const broken = makeDeps({ since: 5000, pages: [["boom", "e"]], messages: { e: message({ id: "e", internalDate: 6000 }) } });
    const result = await processMailbox(broken.deps);
    assert.equal(result.failures, 1);
    assert.equal(result.matched, 1);
    assert.equal(result.newest, 6000);
  });

  test("hitting the page cap continues from the oldest message of the scan next time", async () => {
    const pages = Array.from({ length: mailboxWatchMaxPages + 1 }, (_, page) => Array.from({ length: 2 }, (_, i) => `p${page}m${i}`));
    const messages = Object.fromEntries(pages.flat().map((id, index) => [id, message({ id, internalDate: 100_000 - index * 10, from: "nobody@unknown.example" })]));
    const capped = makeDeps({ since: 1, pages, messages });
    const result = await processMailbox(capped.deps);
    assert.equal(result.truncated, true);
    assert.equal(capped.calls.list.length, mailboxWatchMaxPages);
    assert.equal(result.scanned, mailboxWatchMaxPages * 2);
    assert.equal(result.newest, 100_000 - (mailboxWatchMaxPages * 2 - 1) * 10, "the oldest processed message, so nothing is skipped");
    assert.ok(mailboxWatchPageSize >= 50);
  });
});
