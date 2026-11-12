import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatKpiHtml, formatKpiText, isKpiReportDue, kpiPeriodKey, kpiSubject, kpiTotals, normalizeKpiReports } from "../../src/features/reports/kpi-model.ts";
import { normalizeEmailSettings } from "../../src/features/settings/model.ts";

const toronto = "America/Toronto";
const digests = { dailyTime: "07:30", weeklyDay: 1, weeklyTime: "08:00" };
// 2026-11-09 is a Monday; 13:00Z is 08:00 in Toronto (EST).
const mondayEight = new Date("2026-11-09T13:00:00Z");
const mondaySeven = new Date("2026-11-09T12:00:00Z");

const row = (name, overrides = {}) => ({
  userId: 1, name, role: "sales_manager", leadsCreated: 2, leadsUpdated: 3, calls: 10, emails: 4, visits: 1, notes: 0, conversions: 1, tasksCompleted: 2, targetPercent: 50,
  activeLeads: 20, overdueFollowUps: 3, stalled: 1, repliesWaiting: 0, ...overrides,
});

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

  test("the totals sum every count and average the target percentage over people who have one", () => {
    const totals = kpiTotals([row("Ada"), row("Sam", { userId: 2, calls: 5, targetPercent: null }), row("Kim", { userId: 3, targetPercent: 100 })]);
    assert.equal(totals.name, "All Sales Managers");
    assert.equal(totals.calls, 25);
    assert.equal(totals.leadsCreated, 6);
    assert.equal(totals.activeLeads, 60);
    assert.equal(totals.targetPercent, 75);
    assert.equal(kpiTotals([]).targetPercent, null);
  });

  test("the text and HTML bodies carry the table, the totals, and the pipeline; HTML is escaped", () => {
    const rows = [row("Ada Admin"), row("Sam <Seller>", { userId: 2, targetPercent: null })];
    const data = { kind: "weekly", startYmd: "2026-11-02", endYmd: "2026-11-08", periodLabel: "2026-11-02 to 2026-11-08", generatedAt: "2026-11-09T13:00:00.000Z", rows, totals: kpiTotals(rows), pipeline: [{ label: "Cold", count: 30 }, { label: "Hot", count: 4 }], pipelineTotal: 34, pipelineByStage: [{ label: "New Deal", count: 20 }, { label: "Contact Made", count: 10 }], appUrl: "https://leadtrail.pro/#/reports" };
    assert.equal(kpiSubject(data), "LeadTrailPro KPI report (weekly): 2026-11-02 to 2026-11-08");
    const text = formatKpiText(data);
    assert.match(text, /Weekly KPI report for 2026-11-02 to 2026-11-08: 2 Sales Managers/);
    assert.match(text, /Sales Manager\s+Leads\s+Updated\s+Calls/);
    assert.match(text, /Ada Admin\s+2\s+3\s+10\s+4\s+1\s+0\s+1\s+2\s+50%\s+20\s+3\s+1\s+0/);
    assert.match(text, /All Sales Managers\s+4\s+6\s+20/);
    assert.match(text, /Pipeline now \(34 active leads\): Cold 30, Hot 4\./);
    assert.match(text, /Pipeline by stage \(30 on the board\): New Deal 20, Contact Made 10\./);
    assert.match(text, /https:\/\/leadtrail\.pro\/#\/reports/);
    const html = formatKpiHtml(data);
    assert.match(html, /<table/);
    assert.match(html, /Sam &lt;Seller&gt;/);
    assert.doesNotMatch(html, /<Seller>/);
    assert.match(html, /All Sales Managers/);
    assert.match(html, /Pipeline now \(34 active leads\)/);
    assert.match(html, /Pipeline by stage \(30 on the board\): New Deal <strong>20<\/strong>/);
    const empty = formatKpiText({ ...data, rows: [], totals: kpiTotals([]), pipeline: [], pipelineTotal: 0, pipelineByStage: [], appUrl: null });
    assert.match(empty, /No active Sales Manager/);
    assert.match(empty, /no active leads/);
    assert.match(empty, /no leads on the board/);
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
