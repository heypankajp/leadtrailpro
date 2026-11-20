/**
 * The approval queue for back-dated deals (requests of November 20, 2026). Self-contained (no imports) so the server, the
 * deal form and the unit tests share it.
 *
 * - A deal whose first-contact date is earlier than the allowed working days back is queued. The number of working days is
 *   the List of Values setting "Queue Deals Older Than (Working Days)" (1 to start): with 1, a deal may start on the previous
 *   working day, so on a Monday Friday's date is accepted. Weekends and the holidays in Settings are not working days.
 * - Peer approval: anyone who may edit deals approves or rejects a queued deal, except its owner and the person who created it.
 */

const addDays = (ymd: string, days: number): string => {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const isWorkingDay = (ymd: string, holidays: readonly string[]): boolean => {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.includes(ymd);
};

/** The earliest first-contact date saved without approval: `workingDays` working days before today (0: today only). */
export function queueCutoff(today: string, workingDays: number, holidays: readonly string[] = []): string {
  let cutoff = today;
  for (let step = 0; step < Math.max(0, Math.floor(workingDays)); step += 1) {
    cutoff = addDays(cutoff, -1);
    while (!isWorkingDay(cutoff, holidays)) cutoff = addDays(cutoff, -1);
  }
  return cutoff;
}

/** True when a deal with this first-contact date waits for a colleague's approval. */
export function needsPeerApproval(firstContactDate: string, today: string, workingDays: number, holidays: readonly string[] = []): boolean {
  return firstContactDate < queueCutoff(today, workingDays, holidays);
}

/** Who may approve or reject a queued deal: someone who may review or edit deals, other than its owner and its creator. */
export function canPeerReview(viewer: { id: number; mayReview: boolean }, lead: { ownerId: number; createdById: number }): boolean {
  return viewer.mayReview && viewer.id !== lead.ownerId && viewer.id !== lead.createdById;
}

/** The setting's list key and its default, also in `numericListBounds`. */
export const queueWorkingDaysKey = "queue_working_days";
export const defaultQueueWorkingDays = 1;
