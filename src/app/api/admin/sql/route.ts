import { NextResponse } from "next/server";
import { getDatabasePool, runStatement } from "@/lib/db";
import { handleRouteError, jsonError, readJsonBody, requireSameOrigin } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { adminSqlEnabled, adminSqlMaxRows, adminSqlSummary, adminSqlTimeoutMs, parseAdminSql } from "@/features/admin/sql-model";
import { requirePrivilege, requireUser } from "@/features/users/session";

/**
 * Data corrections (SPEC §6.16): `{ sql, apply? }` from an administrator. The statement runs as the app's database
 * role (rows only, no table changes) inside a transaction that is rolled back unless `apply` is true, so the first
 * call shows what would change. Every call, preview or applied or refused by PostgreSQL, is written to the audit log.
 */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to run data corrections.");
    if (!adminSqlEnabled(process.env.ADMIN_SQL)) return jsonError(403, "Data corrections through the API are switched off on this server (ADMIN_SQL=off).");
    const input = parseAdminSql(await readJsonBody(request));
    if ("error" in input) return jsonError(400, input.error);
    const db = getDatabasePool();
    const mode = input.apply ? "applied" : "preview, rolled back";
    try {
      const result = await runStatement(input.sql, { commit: input.apply, timeoutMs: adminSqlTimeoutMs });
      await recordAudit(db, {
        actorId: user.id, action: input.apply ? "admin.sql.applied" : "admin.sql.preview", entityType: "setting",
        after: { sql: input.sql, command: result.command, rowCount: result.rowCount, applied: input.apply },
        details: `${user.name} ran a data correction (${mode}; ${result.command} ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}): ${adminSqlSummary(input.sql)}`,
      });
      return NextResponse.json({ applied: input.apply, command: result.command, rowCount: result.rowCount, fields: result.fields, rows: result.rows.slice(0, adminSqlMaxRows), truncated: result.rows.length > adminSqlMaxRows });
    } catch (error) {
      // A statement PostgreSQL refuses (SQLSTATE) is the caller's to fix: say what it said. Anything else is the usual 503.
      const code = (error as { code?: unknown }).code;
      if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) throw error;
      const message = error instanceof Error ? error.message : "The statement failed.";
      await recordAudit(db, {
        actorId: user.id, action: "admin.sql.failed", entityType: "setting", after: { sql: input.sql, code, message, applied: false },
        details: `${user.name}'s data correction failed (${code} ${message.slice(0, 120)}): ${adminSqlSummary(input.sql, 240)}`,
      });
      return NextResponse.json({ error: message, code, applied: false }, { status: 400 });
    }
  } catch (error) {
    return handleRouteError(error, "Run data correction");
  }
}
