import assert from "node:assert/strict";
import { test } from "node:test";
import { canPeerReview, needsPeerApproval, queueCutoff } from "../../src/features/leads/queue-rules.ts";

// Monday, November 23, 2026; Friday, November 20; Wednesday, November 25.
test("with one working day, Friday counts as yesterday on a Monday", () => {
  assert.equal(queueCutoff("2026-11-23", 1), "2026-11-20");
  assert.ok(!needsPeerApproval("2026-11-20", "2026-11-23", 1));
  assert.ok(!needsPeerApproval("2026-11-21", "2026-11-23", 1), "the weekend after the cutoff is fine");
  assert.ok(needsPeerApproval("2026-11-19", "2026-11-23", 1));
});

test("a midweek day allows the day before; more days reach further back over weekends and holidays", () => {
  assert.equal(queueCutoff("2026-11-25", 1), "2026-11-24");
  assert.equal(queueCutoff("2026-11-25", 3), "2026-11-20");
  assert.equal(queueCutoff("2026-11-23", 1, ["2026-11-20"]), "2026-11-19", "a holiday Friday is skipped");
  assert.equal(queueCutoff("2026-11-25", 0), "2026-11-25", "0: only today");
  assert.ok(needsPeerApproval("2026-11-24", "2026-11-25", 0));
});

test("peer approval: anyone who may review, except the owner and the creator", () => {
  const lead = { ownerId: 4, createdById: 5 };
  assert.ok(canPeerReview({ id: 1, mayReview: true }, lead));
  assert.ok(!canPeerReview({ id: 4, mayReview: true }, lead), "not the owner");
  assert.ok(!canPeerReview({ id: 5, mayReview: true }, lead), "not the creator");
  assert.ok(!canPeerReview({ id: 6, mayReview: false }, lead), "not someone who may not edit deals");
});
