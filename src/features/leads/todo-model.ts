/**
 * To Do lists (TODO-01..05, SPEC §10.12): named lists an administrator defines under List of values ("To be visited"
 * is the first), on which a salesperson puts a lead by hand to come back to it, and from which they take it off by
 * hand. A lead is on one list at a time. Nothing here is automatic. Pure rules, no app imports, so the unit tests
 * load this file directly.
 */

/** The timeline line for a move: onto a list, from one list to another, or off. */
export function todoMoveSummary(from: string | null, to: string | null): string {
  if (to && from) return `To Do: moved from ${from} to ${to}`;
  if (to) return `To Do: added to ${to}`;
  return `To Do: removed from ${from ?? "the list"}`;
}

export type TodoCount = { listId: number; mine: number; everyone: number };
export type TodoCounts = { lists: TodoCount[]; mine: number; everyone: number };

export function summarizeTodoCounts(lists: TodoCount[]): TodoCounts {
  return { lists, mine: lists.reduce((sum, list) => sum + list.mine, 0), everyone: lists.reduce((sum, list) => sum + list.everyone, 0) };
}

export type TodoScope = "mine" | "everyone";
export type TodoTab = { id: number | null; label: string; count: number };

/**
 * The tabs of the To Do page: "All lists" first, then every active list in list order, and a list that was switched
 * off but still has leads on it, so they can be found and moved.
 */
export function todoTabs(lists: { id: number; value: string; active: boolean }[], counts: TodoCounts | null, scope: TodoScope): TodoTab[] {
  const countOf = (id: number) => counts?.lists.find((item) => item.listId === id)?.[scope] ?? 0;
  return [
    { id: null, label: "All lists", count: counts ? counts[scope] : 0 },
    ...lists.filter((list) => list.active || countOf(list.id) > 0).map((list) => ({ id: list.id, label: list.value, count: countOf(list.id) })),
  ];
}
