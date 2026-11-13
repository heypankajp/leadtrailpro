import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatKpiHtml, formatKpiText, hasKpiActivity, isKpiReportDue, kpiActivityPeriod, kpiActivityTotals, kpiPeriodKey, kpiSubject, kpiTotals, normalizeKpiReports } from "../../src/features/reports/kpi-model.ts";
import { normalizeEmailSettings } from "../../src/features/settings/model.ts";

const toronto = "America/Toronto";
const digests = { dailyTime: "07:30", weeklyDay: 1, weeklyTime: "08:00" };
// 2026-11-09 is a Monday; 13:00Z is 08:00 in Toronto (EST).
const mondayEight = new Date("2026-11-09T13:00:00Z");
const mondaySeven = new Date("2026-11-09T12:00:00Z");

// Status keys are the list value ids as text: 1 = Cold, 3 = Hot.
const statuses = [{ key: "1", label: "Cold" }, { key: "3", label: "Hot" }];
const row = (name, overrides = {}) => ({ userId: 1, name, role: "sales_manager", leads: 20, byStatus: { 1: 15, 3: 5 }, overdueFollowUps: 3, stalled: 1, repliesWaiting: 0, ...overrides });
const activityRow = (name, overrides = {}) => ({ userId: 1, name, role: "sales_manager", leadsCreated: 2, leadsUpdated: 3, calls: 10, emails: 4, visits: 1, notes: 0, conversions: 1, tasksCompleted: 2, targetPercent: 50, ...overrides });

describe("KPI report emails (SPEC §7.18)", () => {
  test("the daily report is due on business days at the daily digest time, never on weekends or holidays", () => {
    assert.equal(isKpiReportDue("daily", digests, mondaySeven, toronto, "2026-11-09"), false);
    assert.equal(isKpiReportDue("daily", digests, mondayEight, toronto, "2026-11-09"), true);
    assert.equal(isKpiReportDue("daily", digests, new Date("2026-11-14T15:00:00Z"), toronto, "2026-11-14"), false); // Saturday
    assert.equal(isKpiReportDue("daily", digests, mondayEight, toronto, "2026-11-09", ["2026-11-09"]), false); // holiday
  });

  test("the weekly report follows the weekly digest day and time; the monthly one goes on the first of the month", () => {
    assert.equal(isKpiReportDue("weekly", digests, mondayEight, toronto, "2026-11-09"), true);
    assert.equal(isKpiReportDue("weekly", digests, new Date("2026-11-09T12:30:00Z"), toronto, "2026-11-09"), false); // 07:30, before 08:00
    assert.equal(isKpiReportDue("weekly", digests, new Date("2026-11-10T15:00:00Z"), toronto, "2026-11-10"), false); // Tuesday
    assert.equal(isKpiReportDue("monthly", digests, new Date("2026-12-01T15:00:00Z"), toronto, "2026-12-01"), true);
    assert.equal(isKpiReportDue("monthly", digests, new Date("2026-12-02T15:00:00Z"), toronto, "2026-12-02"), false);
  });

  test("one run per period: the day, the week's Monday, the month", () => {
    assert.equal(kpiPeriodKey("daily", "2026-11-11"), "2026-11-11");
    assert.equal(kpiPeriodKey("weekly", "2026-11-11"), "week-2026-11-09");
    assert.equal(kpiPeriodKey("weekly", "2026-11-15"), "week-2026-11-09"); // Sunday belongs to the week that started Monday
    assert.equal(kpiPeriodKey("monthly", "2026-12-01"), "month-2026-12");
  });

  test("the totals sum the deals status by status and what is waiting; the period's totals average the target over people who have one", () => {
    const totals = kpiTotals([row("Ada"), row("Sam", { userId: 2, leads: 1500, byStatus: { 1: 1500 }, overdueFollowUps: 40 }), row("Kim", { userId: 3, leads: 0, byStatus: {} })]);
    assert.equal(totals.name, "All Sales Managers");
    assert.equal(totals.leads, 1520);
    assert.deepEqual(totals.byStatus, { 1: 1515, 3: 5 });
    assert.equal(totals.overdueFollowUps, 46);
    assert.equal(totals.stalled, 3);
    assert.deepEqual(kpiTotals([]).byStatus, {});
    const period = kpiActivityTotals([activityRow("Ada"), activityRow("Sam", { userId: 2, calls: 5, targetPercent: null }), activityRow("Kim", { userId: 3, targetPercent: 100 })]);
    assert.equal(period.calls, 25);
    assert.equal(period.leadsCreated, 6);
    assert.equal(period.targetPercent, 75);
    assert.equal(kpiActivityTotals([]).targetPercent, null);
  });

  test("the daily report has no period; weekly and monthly add last week's or last month's activity, only for people who recorded something", () => {
    assert.deepEqual(kpiActivityPeriod, { daily: null, weekly: "last_week", monthly: "last_month" });
    assert.equal(hasKpiActivity(activityRow("Ada")), true);
    assert.equal(hasKpiActivity(activityRow("Idle", { leadsCreated: 0, leadsUpdated: 0, calls: 0, emails: 0, visits: 0, notes: 0, conversions: 0, tasksCompleted: 0, targetPercent: 0 })), false);
  });

  test("the daily body is the current state only: deals by status per person, the totals, the pipeline by stage; HTML is escaped", () => {
    const rows = [row("Daniel", { leads: 1881, byStatus: { 1: 1800, 3: 81 }, overdueFollowUps: 366, stalled: 1859 }), row("Sam <Seller>", { userId: 2 })];
    const data = { kind: "daily", asOf: "2026-11-12 07:30", timeZone: "America/Toronto", statuses, rows, totals: kpiTotals(rows), pipelineByStage: [{ label: "New Deal", count: 20 }, { label: "Contact Made", count: 10 }], activity: null, appUrl: "https://leadtrail.pro/#/reports" };
    assert.equal(kpiSubject(data), "LeadTrailPro KPI report (daily): as of 2026-11-12");
    const text = formatKpiText(data);
    assert.match(text, /Daily KPI report as of 2026-11-12 07:30 \(America\/Toronto\): 1,901 deals with 2 Sales Managers\./);
    assert.match(text, /Sales Manager\s+Deals\s+Cold\s+Hot\s+Overdue\s+Stalled\s+Replies/);
    assert.match(text, /Daniel\s+1,881\s+1,800\s+81\s+366\s+1,859\s+0/);
    assert.match(text, /All Sales Managers\s+1,901\s+1,815\s+86\s+369\s+1,860\s+0/);
    assert.match(text, /Pipeline by stage \(30 on the board\): New Deal 20, Contact Made 10\./);
    assert.match(text, /https:\/\/leadtrail\.pro\/#\/reports/);
    // Nothing about a period: no yesterday columns next to the current ones.
    assert.doesNotMatch(text, /Activity recorded|Calls|Created|Target/);
    const html = formatKpiHtml(data);
    assert.match(html, /<table/);
    assert.match(html, /By status/);
    assert.match(html, /Waiting on the person/);
    assert.match(html, /Sam &lt;Seller&gt;/);
    assert.doesNotMatch(html, /<Seller>/);
    assert.match(html, /All Sales Managers/);
    assert.match(html, /Pipeline by stage \(30 on the board\): New Deal <strong>20<\/strong>/);
    assert.doesNotMatch(html, /Activity recorded/);
    const empty = formatKpiText({ ...data, statuses: [], rows: [], totals: kpiTotals([]), pipelineByStage: [], appUrl: null });
    assert.match(empty, /0 deals with 0 Sales Managers/);
    assert.match(empty, /No active Sales Manager/);
    assert.match(empty, /no deals on the board/);
  });

  test("the weekly body adds the period's activity below the current state, or says that nothing was recorded", () => {
    const rows = [row("Ada Admin")];
    const active = [activityRow("Ada Admin")];
    const data = { kind: "weekly", asOf: "2026-11-09 08:00", timeZone: "America/Toronto", statuses, rows, totals: kpiTotals(rows), pipelineByStage: [], activity: { periodLabel: "2026-11-02 to 2026-11-08", rows: active, totals: kpiActivityTotals(active) }, appUrl: null };
    assert.equal(kpiSubject(data), "LeadTrailPro KPI report (weekly): as of 2026-11-09");
    const text = formatKpiText(data);
    assert.match(text, /Weekly KPI report as of 2026-11-09 08:00/);
    assert.match(text, /Ada Admin\s+20\s+15\s+5\s+3\s+1\s+0/);
    assert.match(text, /Activity recorded in LeadTrailPro, 2026-11-02 to 2026-11-08:/);
    assert.match(text, /Sales Manager\s+Created\s+Updated\s+Calls/);
    assert.match(text, /Ada Admin\s+2\s+3\s+10\s+4\s+1\s+0\s+1\s+2\s+50%/);
    assert.ok(text.indexOf("Pipeline by stage") < text.indexOf("Activity recorded"), "the current state comes first");
    assert.match(formatKpiHtml(data), /<strong>Activity recorded in LeadTrailPro, 2026-11-02 to 2026-11-08<\/strong>/);
    const quiet = { ...data, activity: { periodLabel: "2026-11-02 to 2026-11-08", rows: [], totals: kpiActivityTotals([]) } };
    assert.match(formatKpiText(quiet), /No activity was recorded in LeadTrailPro for 2026-11-02 to 2026-11-08\./);
    assert.match(formatKpiHtml(quiet), /No activity was recorded in LeadTrailPro for 2026-11-02 to 2026-11-08\./);
    assert.doesNotMatch(formatKpiText(quiet), /Created\s+Updated/);
  });

  test("the switches default to on and survive the email settings round trip", () => {
    assert.deepEqual(normalizeKpiReports(undefined), { daily: true, weekly: true, monthly: true });
    assert.deepEqual(normalizeKpiReports({ weekly: false, monthly: "yes" }), { daily: true, weekly: false, monthly: false });
    const { email, error } = normalizeEmailSettings({ senderUserId: 3, kpiReports: { daily: false } });
    assert.equal(error, null);
    assert.deepEqual(email.kpiReports, { daily: false, weekly: true, monthly: true });
    assert.equal(email.senderUserId, 3);
  });
});
