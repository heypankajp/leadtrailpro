import { listNumber } from "@/features/list-values/model";

/**
 * Delete and restore (request of November 20, 2026): how many days a deleted deal or lead can be restored, set in List of
 * Values (Restore Deleted Deals and Leads Within, 30 to start).
 */
export const restoreDaysOf = (values: readonly { value: string; active: boolean }[] | undefined) => listNumber("restore_days", values);

export type DeletedKind = "deals" | "leads";

/** One row of Restore Data. */
export type DeletedItem = {
  kind: "deal" | "lead"; id: number; title: string;
  deletedByName: string | null; deletedAt: string;
  /** When the scheduler removes it for good. */
  purgeAt: string;
  /** A deal's stage; null for a lead. */
  stage: string | null;
  status: string; contact: string | null; city: string | null;
  /** The deal's owner, or who added the lead by hand. */
  ownerName: string | null;
  /** A lead's origin; null for a deal. */
  origin: "manual" | "found" | null;
  canRestore: boolean;
};
