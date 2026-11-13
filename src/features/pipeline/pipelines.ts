import { getDatabasePool, insertId, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import type { UserAccount } from "@/features/users/model";
import type { Pipeline } from "./model";

// Several pipelines (PD-09, SPEC §10.18). A pipeline is a name and an order; its stages are the `stage` list values
// that carry its id. The default pipeline is the one from before and cannot be switched off.

type Row = { id: number; name: string; sortOrder: number; active: boolean; isDefault: boolean };
const select = `SELECT id, name, sort_order AS "sortOrder", is_active AS active, is_default AS "isDefault" FROM pipelines`;
const toPipeline = (row: Row): Pipeline => ({ id: Number(row.id), name: row.name, sortOrder: Number(row.sortOrder), active: Boolean(row.active), isDefault: Boolean(row.isDefault) });

export async function listPipelines(db: Queryable = getDatabasePool()): Promise<Pipeline[]> {
  const { rows } = await db.query(`${select} ORDER BY is_default DESC, sort_order, id`);
  return (rows as Row[]).map(toPipeline);
}

const cleanName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new HttpError(400, "Enter a pipeline name of 1 to 80 characters.");
  return trimmed;
};

/** A new pipeline starts with one stage, "New", so deals can be put in it at once; more stages are added under List of values. */
export async function createPipeline(name: string, actor: UserAccount): Promise<Pipeline> {
  const trimmed = cleanName(name);
  return withTransaction(async (connection) => {
    const clash = await connection.query("SELECT id FROM pipelines WHERE LOWER(name) = LOWER(?)", [trimmed]);
    if (clash.rows.length) throw new HttpError(409, "A pipeline with that name already exists.");
    const order = await connection.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM pipelines`);
    const id = insertId(await connection.query("INSERT INTO pipelines (name, sort_order) VALUES (?, ?) RETURNING id", [trimmed, Number(order.rows[0].next)]));
    const stageOrder = await connection.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM list_values WHERE list_key = 'stage'`);
    await connection.query("INSERT INTO list_values (list_key, code, value, sort_order, pipeline_id) VALUES ('stage', ?, 'New', ?, ?)", [`p${id}_new`, Number(stageOrder.rows[0].next), id]);
    await recordAudit(connection, { actorId: actor.id, action: "pipeline.created", entityType: "setting", entityId: id, after: { name: trimmed }, details: `${actor.name} added the pipeline ${trimmed}` });
    return toPipeline((await connection.query(`${select} WHERE id = ?`, [id])).rows[0] as Row);
  });
}

export async function updatePipeline(id: number, changes: { name?: string; active?: boolean }, actor: UserAccount): Promise<Pipeline> {
  return withTransaction(async (connection) => {
    const before = (await connection.query(`${select} WHERE id = ?`, [id])).rows[0] as Row | undefined;
    if (!before) throw new HttpError(404, "Pipeline not found.");
    if (changes.name !== undefined) {
      const trimmed = cleanName(changes.name);
      const clash = await connection.query("SELECT id FROM pipelines WHERE LOWER(name) = LOWER(?) AND id <> ?", [trimmed, id]);
      if (clash.rows.length) throw new HttpError(409, "A pipeline with that name already exists.");
      await connection.query("UPDATE pipelines SET name = ? WHERE id = ?", [trimmed, id]);
    }
    if (changes.active !== undefined && changes.active !== Boolean(before.active)) {
      if (before.isDefault && !changes.active) throw new HttpError(400, "The default pipeline cannot be switched off.");
      await connection.query("UPDATE pipelines SET is_active = ? WHERE id = ?", [changes.active, id]);
    }
    const after = toPipeline((await connection.query(`${select} WHERE id = ?`, [id])).rows[0] as Row);
    await recordAudit(connection, { actorId: actor.id, action: "pipeline.updated", entityType: "setting", entityId: id, before: { name: before.name, active: Boolean(before.active) }, after: { name: after.name, active: after.active }, details: `${actor.name} updated the pipeline ${after.name}` });
    return after;
  });
}
