import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { summarizeTodoCounts, todoMoveSummary, todoTabs } from "../../src/features/leads/todo-model.ts";

describe("To Do lists (SPEC §10.12)", () => {
  test("the timeline says whether the lead was added, moved, or taken off", () => {
    assert.equal(todoMoveSummary(null, "To be visited"), "To Do: added to To be visited");
    assert.equal(todoMoveSummary("To be visited", "Call back"), "To Do: moved from To be visited to Call back");
    assert.equal(todoMoveSummary("To be visited", null), "To Do: removed from To be visited");
    assert.equal(todoMoveSummary(null, null), "To Do: removed from the list");
  });

  test("the counts add up per person and for everyone", () => {
    const counts = summarizeTodoCounts([{ listId: 5, mine: 2, everyone: 7 }, { listId: 6, mine: 0, everyone: 3 }]);
    assert.equal(counts.mine, 2);
    assert.equal(counts.everyone, 10);
    assert.deepEqual(summarizeTodoCounts([]), { lists: [], mine: 0, everyone: 0 });
  });

  test("the tabs are All lists, then each active list in order; a switched-off list stays while leads are on it", () => {
    const lists = [{ id: 5, value: "To be visited", active: true }, { id: 6, value: "Call back", active: true }, { id: 7, value: "Old list", active: false }, { id: 8, value: "Retired", active: false }];
    const counts = summarizeTodoCounts([{ listId: 5, mine: 2, everyone: 7 }, { listId: 7, mine: 0, everyone: 1 }]);
    assert.deepEqual(todoTabs(lists, counts, "mine"), [
      { id: null, label: "All lists", count: 2 }, { id: 5, label: "To be visited", count: 2 }, { id: 6, label: "Call back", count: 0 },
    ]);
    assert.deepEqual(todoTabs(lists, counts, "everyone"), [
      { id: null, label: "All lists", count: 8 }, { id: 5, label: "To be visited", count: 7 }, { id: 6, label: "Call back", count: 0 }, { id: 7, label: "Old list", count: 1 },
    ]);
    // Before the counts arrive the tabs are there with zeros.
    assert.deepEqual(todoTabs(lists.slice(0, 1), null, "mine"), [{ id: null, label: "All lists", count: 0 }, { id: 5, label: "To be visited", count: 0 }]);
  });
});
