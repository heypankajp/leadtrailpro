/**
 * The stage reminder email (request of November 20, 2026): for each deal that stayed in its stage longer than set, a snapshot
 * of the deal (stage, status, value, contact, dates, next step) and its latest emails with the client. Pure: no app imports,
 * so the unit tests load it directly.
 */

export type ReminderDealSnapshot = {
  id: number; clientName: string; stage: string; status: string; daysInStage: number; reminder: string;
  contact: string; phone: string; emails: string[]; city: string; dealValue: number | null; ownerName: string;
  firstContactDate: string | null; lastActivityAt: string | null; lastActivity: string | null; followUpDate: string | null;
  nextTask: { title: string; dueAt: string | null } | null; link: string | null;
  clientEmails: { direction: "sent" | "received"; from: string; subject: string; at: string }[];
};

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (iso: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso.replace(" ", "T") + (iso.endsWith("Z") || iso.includes("+") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "America/Toronto" });
};
const money = (value: number | null) => (value === null ? "—" : `CA$${Math.round(value).toLocaleString("en-CA")}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Subject, plain text and HTML of one owner's reminder. `sample` marks a test message from List of Values. */
export function buildStageReminderEmail(ownerName: string, deals: ReminderDealSnapshot[], options: { sample?: boolean } = {}): { subject: string; text: string; html: string } {
  const prefix = options.sample ? "[Sample] " : "";
  const subject = deals.length === 1
    ? `${prefix}LeadTrailPro: ${deals[0].clientName} has been in ${deals[0].stage} for ${plural(deals[0].daysInStage, "day")}`
    : `${prefix}LeadTrailPro: ${deals.length} deals have been in their stage longer than set`;
  const intro = `Hi ${ownerName.split(" ")[0] || ownerName}, ${deals.length === 1 ? "this deal has" : "these deals have"} been in ${deals.length === 1 ? "its" : "their"} pipeline stage longer than the reminder set for the stage.`;

  const textBlocks = deals.map((deal) => [
    `${deal.clientName} — ${deal.stage} for ${plural(deal.daysInStage, "day")} (${deal.reminder})`,
    `  Status: ${deal.status} · Value: ${money(deal.dealValue)} · Owner: ${deal.ownerName}`,
    `  Contact: ${deal.contact || "No contact yet"}${deal.phone ? ` · ${deal.phone}` : ""}${deal.emails.length ? ` · ${deal.emails.join(", ")}` : ""}`,
    `  First contact: ${day(deal.firstContactDate)} · Last activity: ${day(deal.lastActivityAt)}${deal.lastActivity ? ` (${deal.lastActivity})` : ""}`,
    `  Next step: ${deal.nextTask ? `${deal.nextTask.title}${deal.nextTask.dueAt ? `, ${day(deal.nextTask.dueAt)}` : ""}` : deal.followUpDate ? `Follow-up ${day(deal.followUpDate)}` : "None"}`,
    deal.clientEmails.length
      ? `  Latest emails with the client:\n${deal.clientEmails.map((email) => `    ${day(email.at)} ${email.direction === "received" ? "from" : "to"} the client: ${email.subject || "(no subject)"}`).join("\n")}`
      : "  Latest emails with the client: none found in a connected mailbox",
    deal.link ? `  Open the deal: ${deal.link}` : "",
  ].filter(Boolean).join("\n"));
  const text = `${options.sample ? "This is a sample of the stage reminder email.\n\n" : ""}${intro}\n\n${textBlocks.join("\n\n")}\n\nThe reminders are set per stage in List of Values → Auto Reminder.`;

  const cell = "padding:4px 10px 4px 0;font-size:13px;color:#3d4359;vertical-align:top";
  const label = "padding:4px 12px 4px 0;font-size:12px;color:#8a90a6;white-space:nowrap;vertical-align:top";
  const cards = deals.map((deal) => {
    const rows: [string, string][] = [
      ["Stage", `${escape(deal.stage)} · <b>${plural(deal.daysInStage, "day")}</b> <span style="color:#8a90a6">(${escape(deal.reminder)})</span>`],
      ["Status", escape(deal.status)],
      ["Value", money(deal.dealValue)],
      ["Contact", `${escape(deal.contact || "No contact yet")}${deal.phone ? ` · ${escape(deal.phone)}` : ""}${deal.emails.length ? `<br>${deal.emails.map((email) => `<a href="mailto:${escape(email)}" style="color:#4a59c9">${escape(email)}</a>`).join(", ")}` : ""}`],
      ["City", escape(deal.city || "—")],
      ["First contact", day(deal.firstContactDate)],
      ["Last activity", `${day(deal.lastActivityAt)}${deal.lastActivity ? ` · ${escape(deal.lastActivity)}` : ""}`],
      ["Next step", deal.nextTask ? `${escape(deal.nextTask.title)}${deal.nextTask.dueAt ? ` · ${day(deal.nextTask.dueAt)}` : ""}` : deal.followUpDate ? `Follow-up ${day(deal.followUpDate)}` : `<span style="color:#b8402f">None</span>`],
      ["Owner", escape(deal.ownerName)],
    ];
    const emails = deal.clientEmails.length
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${deal.clientEmails.map((email) => `<tr><td style="${label}">${day(email.at)}</td><td style="${cell}"><span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;background:${email.direction === "received" ? "#e9f7ef;color:#1d7a4e" : "#eef0ff;color:#4a59c9"}">${email.direction === "received" ? "From client" : "To client"}</span> ${escape(email.subject || "(no subject)")}</td></tr>`).join("")}</table>`
      : `<p style="margin:0;font-size:13px;color:#8a90a6">No emails with the client found in a connected mailbox.</p>`;
    return `<div style="margin:0 0 16px;padding:16px 18px;border:1px solid #e3e6ef;border-radius:10px;background:#ffffff">
  <div style="font-size:16px;font-weight:700;color:#262b42;margin:0 0 8px">${deal.link ? `<a href="${escape(deal.link)}" style="color:#262b42;text-decoration:none">${escape(deal.clientName)}</a>` : escape(deal.clientName)}</div>
  <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 10px">${rows.map(([name, value]) => `<tr><td style="${label}">${name}</td><td style="${cell}">${value}</td></tr>`).join("")}</table>
  <div style="font-size:12px;font-weight:700;letter-spacing:.04em;color:#62697b;text-transform:uppercase;margin:6px 0 4px">Latest emails with the client</div>
  ${emails}
  ${deal.link ? `<p style="margin:12px 0 0"><a href="${escape(deal.link)}" style="display:inline-block;padding:8px 14px;border-radius:7px;background:#586be3;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600">Open the deal</a></p>` : ""}
</div>`;
  }).join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  ${options.sample ? `<p style="margin:0 0 12px;padding:8px 12px;border-radius:8px;background:#fff7e8;color:#906126;font-size:13px">This is a sample of the stage reminder email.</p>` : ""}
  <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#62697b;margin:0 0 6px">LEADTRAILPRO · STAGE REMINDER</div>
  <p style="margin:0 0 16px;font-size:14px;color:#3d4359;line-height:1.5">${escape(intro)}</p>
  ${cards}
  <p style="margin:8px 0 0;font-size:12px;color:#8a90a6">The reminders are set per stage in List of Values → Auto Reminder.</p>
</div></body></html>`;
  return { subject, text, html };
}
