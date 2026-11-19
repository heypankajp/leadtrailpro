import { getDatabasePool, toSqlDateTime, withTransaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit } from "@/features/audit/repository";
import { listStages } from "@/features/leads/repository";
import { createListValue, getListValue, reorderListValues, updateListValue } from "@/features/list-values/repository";
import type { ListValue } from "@/features/list-values/model";
import { getSettings } from "@/features/settings/repository";
import type { UserAccount } from "@/features/users/model";
import { moveStageOrder, stageDeleteProblem } from "./model";

// Editing a pipeline's stages from the board (PD-21, SPEC §10.19): Sales Managers and Admins (`manage_stages`) rename,
// add, reorder and delete stages. The stages are `stage` list values, so List of values → Pipeline stage shows the same.

async function stageOrThrow(id: number): Promise<ListValue> {
  const stage = await getListValue(id);
  if (!stage || stage.listKey !== "stage") throw new HttpError(404, "Stage not found.");
  return stage;
}

/** A new stage at the end of the pipeline (the default one when none is named). */
export async function addStage(name: string, pipelineId: number | null, actor: UserAccount): Promise<ListValue> {
  try {
    return await createListValue("stage", name, actor.id, pipelineId);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, `This pipeline already has a stage called ${name.trim()}.`);
    throw error;
  }
}

export async function renameStage(id: number, name: string, actor: UserAccount): Promise<ListValue> {
  await stageOrThrow(id);
  try {
    return await updateListValue(id, { value: name }, actor.id);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, `This pipeline already has a stage called ${name.trim()}.`);
    throw error;
  }
}

/** One place left or right among the stages of its own pipeline. */
export async function moveStage(id: number, direction: "left" | "right", actor: UserAccount): Promise<void> {
  const stage = await stageOrThrow(id);
  const stages = await listStages(undefined, stage.pipelineId ?? "default");
  const ordered = moveStageOrder(stages.map((item) => item.id), id, direction);
  await reorderListValues("stage", ordered, actor.id);
}

/** The deals in a stage, by state (all of them block deleting the stage until they are moved). */
export type StageDealCounts = { active: number; queued: number; archived: number; total: number };

export async function stageDealCounts(id: number): Promise<{ stage: { id: number; value: string }; deals: StageDealCounts }> {
  const stage = await stageOrThrow(id);
  const { rows } = await getDatabasePool().query(
    `SELECT COUNT(*) FILTER (WHERE record_state = 'active')::int AS active, COUNT(*) FILTER (WHERE record_state = 'queued')::int AS queued,
       COUNT(*) FILTER (WHERE record_state = 'archived')::int AS archived, COUNT(*)::int AS total
     FROM leads WHERE stage_id = ?`,
    [id],
  );
  const row = (rows as StageDealCounts[])[0];
  return { stage: { id: stage.id, value: stage.value }, deals: { active: Number(row.active), queued: Number(row.queued), archived: Number(row.archived), total: Number(row.total) } };
}

/**
 * Deletes a stage. Its deals (archived ones too) move to `moveTo` with a timeline entry each, the BD actions mapped to it
 * point to `moveTo`, its needs-attention rules and next-step suggestion go, and the stage itself is removed. Older
 * timeline entries keep the stage name they were written with.
 */
export async function deleteStage(id: number, moveTo: number | null, actor: UserAccount): Promise<{ moved: number }> {
  const stage = await stageOrThrow(id);
  return withTransaction(async (connection) => {
    const stages = await listStages(connection, stage.pipelineId ?? "default");
    const counted = await connection.query("SELECT COUNT(*)::int AS count FROM leads WHERE stage_id = ?", [id]);
    const dealCount = Number(counted.rows[0]?.count ?? 0);
    const problem = stageDeleteProblem(stages, id, moveTo, dealCount);
    if (problem) throw new HttpError(problem === "Stage not found." ? 404 : 400, problem);
    const target = moveTo ? stages.find((item) => item.id === moveTo) ?? null : null;
    const now = new Date();
    if (target && dealCount) {
      // One timeline entry per deal, written as the move itself; the deal's last activity is not touched (nobody worked on it).
      await connection.query(
        `INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, value_code, meta, occurred_at, created_at)
         SELECT l.id, ?, 'stage_change', ?, ?, ?::jsonb, ?, ? FROM leads l WHERE l.stage_id = ?`,
        [actor.id, `Stage changed from ${stage.value} to ${target.value} (stage ${stage.value} deleted)`.slice(0, 500), target.code,
          JSON.stringify({ fromStageId: id, toStageId: target.id, fromCode: stage.code, toCode: target.code, via: "stage_deleted" }), toSqlDateTime(now), toSqlDateTime(now), id],
      );
      await connection.query("UPDATE leads SET stage_id = ? WHERE stage_id = ?", [target.id, id]);
    }
    await connection.query("UPDATE list_values SET stage_id = ? WHERE list_key = 'bd_action' AND stage_id = ?", [target?.id ?? null, id]);
    const settings = await getSettings(connection);
    const rules = settings.reminders.rules.filter((rule) => (rule.stageId ?? null) !== id);
    if (rules.length !== settings.reminders.rules.length) {
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('reminders', ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json",
        [JSON.stringify({ ...settings.reminders, rules })],
      );
    }
    if (settings.pipeline.followUps[stage.code]) {
      const followUps = { ...settings.pipeline.followUps };
      delete followUps[stage.code];
      await connection.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ('pipeline', ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json",
        [JSON.stringify({ ...settings.pipeline, followUps })],
      );
    }
    await connection.query("DELETE FROM list_values WHERE id = ?", [id]);
    await recordAudit(connection, {
      actorId: actor.id, action: "list_value.deleted", entityType: "list_value", entityId: id, before: { listKey: "stage", value: stage.value, code: stage.code },
      after: target ? { movedTo: target.value, deals: dealCount } : null,
      details: `${actor.name} deleted the stage ${stage.value}${target && dealCount ? ` and moved its ${dealCount === 1 ? "deal" : `${dealCount} deals`} to ${target.value}` : ""}`,
    }, now);
    return { moved: target ? dealCount : 0 };
  });
}
