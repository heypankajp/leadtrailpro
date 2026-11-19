import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addDays, inPeriod, layoutDay, periodRange, weekLabel, weekStart } from "../../src/features/tasks/periods.ts";

// Wednesday, November 18, 2026.
const today = "2026-11-18";
const at = (ymd, hhmm = "10:00") => new Date(`${ymd}T${hhmm}:00`).toISOString();

describe("Activity List periods and Activity Calendar weeks (request of November 18, 2026)", () => {
  test("weeks run Sunday to Saturday", () => {
    assert.equal(weekStart(today), "2026-11-15");
    assert.equal(weekStart("2026-11-15"), "2026-11-15");
    assert.equal(weekStart("2026-11-21"), "2026-11-15");
    assert.deepEqual(periodRange("this_week", today), { from: "2026-11-15", to: "2026-11-21" });
    assert.deepEqual(periodRange("next_week", today), { from: "2026-11-22", to: "2026-11-28" });
    assert.deepEqual(periodRange("tomorrow", today), { from: "2026-11-19", to: "2026-11-19" });
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });

  test("To-do is every open activity, Overdue the open ones due before now, the others by their day", () => {
    const now = new Date(`${today}T12:00:00`);
    const open = (dueAt) => ({ status: "open", dueAt });
    assert.ok(inPeriod(open(null), "todo", today, now));
    assert.ok(!inPeriod({ status: "done", dueAt: at(today) }, "todo", today, now));
    assert.ok(inPeriod(open(at(today, "09:00")), "overdue", today, now));
    assert.ok(!inPeriod(open(at(today, "15:00")), "overdue", today, now));
    assert.ok(inPeriod({ status: "done", dueAt: at(today, "15:00") }, "today", today, now));
    assert.ok(inPeriod(open(at("2026-11-21")), "this_week", today, now));
    assert.ok(!inPeriod(open(at("2026-11-22")), "this_week", today, now));
    assert.ok(inPeriod(open(at("2026-11-25")), "custom", today, now, { from: "2026-11-24", to: "2026-11-26" }));
    assert.ok(!inPeriod(open(null), "today", today, now));
  });

  test("week labels name the month and year once when they can", () => {
    assert.equal(weekLabel("2026-11-15"), "Nov 15 – 21, 2026");
    assert.equal(weekLabel("2026-11-29"), "Nov 29 – Dec 5, 2026");
    assert.equal(weekLabel("2026-12-27"), "Dec 27, 2026 – Jan 2, 2027");
  });

  test("overlapping activities share the width of the day", () => {
    const laid = layoutDay([{ id: 1, start: 540, end: 600 }, { id: 2, start: 570, end: 630 }, { id: 3, start: 700, end: 730 }]);
    const byId = Object.fromEntries(laid.map((item) => [item.id, item]));
    assert.deepEqual([byId[1].lane, byId[1].lanes], [0, 2]);
    assert.deepEqual([byId[2].lane, byId[2].lanes], [1, 2]);
    assert.deepEqual([byId[3].lane, byId[3].lanes], [0, 1]);
  });
});
