import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultJobSources, jobSourceCreditsPerCall, jobsAlert, jobsCallsLeft, jobsReachedThresholds, jobsUsageSource, normalizeJobSources, parseHasDataUsage,
} from "../../src/features/jobs/model.ts";

const usage = (month, today = 0) => ({ month, today, failuresToday: 0 });
const account = { totalCredits: 1000, availableCredits: 350, checkedAt: "2026-11-07T20:00:00.000Z" };

describe("job-source usage meter (SPEC §7.13)", () => {
  test("HasData costs 10 credits a call; the balance endpoint's answer is parsed and junk is not", () => {
    assert.equal(jobSourceCreditsPerCall.hasdata, 10);
    assert.equal(jobSourceCreditsPerCall.adzuna, undefined);
    const when = new Date("2026-11-07T20:00:00Z");
    assert.deepEqual(parseHasDataUsage({ status: "ok", data: { totalCredits: 10000000, availableCredits: 5473702, concurrentRequests: 0, availableConcurrency: 100 } }, when), { totalCredits: 10_000_000, availableCredits: 5_473_702, checkedAt: when.toISOString() });
    assert.equal(parseHasDataUsage({ status: "error" }), null);
    assert.equal(parseHasDataUsage({ data: { totalCredits: "x" } }), null);
    assert.equal(parseHasDataUsage(null), null);
  });

  test("calls left: the budget's remainder, capped by what the account can pay for", () => {
    assert.equal(jobsCallsLeft(40, null, 10), 40);
    assert.equal(jobsCallsLeft(40, account, 10), 35);
    assert.equal(jobsCallsLeft(20, account, 10), 20);
    assert.equal(jobsCallsLeft(-5, account, 10), 0);
    assert.equal(jobsCallsLeft(40, account, null), 40);
  });

  test("a source's card line: percent, credits, remaining, note, and the warning level setting", () => {
    const settings = normalizeJobSources({ budgets: { hasdata: { daily: 50, monthly: 90 } }, warnAtPercent: 75 }).jobSources;
    assert.equal(settings.warnAtPercent, 75);
    assert.equal(defaultJobSources.warnAtPercent, 80);
    assert.match(normalizeJobSources({ warnAtPercent: 0 }).error, /warning level/);
    assert.match(normalizeJobSources({ warnAtPercent: 101 }).error, /warning level/);
    const line = jobsUsageSource("hasdata", settings, { configured: true, usage: usage(72, 3), account });
    assert.equal(line.percent, 80);
    assert.equal(line.creditsThisMonth, 720);
    assert.equal(line.remainingCalls, 18);
    assert.equal(line.callsLeft, 18);
    assert.equal(line.note, null);
    const spent = jobsUsageSource("hasdata", settings, { configured: true, usage: usage(90), account: null });
    assert.equal(spent.remainingCalls, 0);
    assert.equal(spent.note, "Monthly budget spent.");
    const noCredits = jobsUsageSource("adzuna", settings, { configured: true, usage: usage(5), account: null });
    assert.equal(noCredits.creditsPerCall, null);
    assert.equal(noCredits.creditsThisMonth, null);
  });

  test("alerts fire at the warning level and at 100%, once each, with the credits spelled out", () => {
    assert.deepEqual(jobsReachedThresholds(71, 90, 80), []);
    assert.deepEqual(jobsReachedThresholds(72, 90, 80), [80]);
    assert.deepEqual(jobsReachedThresholds(90, 90, 80), [80, 100]);
    const warn = jobsAlert("hasdata", 80, 72, 90, "2026-12-01");
    assert.match(warn.title, /80% of the monthly call budget/);
    assert.match(warn.body, /72 of 90 calls \(720 credits\)/);
    assert.match(warn.body, /18 calls left/);
    const spent = jobsAlert("hasdata", 100, 90, 90, "2026-12-01");
    assert.match(spent.title, /budget spent/);
    assert.match(spent.body, /2026-12-01/);
    assert.doesNotMatch(jobsAlert("adzuna", 80, 8, 10, "2026-12-01").body, /credits/);
  });
});
