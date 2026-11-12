import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeInactivityRules, resolveInactivityDays } from "../../src/features/settings/model.ts";

describe("needs-attention rules (TASK-05)", () => {
  const reminders = {
    inactivityDays: 7,
    rules: [
      { statusId: 3, bdActionId: null, days: 3 },      // Hot leads: 3 days
      { statusId: null, bdActionId: 20, days: 21 },    // Contract Signed: 21 days
      { statusId: 1, bdActionId: 5, days: 14 },        // Cold + Introduction Email Sent: 14 days
    ],
  };
  test("the most specific rule wins, then action, then status, then the default", () => {
    assert.equal(resolveInactivityDays({ statusId: 1, bdActionId: 5 }, reminders), 14);
    assert.equal(resolveInactivityDays({ statusId: 3, bdActionId: 20 }, reminders), 21);
    assert.equal(resolveInactivityDays({ statusId: 3, bdActionId: 9 }, reminders), 3);
    assert.equal(resolveInactivityDays({ statusId: 2, bdActionId: null }, reminders), 7);
  });
  test("rules are validated and duplicates collapse", () => {
    assert.deepEqual(normalizeInactivityRules([{ statusId: "3", bdActionId: "", days: "5" }, { statusId: 3, bdActionId: null, days: 9 }]), { rules: [{ statusId: 3, bdActionId: null, stageId: null, days: 9 }], error: null });
    assert.match(normalizeInactivityRules([{ statusId: null, bdActionId: null, days: 5 }]).error, /needs a status, a BD action, a stage/);
    assert.deepEqual(normalizeInactivityRules([{ stageId: "11", days: 4 }]), { rules: [{ statusId: null, bdActionId: null, stageId: 11, days: 4 }], error: null });
    assert.match(normalizeInactivityRules([{ statusId: 1, bdActionId: null, days: 0 }]).error, /between 1 and 365/);
    assert.match(normalizeInactivityRules("nope").error, /must be a list/);
  });
  test("PIPE-08: a stage rule sits between BD action and status in precedence", () => {
    const withStages = { inactivityDays: 7, rules: [...reminders.rules, { statusId: null, bdActionId: null, stageId: 11, days: 5 }, { statusId: 3, bdActionId: null, stageId: 11, days: 2 }] };
    assert.equal(resolveInactivityDays({ statusId: 2, bdActionId: null, stageId: 11 }, withStages), 5, "stage alone");
    assert.equal(resolveInactivityDays({ statusId: 3, bdActionId: null, stageId: 11 }, withStages), 2, "status and stage beat stage and status alone");
    assert.equal(resolveInactivityDays({ statusId: 3, bdActionId: 20, stageId: 11 }, withStages), 21, "a BD action rule beats status and stage");
    assert.equal(resolveInactivityDays({ statusId: 1, bdActionId: 5, stageId: 11 }, withStages), 14, "status and BD action beat everything");
    assert.equal(resolveInactivityDays({ statusId: 2, bdActionId: null, stageId: 12 }, withStages), 7, "no match: the default");
    assert.equal(resolveInactivityDays({ statusId: 2, bdActionId: null }, withStages), 7, "a lead without a stage never matches a stage rule");
  });
});
