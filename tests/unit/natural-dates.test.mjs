// Unit tests for the natural-language date parser (TASK-03, NOTE-05). Runs on Node 22 with its built-in
// TypeScript type stripping: `npm run test:unit`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isWorkingDay, nextWorkingDay, parseNaturalDate, parseTimeOfDay, suggestFollowUp } from "../../src/lib/natural-dates.ts";

// Monday 2026-10-19 anchors most cases. 2026-11-01 is a Sunday, 2026-10-31 a Saturday, 2027-01-01 a Friday.
const anchor = "2026-10-19";
const parse = (text, options = {}) => parseNaturalDate(text, { anchor, ...options });
const dateOf = (text, options) => parse(text, options)?.date ?? null;

describe("working days", () => {
  test("weekends and holidays are not working days", () => {
    assert.equal(isWorkingDay("2026-10-19"), true);
    assert.equal(isWorkingDay("2026-10-24"), false);
    assert.equal(isWorkingDay("2026-10-19", ["2026-10-19"]), false);
    assert.equal(nextWorkingDay("2026-10-24"), "2026-10-26");
    assert.equal(nextWorkingDay("2026-10-26", ["2026-10-26"]), "2026-10-27");
  });
});

describe("relative phrases", () => {
  test("today, tomorrow, and the day after", () => {
    assert.equal(dateOf("call back today"), "2026-10-19");
    assert.equal(dateOf("follow up tomorrow"), "2026-10-20");
    assert.equal(dateOf("day after tomorrow"), "2026-10-21");
    assert.equal(parse("day after tomorrow").matched, "day after tomorrow");
  });
  test("tomorrow on a Friday moves to Monday and says so", () => {
    const result = parse("tomorrow", { anchor: "2026-10-23" });
    assert.equal(result.date, "2026-10-26");
    assert.equal(result.adjusted, true);
  });
  test("next week, month, quarter, and year start on a working day", () => {
    assert.equal(dateOf("next week"), "2026-10-26");
    assert.equal(dateOf("next month"), "2026-11-02");
    assert.equal(dateOf("next quarter"), "2027-01-01");
    assert.equal(dateOf("next quarter", { holidays: ["2027-01-01"] }), "2027-01-04");
    assert.equal(dateOf("next year", { holidays: ["2027-01-01"] }), "2027-01-04");
  });
  test("end of week, month, and year use the last working day", () => {
    assert.equal(dateOf("end of the week"), "2026-10-23");
    assert.equal(dateOf("end of month"), "2026-10-30");
    assert.equal(dateOf("end of year"), "2026-12-31");
    assert.equal(dateOf("end of the year", { holidays: ["2026-12-31"] }), "2026-12-30");
  });
});

describe("weekday names", () => {
  test("the next occurrence after the anchor", () => {
    assert.equal(dateOf("Friday"), "2026-10-23");
    assert.equal(dateOf("on wed"), "2026-10-21");
    assert.equal(dateOf("next Monday"), "2026-10-26");
    assert.equal(parse("next Monday").kind, "weekday");
  });
  test("a holiday weekday moves to the next working day", () => {
    const result = parse("Monday", { holidays: ["2026-10-26"] });
    assert.equal(result.date, "2026-10-27");
    assert.equal(result.adjusted, true);
  });
  test("bare sat and sun are not weekdays", () => {
    assert.equal(parse("we sat down with the team"), null);
    assert.equal(dateOf("Saturday"), "2026-10-24");
  });
});

describe("periods", () => {
  test("counts from the anchor and lands on a working day", () => {
    assert.equal(dateOf("in two weeks"), "2026-11-02");
    assert.equal(dateOf("in 12 days"), "2026-11-02"); // Oct 31 is a Saturday
    assert.equal(dateOf("six months"), "2027-04-19");
    assert.equal(dateOf("in a month"), "2026-11-19");
    assert.equal(dateOf("in a couple of weeks"), "2026-11-02");
    assert.equal(dateOf("3 business days"), "2026-10-22");
  });
  test("relative periods count from the interaction date, not today", () => {
    assert.equal(dateOf("six months", { anchor: "2026-01-15" }), "2026-07-15");
  });
  test("needs a count and ignores the past", () => {
    assert.equal(parse("what a week"), null);
    assert.equal(parse("two weeks ago"), null);
  });
});

describe("month names", () => {
  test("a month alone is its first working day, next time it comes around", () => {
    assert.equal(dateOf("January"), "2027-01-01");
    assert.equal(dateOf("January", { holidays: ["2027-01-01"] }), "2027-01-04");
    assert.equal(dateOf("follow up in November"), "2026-11-02");
    assert.equal(dateOf("October"), "2027-10-01");
    assert.equal(parse("January").kind, "month");
  });
  test("month and year", () => {
    assert.equal(dateOf("March 2027"), "2027-03-01");
  });
  test("lower-case may is a verb, capitalised May is the month", () => {
    assert.equal(parse("we may call later"), null);
    assert.equal(dateOf("May"), "2027-05-03");
  });
});

describe("explicit dates", () => {
  test("many spellings", () => {
    assert.equal(dateOf("Feb/01/2027"), "2027-02-01");
    assert.equal(dateOf("Feb 1"), "2027-02-01");
    assert.equal(dateOf("february 1st, 2027"), "2027-02-01");
    assert.equal(dateOf("1st of February"), "2027-02-01");
    assert.equal(dateOf("1 Feb 2027"), "2027-02-01");
    assert.equal(dateOf("02/01/2027"), "2027-02-01");
    assert.equal(dateOf("15/02/2027"), "2027-02-15");
    assert.equal(dateOf("2027-02-01"), "2027-02-01");
    assert.equal(dateOf("Dec 25"), "2026-12-25");
  });
  test("explicit dates are kept as written, even on a weekend", () => {
    const result = parse("Oct 24");
    assert.equal(result.date, "2026-10-24");
    assert.equal(result.adjusted, false);
    assert.equal(result.kind, "explicit");
  });
  test("the longer phrase wins over the month inside it; the earliest phrase wins overall", () => {
    assert.equal(parse("Feb 1").matched, "Feb 1");
    assert.equal(dateOf("tomorrow or Feb 1"), "2026-10-20");
  });
});

describe("time of day", () => {
  test("clock words and numbers", () => {
    assert.equal(parseTimeOfDay("at 10am"), "10:00");
    assert.equal(parseTimeOfDay("3:30 pm"), "15:30");
    assert.equal(parseTimeOfDay("at 10 a.m."), "10:00");
    assert.equal(parseTimeOfDay("at 3"), "15:00");
    assert.equal(parseTimeOfDay("at 10"), "10:00");
    assert.equal(parseTimeOfDay("14:45"), "14:45");
    assert.equal(parseTimeOfDay("noon"), "12:00");
    assert.equal(parseTimeOfDay("in the morning"), "09:00");
    assert.equal(parseTimeOfDay("no time here"), null);
  });
  test("a date phrase does not count as a time", () => {
    assert.deepEqual([parse("next Monday at 10am").date, parse("next Monday at 10am").time], ["2026-10-26", "10:00"]);
    assert.equal(parse("Feb 1").time, null);
    assert.equal(parse("in 2 weeks").time, null);
  });
});

describe("follow-up suggestions from notes", () => {
  const options = { anchor, person: "Priya Patel", company: "Acme Robotics" };
  test("a follow-up phrase with a date suggests a task", () => {
    const result = suggestFollowUp("Great call. Follow up next week about the proposal.", options);
    assert.equal(result.date, "2026-10-26");
    assert.equal(result.title, "Follow up with Priya Patel");
    assert.equal(result.sentence, "Follow up next week about the proposal");
  });
  test("titles follow the instruction", () => {
    assert.equal(suggestFollowUp("Call them back on Thursday at 2pm", options).title, "Call Priya Patel back");
    assert.equal(suggestFollowUp("Call them back on Thursday at 2pm", options).time, "14:00");
    assert.equal(suggestFollowUp("Let's meet on Nov 5 at 10:30", options).title, "Meeting with Priya Patel");
    assert.equal(suggestFollowUp("Visit the plant next Friday", options).title, "Visit Acme Robotics");
    assert.equal(suggestFollowUp("Will send the revised quote by Friday", options).date, "2026-10-23");
  });
  test("past events and dates without a next step are ignored", () => {
    assert.equal(suggestFollowUp("Shared profiles on Monday.", options), null);
    assert.equal(suggestFollowUp("They signed the contract on Monday.", options), null);
    assert.equal(suggestFollowUp("Follow up on 2026-01-05", options), null);
    assert.equal(suggestFollowUp("Client wants profiles for two welders.", options), null);
  });
  test("falls back to the company when there is no contact name", () => {
    assert.equal(suggestFollowUp("Follow up tomorrow", { anchor, person: "", company: "Acme Robotics" }).title, "Follow up with Acme Robotics");
  });
});
