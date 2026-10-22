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
    assert.deepEqual(normalizeInactivityRules([{ statusId: "3", bdActionId: "", days: "5" }, { statusId: 3, bdActionId: null, days: 9 }]), { rules: [{ statusId: 3, bdActionId: null, days: 9 }], error: null });
    assert.match(normalizeInactivityRules([{ statusId: null, bdActionId: null, days: 5 }]).error, /needs a status, a BD action, or both/);
    assert.match(normalizeInactivityRules([{ statusId: 1, bdActionId: null, days: 0 }]).error, /between 1 and 365/);
    assert.match(normalizeInactivityRules("nope").error, /must be a list/);
  });
});
