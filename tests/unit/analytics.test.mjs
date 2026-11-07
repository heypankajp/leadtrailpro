import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bucketKindFor, buckets, median, parseAnalyticsFilters, percentile, spellsOf, stalledAssessment, statusSeries, summarizeTransitions, weekStart,
  sortTeamBoard, teamBoardAttention,
} from "../../src/features/analytics/model.ts";

describe("Analytics rules", () => {
  test("buckets: days for a month, weeks for a season, months beyond; boundaries clipped to the range", () => {
    assert.equal(bucketKindFor("2026-11-01", "2026-11-08"), "day");
    assert.equal(bucketKindFor("2026-08-01", "2026-11-08"), "week");
    assert.equal(bucketKindFor("2025-11-01", "2026-11-08"), "month");
    assert.equal(weekStart("2026-11-08"), "2026-11-02"); // a Sunday belongs to the Monday before
    assert.deepEqual(buckets("2026-11-04", "2026-11-18", "week"), [{ start: "2026-11-04", endExclusive: "2026-11-09" }, { start: "2026-11-09", endExclusive: "2026-11-16" }, { start: "2026-11-16", endExclusive: "2026-11-18" }]);
    assert.deepEqual(buckets("2026-11-20", "2027-01-10", "month").map((bucket) => bucket.start), ["2026-11-20", "2026-12-01", "2027-01-01"]);
  });

  test("status over time: each lead counts from its creation with its last status before the bucket end", () => {
    const leads = [{ id: 1, createdAt: "2026-11-01T10:00:00Z", initialCode: "cold" }, { id: 2, createdAt: "2026-11-05T10:00:00Z", initialCode: "cold" }];
    const changes = [{ leadId: 1, at: "2026-11-03T09:00:00Z", code: "warm" }, { leadId: 1, at: "2026-11-06T09:00:00Z", code: "hot" }];
    const ends = [{ label: "2026-11-02", endIso: "2026-11-03T00:00:00Z" }, { label: "2026-11-04", endIso: "2026-11-05T00:00:00Z" }, { label: "2026-11-07", endIso: "2026-11-08T00:00:00Z" }];
    assert.deepEqual(statusSeries(leads, changes, ends, ["cold", "warm", "hot"]), [
      { label: "2026-11-02", counts: { cold: 1, warm: 0, hot: 0 } },
      { label: "2026-11-04", counts: { cold: 0, warm: 1, hot: 0 } },
      { label: "2026-11-07", counts: { cold: 1, warm: 0, hot: 1 } },
    ]);
  });

  test("movement: funnel steps, conversions from anywhere, moves backwards, and closing reasons", () => {
    const summary = summarizeTransitions([
      { fromCode: "cold", toCode: "warm", reason: null }, { fromCode: "warm", toCode: "hot", reason: null }, { fromCode: "hot", toCode: "client", reason: null },
      { fromCode: "warm", toCode: "client", reason: null }, { fromCode: "hot", toCode: "cold", reason: null },
      { fromCode: "warm", toCode: "lost", reason: "Pricing" }, { fromCode: "hot", toCode: "lost", reason: "Pricing" }, { fromCode: "cold", toCode: "disqualified", reason: null },
    ]);
    assert.deepEqual(summary.funnel, { coldToWarm: 1, warmToHot: 1, hotToClient: 1, anyToClient: 2 });
    assert.equal(summary.backwards, 1);
    assert.deepEqual(summary.entered, { warm: 1, hot: 1, client: 2, cold: 1, lost: 2, disqualified: 1 });
    assert.deepEqual(summary.lostReasons, { Pricing: 2 });
    assert.deepEqual(summary.disqualifiedReasons, { "No reason given": 1 });
  });

  test("time in status: completed stays and their median", () => {
    const spells = spellsOf([{ at: "2026-11-01T00:00:00Z", code: "cold" }, { at: "2026-11-04T00:00:00Z", code: "warm" }, { at: "2026-11-04T12:00:00Z", code: "hot" }]);
    assert.deepEqual(spells, [{ code: "cold", days: 3, endedAt: "2026-11-04T00:00:00Z" }, { code: "warm", days: 0.5, endedAt: "2026-11-04T12:00:00Z" }]);
    assert.equal(median([1, 5, 3]), 3);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(percentile([10, 20, 30, 40, 50], 0.75), 40);
    assert.equal(median([]), null);
  });

  test("stalled: names each problem and scores the worst one; nothing wrong gives null", () => {
    assert.equal(stalledAssessment({ statusCode: "warm", daysInStatus: 5, daysSinceActivity: 2, overdueDays: null }, 14), null);
    const late = stalledAssessment({ statusCode: "warm", daysInStatus: 40, daysSinceActivity: 20, overdueDays: 3 }, 14);
    assert.equal(late.score, 26);
    assert.deepEqual(late.reasons, ["40 days in warm (limit 14)", "no activity for 20 days", "follow-up overdue by 3 days"]);
    assert.deepEqual(stalledAssessment({ statusCode: "hot", daysInStatus: 3, daysSinceActivity: 9, overdueDays: null }, 14).reasons, ["hot lead quiet for 9 days"]);
  });

  test("filters parse ids, trimmed text, and the source choice", () => {
    const params = new URLSearchParams("ownerId=3&statusId=x&industry=%20Food%20&source=pool&jobType=full");
    assert.deepEqual(parseAnalyticsFilters((key) => params.get(key)), { ownerId: 3, statusId: null, leadTypeId: null, cityId: null, industry: "Food", client: "", source: "pool", jobType: "full" });
  });
});

describe("team board (RPT-02)", () => {
  test("rows sort by what is waiting on the person: replies first, then overdue, then stalled, then by name", () => {
    const rows = [
      { name: "Cara", overdueFollowUps: 0, stalled: 0, repliesWaiting: 0 },
      { name: "Ben", overdueFollowUps: 2, stalled: 1, repliesWaiting: 0 },
      { name: "Ana", overdueFollowUps: 0, stalled: 0, repliesWaiting: 2 },
      { name: "Abe", overdueFollowUps: 0, stalled: 0, repliesWaiting: 0 },
    ];
    assert.equal(teamBoardAttention(rows[1]), 5);
    assert.equal(teamBoardAttention(rows[2]), 6);
    assert.deepEqual(sortTeamBoard(rows).map((row) => row.name), ["Ana", "Ben", "Abe", "Cara"]);
    assert.equal(rows[0].name, "Cara", "the input is not reordered");
  });
});
