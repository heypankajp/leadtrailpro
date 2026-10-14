import { getDatabasePool } from "@/lib/db";
import type { LeadRecordInput, StoredLead } from "./model";

const leadColumns = `
  name, company_url AS companyUrl, contact, contact_email AS contactEmail,
  contact_phone AS contactPhone, initials, color, status, action, follow_up AS followUp,
  owner, city, industry, last_activity AS lastActivity, lead_type AS type,
  DATE_FORMAT(first_contact, '%Y-%m-%d') AS firstContact, record_state AS recordState
`;

export async function listLeads(): Promise<StoredLead[]> {
  const [rows] = await getDatabasePool().query(`SELECT id, ${leadColumns} FROM leads ORDER BY id DESC`);
  return (rows as (LeadRecordInput & { id: number })[]).map((row) => ({
    ...toLeadResponse(row),
    id: Number(row.id),
  }));
}

export async function getLead(id: number): Promise<StoredLead | null> {
  const [rows] = await getDatabasePool().execute(`SELECT id, ${leadColumns} FROM leads WHERE id = ? LIMIT 1`, [id]);
  const row = (rows as (LeadRecordInput & { id: number })[])[0];
  return row ? { ...toLeadResponse(row), id: Number(row.id) } : null;
}

export async function createLead(lead: LeadRecordInput): Promise<StoredLead> {
  const [result] = await getDatabasePool().execute(
    `INSERT INTO leads (
      name, company_url, contact, contact_email, contact_phone, initials, color, status,
      action, follow_up, owner, city, industry, last_activity, lead_type, first_contact, record_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    leadValues(lead),
  );
  const id = Number((result as { insertId: number | bigint }).insertId);
  return { ...toLeadResponse(lead), id };
}

export async function updateLead(id: number, lead: LeadRecordInput): Promise<boolean> {
  const [result] = await getDatabasePool().execute(
    `UPDATE leads SET
      name = ?, company_url = ?, contact = ?, contact_email = ?, contact_phone = ?,
      initials = ?, color = ?, status = ?, action = ?, follow_up = ?, owner = ?,
      city = ?, industry = ?, last_activity = ?, lead_type = ?, first_contact = ?,
      record_state = ?
    WHERE id = ?`,
    [...leadValues(lead), id],
  );
  if ((result as { affectedRows: number }).affectedRows > 0) return true;
  const [rows] = await getDatabasePool().execute("SELECT id FROM leads WHERE id = ?", [id]);
  return (rows as { id: number }[]).length > 0;
}

export async function removeLead(id: number): Promise<boolean> {
  const [result] = await getDatabasePool().execute("DELETE FROM leads WHERE id = ?", [id]);
  return (result as { affectedRows: number }).affectedRows > 0;
}

export function leadValues(lead: LeadRecordInput) {
  return [
    lead.name,
    lead.companyUrl,
    lead.contact,
    lead.contactEmail,
    lead.contactPhone,
    lead.initials,
    lead.color,
    lead.status,
    lead.action,
    lead.followUp,
    lead.owner,
    lead.city,
    lead.industry,
    lead.lastActivity,
    lead.type,
    lead.firstContact,
    lead.recordState,
  ];
}

export function toLeadResponse(lead: LeadRecordInput) {
  return {
    ...lead,
    companyUrl: lead.companyUrl || undefined,
    contactEmail: lead.contactEmail || undefined,
    contactPhone: lead.contactPhone || undefined,
  };
}
