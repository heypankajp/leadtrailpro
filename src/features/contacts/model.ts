// Contacts (People and Organizations) (SPEC §10.13, §10.14). Since migration 23 they
// are records of their own: an organization is a company, a person is a contact at one organization (or at none yet),
// and a deal belongs to one organization and at most one person. Pure rules only, so the unit tests load this file directly.

export type OrganizationRow = {
  id: number; name: string; city: string | null; industry: string | null; people: number; deals: number; openDeals: number;
  ownerName: string; lastActivityAt: string | null;
  /** The most recently active deal, or null when the organization has none yet. */
  dealId: number | null;
};

export type PersonRow = {
  id: number; name: string; organizationId: number | null; organization: string | null; email: string | null; phone: string | null;
  deals: number; openDeals: number; ownerName: string; lastActivityAt: string | null; dealId: number | null;
};

/**
 * `letterPages`: for each first letter that names in the list start with (A–Z, "#" for anything else), the page its first
 * name is on, for the A–Z index of Contacts and Organizations (request of November 18, 2026).
 */
export type ContactPage<Row> = { rows: Row[]; total: number; page: number; pageSize: number; letterPages?: Record<string, number> };

/**
 * Contact details compared for duplicates (request of November 18, 2026): an email address without case or outer
 * spaces; a phone number by its digits, the last ten of them (so "+1 (416) 555-0142" and "416-555-0142" are the same),
 * and only when it has at least seven digits (an extension alone is not a phone number).
 */
export const emailKey = (email: string) => email.trim().toLowerCase();
export function phoneKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/** The index letters, in order: A to Z, then "#" for names that start with anything else. */
export const indexLetters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
/** The index letter a name is filed under. */
export function indexLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}
export type ContactQuery = { q: string; page: number; pageSize: number };

export type OrganizationInput = { name: string; website: string; address: string; cityId: number | null; industry: string; companySizeId: number | null };
/** `organizationName` is what the person typed: an existing organization is linked, a new name creates one, empty means none. */
/** `createOrganization`: the user confirmed that a new organization of that name may be created (PD-15, PD-17). */
export type PersonInput = { name: string; organizationName: string; emails: string[]; phone: string; altPhone: string; remark: string; createOrganization?: boolean };

export type Organization = OrganizationInput & { id: number; city: string | null; companySize: string | null; ownerId: number; ownerName: string; createdAt: string | null; createdByName: string };
export type Person = Omit<PersonInput, "organizationName" | "createOrganization"> & { id: number; organizationId: number | null; organization: string | null; ownerId: number; ownerName: string; createdAt: string | null; createdByName: string };

/** A deal as it is listed on a contact's page. */
export type ContactDeal = {
  id: number; clientName: string; clientExecutive: string; status: string; statusCode: string; stage: string | null; ownerName: string;
  recordState: string; positions: string; lastActivityAt: string | null; createdAt: string | null;
};
/**
 * One entry of a contact's history: from one of its deals (`leadId` set) or written on the contact itself (SPEC §10.16).
 * `about` names the person when an organization's history shows an entry written on one of its people.
 */
export type ContactActivity = { id: number; source: "deal" | "contact"; leadId: number | null; type: string; summary: string; body: string | null; userName: string | null; occurredAt: string | null; about: string | null };

export const contactActivityTypes = ["note", "call", "email", "visit"] as const;
export type ContactActivityType = (typeof contactActivityTypes)[number];
export type ContactActivityInput = { type: ContactActivityType; summary: string; body: string; occurredAt: string | null };
/** `note` / `log`: may write a note, or log a call, an email or a visit, on the contact itself. */
export type ContactPermissions = { edit: boolean; remove: boolean; addDeal: boolean; note: boolean; log: boolean };
export type OrganizationDetail = { organization: Organization; people: PersonRow[]; deals: ContactDeal[]; activities: ContactActivity[]; permissions: ContactPermissions };
export type PersonDetail = { person: Person; deals: ContactDeal[]; activities: ContactActivity[]; permissions: ContactPermissions };

export const contactPageSize = 50;

/** How names are compared: without case and outer spaces. The same key is one organization, or one person inside an organization. */
export const contactKey = (name: string) => name.trim().toLowerCase();

/** Reads ?q=&page= from a request; anything odd falls back to the first page of everything. */
export function parseContactQuery(params: URLSearchParams): ContactQuery {
  const page = Number(params.get("page"));
  return { q: (params.get("q") ?? "").trim().slice(0, 200), page: Number.isInteger(page) && page > 0 ? page : 1, pageSize: contactPageSize };
}

/** "3 deals · 2 open": how a contact's deals are summed up in the lists. */
export function dealCountLabel(deals: number, openDeals: number): string {
  if (!deals) return "No deals yet";
  const total = `${deals} ${deals === 1 ? "deal" : "deals"}`;
  return openDeals === deals ? `${total} · ${deals === 1 ? "open" : "all open"}` : `${total} · ${openDeals} open`;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const optionalId = (value: unknown) => { const id = Number(value); return value !== null && value !== "" && Number.isSafeInteger(id) && id > 0 ? id : null; };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseOrganizationInput(value: unknown): { input: OrganizationInput; errors: string[] } {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const input: OrganizationInput = {
    name: text(body.name, 200), website: text(body.website, 2048), address: text(body.address, 500), cityId: optionalId(body.cityId), industry: text(body.industry, 120), companySizeId: optionalId(body.companySizeId),
  };
  const errors: string[] = [];
  if (!input.name) errors.push("Enter the company's name.");
  if (input.website && !/^https?:\/\/\S+$/i.test(input.website)) errors.push("The website must begin with http:// or https://.");
  return { input, errors };
}

export function parsePersonInput(value: unknown): { input: PersonInput; errors: string[] } {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawEmails = Array.isArray(body.emails) ? body.emails : typeof body.emails === "string" ? body.emails.split(/[,;\s]+/) : [];
  const emails = [...new Set(rawEmails.map((email) => text(email, 254).toLowerCase()).filter(Boolean))];
  const input: PersonInput = { name: text(body.name, 160), organizationName: text(body.organizationName, 200), emails, phone: text(body.phone, 40), altPhone: text(body.altPhone, 40), remark: text(body.remark, 500), createOrganization: body.createOrganization === true };
  const errors: string[] = [];
  if (!input.name) errors.push("Enter the contact's name.");
  // PD-17: a contact always belongs to an organization.
  if (!input.organizationName) errors.push("Choose the contact's company.");
  const bad = emails.filter((email) => !emailPattern.test(email));
  if (bad.length) errors.push(`Not an email address: ${bad.join(", ")}.`);
  if (emails.length > 10) errors.push("A contact can have up to 10 email addresses.");
  return { input, errors };
}

/** A note or a logged call, email or visit on a contact (SPEC §10.16): a note needs its text, the others a summary or a text. */
export function parseContactActivity(value: unknown): { input: ContactActivityInput; errors: string[] } {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const type = contactActivityTypes.find((item) => item === body.type) ?? null;
  const occurred = typeof body.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : null;
  const input: ContactActivityInput = {
    type: type ?? "note", summary: text(body.summary, 500), body: typeof body.body === "string" ? body.body.trim().slice(0, 10000) : "",
    occurredAt: occurred && !Number.isNaN(occurred.getTime()) ? occurred.toISOString() : null,
  };
  const errors: string[] = [];
  if (!type) errors.push("Choose what to record: a note, a call, an email or a visit.");
  else if (type === "note" && !input.body) errors.push("Write the note.");
  else if (type !== "note" && !input.summary && !input.body) errors.push("Enter a summary or notes.");
  if (occurred && Number.isNaN(occurred.getTime())) errors.push("The date and time are not valid.");
  if (occurred && occurred.getTime() > Date.now() + 5 * 60 * 1000) errors.push("The date and time cannot be in the future.");
  return { input, errors };
}

// ---- Contacts timeline (SPEC §10.17): who was contacted when, month by month ----

export const timelineMonthCount = 12;
export type TimelineCounts = Partial<Record<ContactActivityType, number>>;
export type TimelineRow = { id: number; name: string; organizationId: number | null; organization: string | null; months: Record<string, TimelineCounts>; lastContactAt: string | null };
export type ContactsTimeline = { months: string[]; rows: TimelineRow[]; total: number; page: number; pageSize: number };

/** The months shown, oldest first, ending with the month of `todayYmd`: ["2025-12", …, "2026-11"]. */
export function timelineMonths(todayYmd: string, count = timelineMonthCount): string[] {
  const [year, month] = todayYmd.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov", and "Jan 2026" where a year begins (and for the first column), so the row of months reads without repeating the year. */
export function timelineMonthLabel(month: string, first = false): string {
  const [year, index] = month.split("-").map(Number);
  return index === 1 || first ? `${monthNames[index - 1]} ${year}` : monthNames[index - 1];
}

const timelineWords: Record<ContactActivityType, [string, string]> = { call: ["call", "calls"], email: ["email", "emails"], visit: ["visit", "visits"], note: ["note", "notes"] };
/** What a month's cell says: the total, and "2 calls, 1 note" as its explanation. */
export function timelineCell(counts: TimelineCounts | undefined): { total: number; text: string } {
  const order: ContactActivityType[] = ["call", "email", "visit", "note"];
  const parts = order.map((type) => [type, counts?.[type] ?? 0] as const).filter(([, count]) => count > 0);
  return { total: parts.reduce((sum, [, count]) => sum + count, 0), text: parts.map(([type, count]) => `${count} ${timelineWords[type][count === 1 ? 0 : 1]}`).join(", ") };
}
