import { getDatabasePool, insertId, withTransaction, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { recordAudit, diffRecords } from "@/features/audit/repository";
import type { TargetTemplate, TargetTemplateInput } from "./model";

type Row = { id: number; name: string; stage: string; dailyLeads: number; weeklyLeads: number; dailyVisits: number; weeklyVisits: number; monthlyConversions: number };

const columns = `id, name, stage, daily_leads AS "dailyLeads", weekly_leads AS "weeklyLeads", daily_visits AS "dailyVisits", weekly_visits AS "weeklyVisits", monthly_conversions AS "monthlyConversions"`;

const toTemplate = (row: Row): TargetTemplate => ({
  id: Number(row.id),
  name: row.name,
  stage: (row.stage === "training" || row.stage === "full_productive") ? row.stage : "onboarding",
  dailyLeads: Number(row.dailyLeads),
  weeklyLeads: Number(row.weeklyLeads),
  dailyVisits: Number(row.dailyVisits),
  weeklyVisits: Number(row.weeklyVisits),
  monthlyConversions: Number(row.monthlyConversions),
});

export async function listTargetTemplates(db: Queryable = getDatabasePool()): Promise<TargetTemplate[]> {
  const { rows } = await db.query(`SELECT ${columns} FROM target_templates ORDER BY CASE stage WHEN 'onboarding' THEN 1 WHEN 'training' THEN 2 ELSE 3 END, name`);
  return (rows as Row[]).map(toTemplate);
}

export async function getTargetTemplate(id: number, db: Queryable = getDatabasePool()): Promise<TargetTemplate | null> {
  const { rows } = await db.query(`SELECT ${columns} FROM target_templates WHERE id = ?`, [id]);
  const row = (rows as Row[])[0];
  return row ? toTemplate(row) : null;
}

/** The template that applies to a user: an explicit assignment, otherwise the first template for the user's stage. */
export async function resolveTargetTemplate(user: { targetTemplateId: number | null; stage: string }, db: Queryable = getDatabasePool()): Promise<TargetTemplate | null> {
  if (user.targetTemplateId) {
    const assigned = await getTargetTemplate(user.targetTemplateId, db);
    if (assigned) return assigned;
  }
  const { rows } = await db.query(`SELECT ${columns} FROM target_templates WHERE stage = ? ORDER BY id LIMIT 1`, [user.stage]);
  const row = (rows as Row[])[0];
  return row ? toTemplate(row) : null;
}

export async function createTargetTemplate(input: TargetTemplateInput, actorId: number): Promise<TargetTemplate> {
  return withTransaction(async (connection) => {
    const result = await connection.query(
      `INSERT INTO target_templates (name, stage, daily_leads, weekly_leads, daily_visits, weekly_visits, monthly_conversions) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [input.name, input.stage, input.dailyLeads, input.weeklyLeads, input.dailyVisits, input.weeklyVisits, input.monthlyConversions],
    );
    const created = (await getTargetTemplate(insertId(result), connection))!;
    await recordAudit(connection, { actorId, action: "target_template.created", entityType: "target_template", entityId: created.id, after: { ...created }, details: `Created target template "${created.name}"` });
    return created;
  });
}

export async function updateTargetTemplate(id: number, input: Partial<TargetTemplateInput>, actorId: number): Promise<TargetTemplate> {
  return withTransaction(async (connection) => {
    const existing = await getTargetTemplate(id, connection);
    if (!existing) throw new HttpError(404, "Target template not found.");
    const next = { ...existing, ...input };
    await connection.query(
      `UPDATE target_templates SET name = ?, stage = ?, daily_leads = ?, weekly_leads = ?, daily_visits = ?, weekly_visits = ?, monthly_conversions = ? WHERE id = ?`,
      [next.name, next.stage, next.dailyLeads, next.weeklyLeads, next.dailyVisits, next.weeklyVisits, next.monthlyConversions, id],
    );
    const diff = diffRecords({ ...existing }, { ...next });
    if (diff.changed.length) {
      await recordAudit(connection, { actorId, action: "target_template.updated", entityType: "target_template", entityId: id, before: diff.before, after: diff.after, details: `Updated target template "${next.name}"` });
    }
    return (await getTargetTemplate(id, connection))!;
  });
}

export async function assignTargetTemplate(templateId: number, userIds: number[], actorId: number): Promise<void> {
  await withTransaction(async (connection) => {
    const template = await getTargetTemplate(templateId, connection);
    if (!template) throw new HttpError(404, "Target template not found.");
    for (const userId of userIds) {
      await connection.query("UPDATE users SET target_template_id = ? WHERE id = ?", [templateId, userId]);
      await recordAudit(connection, { actorId, action: "user.target_assigned", entityType: "user", entityId: userId, after: { targetTemplateId: templateId }, details: `Assigned target template "${template.name}"` });
    }
  });
}
