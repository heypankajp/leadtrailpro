import { getDatabasePool, insertId, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { entryStageCode, fixedListKeys, isListKey, listKeys, slugify, statusCodes } from "./model";
import type { ListKey, ListValue, ListValuesByKey } from "./model";

type Row = { id: number; listKey: string; code: string; value: string; sortOrder: number; active: number | boolean; stageId: number | null; pipelineId?: number | null };

const toListValue = (row: Row): ListValue => ({
  id: Number(row.id),
  listKey: row.listKey as ListKey,
  code: row.code,
  value: row.value,
  sortOrder: Number(row.sortOrder),
  active: Boolean(row.active),
  stageId: row.stageId === null || row.stageId === undefined ? null : Number(row.stageId),
  pipelineId: row.pipelineId === null || row.pipelineId === undefined ? null : Number(row.pipelineId),
});

export async function listValues(options: { includeInactive?: boolean } = {}, db: Queryable = getDatabasePool()): Promise<ListValuesByKey> {
  const { rows } = await db.query(
    `SELECT id, list_key AS "listKey", code, value, sort_order AS "sortOrder", is_active AS active, stage_id AS "stageId", pipeline_id AS "pipelineId" FROM list_values
     ${options.includeInactive ? "" : "WHERE is_active = TRUE"} ORDER BY list_key, sort_order, value`,
  );
  const grouped = Object.fromEntries(listKeys.map((key) => [key, [] as ListValue[]])) as ListValuesByKey;
  for (const row of rows as Row[]) {
    if (isListKey(row.listKey)) grouped[row.listKey].push(toListValue(row));
  }
  return grouped;
}

export async function getListValue(id: number, db: Queryable = getDatabasePool()): Promise<ListValue | null> {
  const { rows } = await db.query(`SELECT id, list_key AS "listKey", code, value, sort_order AS "sortOrder", is_active AS active, stage_id AS "stageId", pipeline_id AS "pipelineId" FROM list_values WHERE id = ?`, [id]);
  const row = (rows as Row[])[0];
  return row ? toListValue(row) : null;
}

/** Validates that an id belongs to the expected list and is active (inactive values stay valid on existing records). */
export async function assertListValue(db: Queryable, listKey: ListKey, id: number | null, options: { required?: boolean; allowInactive?: boolean; label: string }): Promise<void> {
  if (id === null) {
    if (options.required) throw new HttpError(400, `${options.label} is required.`);
    return;
  }
  const value = await getListValue(id, db);
  if (!value || value.listKey !== listKey) throw new HttpError(400, `${options.label} is not a valid ${listKey.replace("_", " ")} value.`);
  if (!value.active && !options.allowInactive) throw new HttpError(400, `${options.label} "${value.value}" is no longer active.`);
}

/** `pipelineId` (stages only, PD-09): the pipeline the new stage joins; the default pipeline when left out. */
export async function createListValue(listKey: ListKey, value: string, actorId: number, pipelineId: number | null = null): Promise<ListValue> {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) throw new HttpError(400, "Enter a value between 1 and 120 characters.");
  if (fixedListKeys.includes(listKey)) throw new HttpError(400, "This list is fixed by the requirement: its values can be renamed but not added to.");
  return withTransaction(async (connection) => {
    const { rows: maxRows } = await connection.query(`SELECT COALESCE(MAX(sort_order), 0) AS "maxOrder" FROM list_values WHERE list_key = ?`, [listKey]);
    const sortOrder = Number((maxRows as { maxOrder: number }[])[0].maxOrder) + 1;
    let code = slugify(trimmed);
    const { rows: codeRows } = await connection.query("SELECT COUNT(*) AS count FROM list_values WHERE list_key = ? AND code = ?", [listKey, code]);
    if (Number((codeRows as { count: number }[])[0].count) > 0) code = `${code}_${Date.now().toString(36)}`.slice(0, 60);
    let stagePipeline: number | null = null;
    if (listKey === "stage") {
      const found = await connection.query(pipelineId ? "SELECT id FROM pipelines WHERE id = ?" : "SELECT id FROM pipelines WHERE is_default ORDER BY id LIMIT 1", pipelineId ? [pipelineId] : []);
      if (!found.rows.length) throw new HttpError(400, "Choose the pipeline the stage belongs to.");
      stagePipeline = Number(found.rows[0].id);
    }
    const result = await connection.query(
      "INSERT INTO list_values (list_key, code, value, sort_order, pipeline_id) VALUES (?, ?, ?, ?, ?) RETURNING id", [listKey, code, trimmed, sortOrder, stagePipeline],
    );
    const created = (await getListValue(insertId(result), connection))!;
    await recordAudit(connection, {
      actorId, action: "list_value.created", entityType: "list_value", entityId: created.id,
      after: { listKey, value: trimmed, code }, details: `Added "${trimmed}" to ${listKey}`,
    });
    return created;
  });
}

export async function updateListValue(id: number, changes: { value?: string; active?: boolean; sortOrder?: number; stageId?: number | null }, actorId: number): Promise<ListValue> {
  return withTransaction(async (connection) => {
    const existing = await getListValue(id, connection);
    if (!existing) throw new HttpError(404, "List value not found.");
    const assignments: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (changes.value !== undefined) {
      const trimmed = changes.value.trim();
      if (!trimmed || trimmed.length > 120) throw new HttpError(400, "Enter a value between 1 and 120 characters.");
      if (trimmed !== existing.value) {
        assignments.push("value = ?"); params.push(trimmed); before.value = existing.value; after.value = trimmed;
      }
    }
    if (changes.active !== undefined && changes.active !== existing.active) {
      if (!changes.active && existing.listKey === "status" && statusCodes.includes(existing.code as (typeof statusCodes)[number])) {
        throw new HttpError(400, "The core statuses (Cold, Warm, Hot, Client, Lost, Disqualified) cannot be deactivated. Rename them instead.");
      }
      if (!changes.active && fixedListKeys.includes(existing.listKey)) {
        throw new HttpError(400, "These values are fixed by the requirement and cannot be deactivated. Rename them instead.");
      }
      if (!changes.active && existing.listKey === "stage" && existing.code === entryStageCode) {
        throw new HttpError(400, "New Deal is the entry stage of the pipeline and cannot be deactivated. Rename it instead.");
      }
      assignments.push("is_active = ?"); params.push(changes.active); before.active = existing.active; after.active = changes.active;
    }
    if (changes.sortOrder !== undefined && changes.sortOrder !== existing.sortOrder) {
      assignments.push("sort_order = ?"); params.push(changes.sortOrder); before.sortOrder = existing.sortOrder; after.sortOrder = changes.sortOrder;
    }
    if (changes.stageId !== undefined && changes.stageId !== existing.stageId) {
      // PIPE-03: only BD actions carry a stage; the stage must exist and be active.
      if (existing.listKey !== "bd_action") throw new HttpError(400, "Only BD actions are mapped to a pipeline stage.");
      if (changes.stageId !== null) await assertListValue(connection, "stage", changes.stageId, { label: "Stage" });
      assignments.push("stage_id = ?"); params.push(changes.stageId); before.stageId = existing.stageId; after.stageId = changes.stageId;
    }
    if (assignments.length) {
      params.push(id);
      await connection.query(`UPDATE list_values SET ${assignments.join(", ")} WHERE id = ?`, params);
      await recordAudit(connection, {
        actorId, action: after.value !== undefined ? "list_value.renamed" : "list_value.updated", entityType: "list_value", entityId: id,
        before, after,
        details: after.value !== undefined
          ? `Renamed ${existing.listKey} value "${existing.value}" to "${after.value}" (existing records now display the new value)`
          : `Updated ${existing.listKey} value "${existing.value}"`,
      });
    }
    return (await getListValue(id, connection))!;
  });
}

export async function reorderListValues(listKey: ListKey, orderedIds: number[], actorId: number): Promise<void> {
  await withTransaction(async (connection) => {
    for (const [index, id] of orderedIds.entries()) {
      await connection.query("UPDATE list_values SET sort_order = ? WHERE id = ? AND list_key = ?", [index + 1, id, listKey]);
    }
    await recordAudit(connection, { actorId, action: "list_value.reordered", entityType: "list_value", details: `Reordered ${listKey} values`, after: { orderedIds } });
  });
}
