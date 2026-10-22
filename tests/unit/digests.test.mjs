import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isDigestDue, timeOfDayIn, weekdayOfYmd } from "../../src/features/notifications/model.ts";

describe("digest scheduling (TASK-06)", () => {
  const settings = { enabled: true, dailyTime: "07:30", weeklyDay: 1, weeklyTime: "08:00" };
  const toronto = "America/Toronto";
  // 2026-10-19 is a Monday. 12:00Z is 08:00 in Toronto (EDT).
  const mondayMorning = new Date("2026-10-19T12:00:00Z");
  const mondayEarly = new Date("2026-10-19T11:00:00Z");
  const tuesday = new Date("2026-10-20T15:00:00Z");

  test("reads the time of day and weekday in the business zone", () => {
    assert.deepEqual(timeOfDayIn(mondayMorning, toronto), { hour: 8, minute: 0 });
    assert.equal(weekdayOfYmd("2026-10-19"), 1);
    assert.equal(weekdayOfYmd("2026-10-25"), 0);
  });

  test("the daily digest is due once its time has passed", () => {
    assert.equal(isDigestDue("daily", settings, mondayEarly, toronto, "2026-10-19"), false);
    assert.equal(isDigestDue("daily", settings, mondayMorning, toronto, "2026-10-19"), true);
    assert.equal(isDigestDue("daily", { ...settings, enabled: false }, mondayMorning, toronto, "2026-10-19"), false);
  });

  test("the weekly digest is due only on its weekday after its time", () => {
    assert.equal(isDigestDue("weekly", settings, mondayEarly, toronto, "2026-10-19"), false);
    assert.equal(isDigestDue("weekly", settings, mondayMorning, toronto, "2026-10-19"), true);
    assert.equal(isDigestDue("weekly", settings, tuesday, toronto, "2026-10-20"), false);
    assert.equal(isDigestDue("weekly", { ...settings, weeklyDay: 2 }, tuesday, toronto, "2026-10-20"), true);
  });
});
