import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { compareCards, defaultNextStep, nextStepOf, parsePipelineFilters, quietDaysSince, resolveStageForAction, stageAdvances, stageChoices, stagesOfPipeline } from "../../src/features/pipeline/model.ts";
import { defaultPipelineSettings, normalizePipelineSettings } from "../../src/features/settings/model.ts";

const stages = [
  { id: 1, code: "new_deal", value: "New Deal", sortOrder: 1, active: true },
  { id: 2, code: "contact_made", value: "Contact Made", sortOrder: 2, active: true },
  { id: 3, code: "qualified", value: "Qualified", sortOrder: 3, active: true },
  { id: 4, code: "profile_shared", value: "Profile Shared", sortOrder: 4, active: true },
];

describe("pipeline stages (PIPE-02/03)", () => {
  test("a deal with no BD action starts in New Deal", () => assert.equal(resolveStageForAction(null, null, stages)?.code, "new_deal"));
  test("a mapped action lands in its stage", () => assert.equal(resolveStageForAction(10, 4, stages)?.code, "profile_shared"));
  test("an unmapped action counts as Contact Made", () => assert.equal(resolveStageForAction(10, null, stages)?.code, "contact_made"));
  test("a mapping to a stage that no longer exists counts as Contact Made", () => assert.equal(resolveStageForAction(10, 99, stages)?.code, "contact_made"));
  test("without the entry stage the first stage is used", () => assert.equal(resolveStageForAction(null, null, stages.slice(1))?.code, "contact_made"));
  test("no stages at all gives null", () => assert.equal(resolveStageForAction(10, 4, []), null));
  test("an action moves a deal forward only", () => {
    assert.equal(stageAdvances(stages[1], stages[3]), true);
    assert.equal(stageAdvances(stages[3], stages[1]), false);
    assert.equal(stageAdvances(stages[1], stages[1]), false);
    assert.equal(stageAdvances(null, stages[1]), true);
    assert.equal(stageAdvances(stages[1], null), false);
  });
});

describe("pipeline cards (PIPE-04/06)", () => {
  test("the next step is the earliest open task, else the follow-up date", () => {
    assert.deepEqual(nextStepOf({ followUpDate: "2026-11-20", nextTaskDueAt: "2026-11-14T15:00:00Z", nextTaskTitle: "Call Priya" }), { kind: "task", date: "2026-11-14", title: "Call Priya" });
    assert.deepEqual(nextStepOf({ followUpDate: "2026-11-12", nextTaskDueAt: "2026-11-14T15:00:00Z", nextTaskTitle: "Call Priya" }), { kind: "follow_up", date: "2026-11-12", title: null });
    assert.deepEqual(nextStepOf({ followUpDate: null, nextTaskDueAt: null, nextTaskTitle: "Send profiles" }), { kind: "task", date: "", title: "Send profiles" });
    assert.equal(nextStepOf({ followUpDate: null, nextTaskDueAt: null, nextTaskTitle: null }), null);
  });
  test("quiet days count whole days since the last activity", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    assert.equal(quietDaysSince("2026-11-11T09:00:00Z", now), 0);
    assert.equal(quietDaysSince("2026-11-04T13:00:00Z", now), 6);
    assert.equal(quietDaysSince("2026-11-04T11:00:00Z", now), 7);
    assert.equal(quietDaysSince("not a date", now), 0);
    assert.equal(quietDaysSince("2026-12-01T00:00:00Z", now), 0);
  });
  test("cards sort by next step, then last activity, then id", () => {
    const base = { nextTaskDueAt: null, nextTaskTitle: null };
    const a = { id: 1, followUpDate: "2026-11-15", lastActivityAt: "2026-11-01T00:00:00Z", ...base };
    const b = { id: 2, followUpDate: "2026-11-12", lastActivityAt: "2026-11-01T00:00:00Z", ...base };
    const c = { id: 3, followUpDate: null, lastActivityAt: "2026-11-10T00:00:00Z", ...base };
    const d = { id: 4, followUpDate: null, lastActivityAt: "2026-11-09T00:00:00Z", ...base };
    const e = { id: 5, followUpDate: null, lastActivityAt: "2026-11-09T00:00:00Z", ...base };
    assert.deepEqual([e, d, c, a, b].sort(compareCards).map((card) => card.id), [2, 1, 3, 5, 4]);
  });
  test("filters parse the scope, ids, text, and the show-more window", () => {
    assert.deepEqual(parsePipelineFilters(new URLSearchParams("scope=team&leadTypeId=3&ownerId=7&statusId=2&q=%20acme%20&stageId=4&offset=50")), { scope: "team", leadTypeId: 3, ownerId: 7, statusId: 2, q: "acme", stageId: 4, pipelineId: null, offset: 50 });
    assert.deepEqual(parsePipelineFilters(new URLSearchParams("scope=other&leadTypeId=x&offset=-5")), { scope: "mine", leadTypeId: null, ownerId: null, statusId: null, q: "", stageId: null, pipelineId: null, offset: 0 });
    assert.equal(parsePipelineFilters(new URLSearchParams("pipelineId=2")).pipelineId, 2);
  });
});

describe("next step suggestions (PIPE-09)", () => {
  const pipeline = { followUps: { contact_made: { activity: "call", businessDays: 1 }, profile_shared: { activity: "email", businessDays: 3 }, qualified: { activity: "visit", businessDays: 0 } }, promptNextStep: true, autoFollowUp: false };
  test("a stage with a suggestion gives its activity, due in business days, skipping weekends and holidays", () => {
    // 2026-11-13 is a Friday.
    assert.deepEqual(defaultNextStep("contact_made", pipeline, "2026-11-13", [], { executive: "Priya Patel", client: "Acme" }), { activity: "call", title: "Call Priya Patel", date: "2026-11-16", businessDays: 1, fromStage: true });
    assert.equal(defaultNextStep("contact_made", pipeline, "2026-11-13", ["2026-11-16"], { client: "Acme" }).date, "2026-11-17");
    assert.deepEqual(defaultNextStep("profile_shared", pipeline, "2026-11-13", [], { executive: "  ", client: "Acme" }), { activity: "email", title: "Email Acme", date: "2026-11-18", businessDays: 3, fromStage: true });
    assert.equal(defaultNextStep("qualified", pipeline, "2026-11-13", [], { client: "Acme" }).date, "2026-11-13", "zero business days is the same day");
  });
  test("a stage without a suggestion, or no stage, offers a follow-up on the next working day", () => {
    assert.deepEqual(defaultNextStep("contract_signed", pipeline, "2026-11-13", [], { client: "Acme" }), { activity: "task", title: "Follow up with Acme", date: "2026-11-16", businessDays: 1, fromStage: false });
    assert.equal(defaultNextStep(null, pipeline, "2026-11-11", [], { client: "Acme" }).date, "2026-11-12");
  });
  test("pipeline settings normalise with defaults and reject bad entries", () => {
    assert.deepEqual(normalizePipelineSettings({}), { pipeline: { ...defaultPipelineSettings, followUps: { ...defaultPipelineSettings.followUps } }, error: null });
    assert.deepEqual(normalizePipelineSettings({ followUps: { contact_made: { activity: "email", businessDays: "2" }, qualified: null }, promptNextStep: false, autoFollowUp: true }), { pipeline: { followUps: { contact_made: { activity: "email", businessDays: 2 } }, promptNextStep: false, autoFollowUp: true }, error: null });
    assert.match(normalizePipelineSettings({ followUps: { contact_made: { activity: "fax", businessDays: 1 } } }).error, /call, email, visit, or task/);
    assert.match(normalizePipelineSettings({ followUps: { contact_made: { activity: "call", businessDays: 99 } } }).error, /0 to 60 business days/);
    assert.match(normalizePipelineSettings({ followUps: { "Bad Key": { activity: "call", businessDays: 1 } } }).error, /stage code/);
  });

  // PD-09, SPEC §10.18
  test("several pipelines: stage choices name the other pipeline, each pipeline has its own steps, and an action never crosses pipelines", () => {
    const sales = { id: 1, name: "Sales pipeline", sortOrder: 1, active: true, isDefault: true };
    const renewals = { id: 2, name: "Renewals", sortOrder: 2, active: true, isDefault: false };
    const retired = { id: 3, name: "Old", sortOrder: 3, active: false, isDefault: false };
    const all = [
      { id: 10, value: "New Deal", sortOrder: 1, pipelineId: 1 }, { id: 11, value: "Qualified", sortOrder: 3, pipelineId: 1 },
      { id: 20, value: "New", sortOrder: 8, pipelineId: 2 }, { id: 21, value: "Qualified", sortOrder: 9, pipelineId: 2 }, { id: 30, value: "Parked", sortOrder: 10, pipelineId: 3 },
    ];
    // One pipeline: plain names, nothing added.
    assert.deepEqual(stageChoices(all.slice(0, 2), [sales]).map((stage) => stage.value), ["New Deal", "Qualified"]);
    // Two active pipelines: the default first with plain names, the other one named; a switched-off pipeline is left out.
    assert.deepEqual(stageChoices(all, [sales, renewals, retired]).map((stage) => stage.value), ["New Deal", "Qualified", "Renewals: New", "Renewals: Qualified"]);
    assert.deepEqual(stagesOfPipeline(all, 2, [sales, renewals]).map((stage) => stage.id), [20, 21]);
    assert.deepEqual(stagesOfPipeline(all, null, [sales, renewals]).map((stage) => stage.id), [10, 11]);
    assert.equal(stageAdvances({ sortOrder: 8, pipelineId: 2 }, { sortOrder: 3, pipelineId: 1 }), false);
    assert.equal(stageAdvances({ sortOrder: 1, pipelineId: 2 }, { sortOrder: 3, pipelineId: 1 }), false, "a later default stage does not pull a deal out of another pipeline");
    assert.equal(stageAdvances({ sortOrder: 1, pipelineId: 1 }, { sortOrder: 3, pipelineId: 1 }), true);
  });
});
