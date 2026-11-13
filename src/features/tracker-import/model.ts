/**
 * The sales-tracker import through the app (SPEC §10.9): an administrator uploads the Google Sheets export under
 * Administration → Tracker import (or sends it with `npm run remote -- import`), previews the result, then applies it.
 * The rules themselves live in scripts/lib/tracker-import.mjs, shared with the command line.
 */

export const defaultTrackerSheet = "LeadsDec25";
/** The export is about 5 MB; anything far beyond that is not the tracker. */
export const maxTrackerUploadBytes = 60 * 1024 * 1024;
export const maxOwnerMappings = 50;

export type TrackerImportMode = "preview" | "apply";

export type TrackerImportOptions = {
  mode: TrackerImportMode;
  sheetName: string;
  archiveSheetName: string | null;
  clientsSheetName: string | null;
  keepActionNames: boolean;
  force: boolean;
  /** The owner of leads whose rows name no Sales Manager: an account id or email; null = those companies go to the opportunity pool as cards. */
  defaultOwner: string | null;
  /** "Name=email" lines for the Sales Managers named in the sheet (added to the built-in map). */
  ownerLines: string[];
};

export type TrackerImportReport = {
  dryRun: boolean;
  fileName: string;
  fileHash: string;
  sheetName: string;
  finishedAt: string;
  seconds: number;
  actorEmail: string;
  /** Null when companies without a Sales Manager went to the opportunity pool. */
  defaultOwnerEmail: string | null;
  previousImportAt: string | null;
  counts: Record<string, number>;
  decisions: Record<string, number>;
  fieldChanges: Record<string, number>;
  createdUsers: string[];
  createdValues: string[];
  appEdited: string[];
  removedRows: string[];
  updatedLeads: string[];
  /** Companies with no Sales Manager placed in the opportunity pool (one line each). */
  pooled: string[];
  rejects: string[];
  skipped: string[];
  warnings: Record<string, string[]>;
  warningCount: number;
  /** The plain-text report, the same one the command line writes to import-report.txt. */
  text: string;
};

export type TrackerImportRun = { id: number; at: string; actorName: string | null; details: string; dryRun: boolean };

export type TrackerManager = { name: string; email: string; userId: number | null; userName: string | null; active: boolean; note: string | null };

export type TrackerImportStatus = {
  sheetName: string;
  /** The last applied (not previewed) import. */
  lastImport: TrackerImportRun | null;
  history: TrackerImportRun[];
  /** Timeline entries from an import before fingerprints existed; when > 0 the next run needs the baseline workbook once. */
  unstampedEntries: number;
  importedEntries: number;
  importedLeads: number;
  /** Companies from the sheet waiting in the opportunity pool (cards with a draft, status new). */
  pooledCards: number;
  managers: TrackerManager[];
};

const textField = (form: FormData, name: string, max = 120): string => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};
const flag = (form: FormData, name: string): boolean => ["1", "true", "on", "yes"].includes(textField(form, name).toLowerCase());

/** The options of an upload (multipart fields next to `file` and the optional `baseline`). */
export function parseTrackerImportOptions(form: FormData): TrackerImportOptions | { error: string } {
  const modeText = textField(form, "mode").toLowerCase() || "preview";
  if (modeText !== "preview" && modeText !== "apply") return { error: "mode must be preview or apply." };
  const sheetName = textField(form, "sheet") || defaultTrackerSheet;
  const defaultOwner = textField(form, "defaultOwner", 254).toLowerCase();
  if (defaultOwner && !/^\d+$/.test(defaultOwner) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultOwner)) return { error: "The default owner must be an account id or email." };
  const ownerLines = textField(form, "owners", 10_000).split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
  if (ownerLines.length > maxOwnerMappings) return { error: `At most ${maxOwnerMappings} Sales Manager mappings.` };
  return {
    mode: modeText, sheetName, archiveSheetName: textField(form, "archiveSheet") || null, clientsSheetName: textField(form, "clientsSheet") || null,
    keepActionNames: flag(form, "keepActionNames"), force: flag(form, "force"), defaultOwner: defaultOwner || null, ownerLines,
  };
}

/** The counts an administrator looks at first, in a fixed order; the rest of `counts` follows as it comes. */
export const headlineCounts = [
  "rows read from", "rows unchanged since the previous import", "rows not seen before (new or edited)", "deals created (new companies)", "deals updated",
  "companies with no Sales Manager placed in the leads inbox", "timeline entries added (new rows)", "timeline entries updated (edited rows)", "rows removed from the sheet (timeline entries kept)", "rows rejected",
];

export function orderedCounts(counts: Record<string, number>): [string, number][] {
  const entries = Object.entries(counts);
  const rank = (key: string) => { const index = headlineCounts.findIndex((prefix) => key.startsWith(prefix)); return index === -1 ? headlineCounts.length : index; };
  return entries.sort((a, b) => rank(a[0]) - rank(b[0]));
}
