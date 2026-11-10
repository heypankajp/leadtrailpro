import { getDatabasePool, fromSqlDateTime, withTransaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { UserAccount } from "@/features/users/model";
import { TrackerImportError, defaultOwnerMap, ownerNotes, parseOwnerMappings, runTrackerImport } from "../../../scripts/lib/tracker-import.mjs";
import type { TrackerImportOptions, TrackerImportReport, TrackerImportRun, TrackerImportStatus, TrackerManager } from "./model";

type RunRow = { id: number; at: string; actorName: string | null; details: string | null };
const toRun = (row: RunRow): TrackerImportRun => ({ id: Number(row.id), at: fromSqlDateTime(row.at) ?? row.at, actorName: row.actorName || null, details: row.details ?? "", dryRun: /, dry run\)/.test(row.details ?? "") });

/** What the Tracker import page shows before an upload: previous runs, whether a baseline is needed, the Sales Manager accounts. */
export async function trackerImportStatus(sheetName: string): Promise<TrackerImportStatus> {
  const db = getDatabasePool();
  const { rows: runs } = await db.query(
    `SELECT a.id, a.created_at AS at, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS "actorName", a.details
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.action = 'import.tracker' ORDER BY a.id DESC LIMIT 12`,
  );
  const history = (runs as RunRow[]).map(toRun);
  const { rows: [entries] } = await db.query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE meta->>'fingerprint' IS NULL) AS unstamped, COUNT(DISTINCT lead_id) AS leads
     FROM lead_activities WHERE activity_type <> 'created' AND meta->>'imported' = 'true' AND meta->>'sheet' = ?`,
    [sheetName],
  );
  const emails = Object.values(defaultOwnerMap);
  const { rows: accounts } = await db.query(
    `SELECT LOWER(email) AS email, id, TRIM(first_name || ' ' || last_name) AS name, is_active AS active FROM users WHERE LOWER(email) = ANY(?::text[])`,
    [emails],
  );
  const byEmail = new Map((accounts as { email: string; id: number; name: string; active: boolean }[]).map((row) => [row.email, row]));
  const managers: TrackerManager[] = Object.entries(defaultOwnerMap).map(([name, email]) => {
    const account = byEmail.get(email);
    return { name: name.charAt(0).toUpperCase() + name.slice(1), email, userId: account ? Number(account.id) : null, userName: account?.name ?? null, active: Boolean(account?.active), note: (ownerNotes as Record<string, string>)[name] ?? null };
  });
  return {
    sheetName,
    lastImport: history.find((run) => !run.dryRun) ?? null,
    history,
    unstampedEntries: Number(entries?.unstamped ?? 0),
    importedEntries: Number(entries?.total ?? 0),
    importedLeads: Number(entries?.leads ?? 0),
    managers,
  };
}

class RollbackAfterPreview extends Error {}

let running = false;

/**
 * Runs the shared import inside one transaction. A preview is the full run rolled back, so its report is exact; an apply
 * commits and refreshes the planner statistics. Refusals from the import (wrong sheet, baseline needed, same file again)
 * become 400 or 409 responses with the import's own message.
 */
export async function runUploadedTrackerImport(input: { fileBytes: Buffer; fileName: string; baselineBytes: Buffer | null; baselineName: string | null; options: TrackerImportOptions }, actor: UserAccount): Promise<TrackerImportReport> {
  const owners = parseOwnerMappings(input.options.ownerLines);
  if (owners.errors.length) throw new HttpError(400, `Sales Manager mappings must be Name=email: ${owners.errors.join("; ")}`);
  let defaultOwnerEmail = input.options.defaultOwner;
  if (defaultOwnerEmail && /^\d+$/.test(defaultOwnerEmail)) {
    const { rows } = await getDatabasePool().query("SELECT email FROM users WHERE id = ? AND is_active = TRUE AND role <> 'recruiter'", [Number(defaultOwnerEmail)]);
    defaultOwnerEmail = (rows as { email: string }[])[0]?.email ?? null;
    if (!defaultOwnerEmail) throw new HttpError(400, "The default owner must be an active Sales Manager or administrator.");
  }
  if (running) throw new HttpError(409, "An import is running already; wait for it to finish.");
  running = true;
  const dryRun = input.options.mode === "preview";
  let report: TrackerImportReport | null = null;
  try {
    await withTransaction(async (db) => {
      report = (await runTrackerImport({
        query: (sql: string, params?: unknown[]) => db.query(sql, params),
        fileBytes: input.fileBytes, fileName: input.fileName, dryRun, force: input.options.force, keepActionNames: input.options.keepActionNames,
        sheetName: input.options.sheetName, archiveSheetName: input.options.archiveSheetName, clientsSheetName: input.options.clientsSheetName,
        baselineBytes: input.baselineBytes, baselineName: input.baselineName ?? "baseline workbook", actorId: actor.id, defaultOwnerEmail,
        ownerMap: owners.map, log: (line: string) => console.log(`[tracker import] ${line}`),
      })) as TrackerImportReport;
      if (dryRun) throw new RollbackAfterPreview();
    });
    if (!dryRun) await getDatabasePool().query("ANALYZE leads, lead_activities, audit_log, list_values, users");
  } catch (error) {
    if (error instanceof RollbackAfterPreview) { /* the preview's transaction was rolled back, as intended */ }
    else if (error instanceof TrackerImportError) throw new HttpError(error.code === "already_imported" ? 409 : 400, error.message, { code: error.code, ...error.details });
    else throw error;
  } finally {
    running = false;
  }
  if (!report) throw new Error("The import produced no report.");
  return report;
}
