import ExcelJS from "exceljs";
import { fromSqlDateTime, getDatabasePool, type Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { getLead, listActivities } from "@/features/leads/repository";
import { getOpportunity } from "@/features/opportunities/repository";
import { listTasks } from "@/features/tasks/repository";

/**
 * "Export the data" (request of November 20, 2026): a deal's or a lead's details as an Excel workbook, from the banner of a
 * deleted deal (and the Restore Data page) before it is removed for good. Works for any deal or lead the viewer can open.
 */

/** Notes and comments are rich text: the cell gets the words, one paragraph per line. */
const stripHtml = (value: string) => value
  .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/\n{3,}/g, "\n\n").trim();
const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "export";
const when = (value: string | null | undefined) => (value ? value.replace("T", " ").replace(/\.\d+Z?$|Z$/, "").slice(0, 16) : "");

function sheetOf(workbook: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[], rows: Record<string, unknown>[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRows(rows);
  for (const column of sheet.columns) column.alignment = { vertical: "top", wrapText: true };
  return sheet;
}

function fieldsSheet(workbook: ExcelJS.Workbook, name: string, fields: [string, unknown][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [{ header: "Field", key: "field", width: 26 }, { header: "Value", key: "value", width: 70 }];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(fields.map(([field, value]) => ({ field, value: value === null || value === undefined ? "" : value })));
  sheet.getColumn("field").font = { bold: true };
  sheet.getColumn("value").alignment = { vertical: "top", wrapText: true };
  return sheet;
}

export async function dealWorkbook(id: number, db: Queryable = getDatabasePool()): Promise<{ fileName: string; type: string; bytes: Uint8Array<ArrayBuffer> }> {
  const lead = await getLead(id, db);
  if (!lead) throw new HttpError(404, "Deal not found.");
  const [activities, tasks, emails, files] = await Promise.all([
    listActivities(id, db),
    listTasks({ leadId: id, limit: 500 }, db).catch(() => []),
    db.query(
      `SELECT DISTINCT ON (gmail_message_id) direction, from_address AS "from", subject, received_at AS "at", mailbox FROM lead_emails WHERE lead_id = ? ORDER BY gmail_message_id, received_at DESC`,
      [id],
    ).then((result) => (result.rows as { direction: string; from: string; subject: string; at: string; mailbox: string }[]).sort((a, b) => String(b.at).localeCompare(String(a.at)))),
    db.query(`SELECT category, label, file_name AS "fileName", size_bytes AS size, created_at AS "createdAt" FROM lead_attachments WHERE lead_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [id])
      .then((result) => result.rows as { category: string; label: string | null; fileName: string; size: number; createdAt: string }[]),
  ]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LeadTrailPro";
  fieldsSheet(workbook, "Deal", [
    ["Deal", lead.clientName], ["Website", lead.companyUrl], ["Address", lead.address], ["City", lead.city],
    ["Contact", lead.clientExecutive], ["Phone", lead.contactPhone], ["Alternate phone", lead.contactAltPhone], ["Emails", lead.clientEmails.join(", ")], ["Contact remark", lead.contactRemark],
    ["Industry", lead.industry], ["Positions", lead.positions], ["Deal source", lead.leadType], ["Category", lead.leadCategory], ["Company size", lead.companySize],
    ["Stage", lead.stage], ["Status", lead.statusLabel], ["BD action", lead.bdAction], ["Client response", lead.clientResponse],
    ["Deal value", lead.dealValue], ["Expected close date", lead.expectedCloseDate], ["First contact", lead.firstContactDate], ["Follow-up", lead.followUpDate], ["Contract signed", lead.contractSignedDate],
    ["Owner", lead.ownerName], ["Created by", lead.createdByName], ["Created", when(lead.createdAt)], ["Last activity", when(lead.lastActivityAt)],
    ["State", lead.recordState === "deleted" ? "Deleted" : lead.recordState], ["Deleted", when(lead.deletedAt)], ["Comments", stripHtml(lead.comments ?? "")],
    ["Exported", when(new Date().toISOString())],
  ]);
  sheetOf(workbook, "Timeline", [
    { header: "When", key: "when", width: 18 }, { header: "Type", key: "type", width: 14 }, { header: "Summary", key: "summary", width: 50 }, { header: "Details", key: "body", width: 70 }, { header: "By", key: "by", width: 20 },
  ], activities.map((item) => ({ when: when(item.occurredAt), type: item.type, summary: stripHtml(item.summary), body: stripHtml(item.body ?? ""), by: item.userName })));
  sheetOf(workbook, "Tasks", [
    { header: "Task", key: "title", width: 40 }, { header: "Status", key: "status", width: 12 }, { header: "Due", key: "due", width: 18 }, { header: "Assigned to", key: "assignee", width: 22 }, { header: "Description", key: "description", width: 60 },
  ], tasks.map((task) => ({ title: task.title, status: task.status, due: when(task.dueAt), assignee: task.assigneeName, description: stripHtml(task.description ?? "") })));
  sheetOf(workbook, "Emails", [
    { header: "When", key: "when", width: 18 }, { header: "Direction", key: "direction", width: 12 }, { header: "From", key: "from", width: 34 }, { header: "Subject", key: "subject", width: 60 }, { header: "Mailbox", key: "mailbox", width: 30 },
  ], emails.map((email) => ({ when: when(fromSqlDateTime(email.at) ?? String(email.at)), direction: email.direction === "received" ? "From client" : "To client", from: email.from, subject: email.subject, mailbox: email.mailbox })));
  sheetOf(workbook, "Files", [
    { header: "File", key: "fileName", width: 44 }, { header: "Label", key: "label", width: 30 }, { header: "Category", key: "category", width: 14 }, { header: "Size (KB)", key: "size", width: 12 }, { header: "Added", key: "added", width: 18 },
  ], files.map((file) => ({ fileName: file.fileName, label: file.label ?? "", category: file.category, size: Math.round(Number(file.size) / 1024), added: when(fromSqlDateTime(file.createdAt) ?? String(file.createdAt)) })));
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return { fileName: `deal-${lead.id}-${slug(lead.clientName)}.xlsx`, type: xlsxType, bytes };
}

export async function leadWorkbook(id: number, db: Queryable = getDatabasePool()): Promise<{ fileName: string; type: string; bytes: Uint8Array<ArrayBuffer> }> {
  const card = await getOpportunity(id, db);
  if (!card) throw new HttpError(404, "Lead not found.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LeadTrailPro";
  fieldsSheet(workbook, "Lead", [
    ["Lead", card.companyName], ["Website", card.website], ["Location", card.location], ["Status", card.status === "not_relevant" ? "Not Relevant" : card.status === "new" ? "In the inbox" : card.status],
    ["Lead source", card.leadSource], ["BD action", card.bdAction], ["Client response", card.clientResponse], ["Contacts", card.contacts.map((contact) => contact.name).join(", ")],
    ["Latest role", card.latestTitle], ["Job listings", card.listingsCount], ["Added by", card.addedByName], ["First seen", when(card.firstSeenAt)], ["Last seen", when(card.lastSeenAt)],
    ["Not relevant reason", card.reason], ["Note", stripHtml(card.note)], ["Exported", when(new Date().toISOString())],
  ]);
  sheetOf(workbook, "Job listings", [
    { header: "Title", key: "title", width: 40 }, { header: "Location", key: "location", width: 24 }, { header: "Source", key: "source", width: 14 }, { header: "Posted", key: "posted", width: 12 }, { header: "Link", key: "url", width: 60 },
  ], card.listings.map((listing) => ({ title: listing.title, location: listing.location, source: listing.sourceLabel, posted: listing.postedAt ?? "", url: listing.url })));
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return { fileName: `lead-${card.id}-${slug(card.companyName)}.xlsx`, type: xlsxType, bytes };
}
