export const leadStatuses = ["Opportunity", "Cold Lead", "Warm Lead", "Hot Lead", "Client"] as const;
export const recordStates = ["active", "queued", "archived"] as const;

export type LeadStatus = (typeof leadStatuses)[number];
export type LeadRecordState = (typeof recordStates)[number];

export type LeadRecordInput = {
  name: string;
  companyUrl: string;
  contact: string;
  contactEmail: string;
  alternateEmail: string;
  contactPhone: string;
  initials: string;
  color: string;
  status: LeadStatus;
  action: string;
  followUp: string;
  owner: string;
  city: string;
  industry: string;
  lastActivity: string;
  type: string;
  firstContact: string;
  recordState: LeadRecordState;
};

export type StoredLead = Omit<LeadRecordInput, "companyUrl" | "contactEmail" | "alternateEmail" | "contactPhone"> & {
  id: number;
  companyUrl?: string;
  contactEmail?: string;
  alternateEmail?: string;
  contactPhone?: string;
};

export function parseLeadRecord(value: unknown): LeadRecordInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const stringFields = [
    "name", "companyUrl", "contact",     "contactEmail", "alternateEmail", "contactPhone", "initials", "color",
    "action", "followUp", "owner", "city", "industry", "lastActivity", "type", "firstContact",
  ] as const;

  if (stringFields.some((field) => body[field] !== undefined && typeof body[field] !== "string")) return null;
  if (typeof body.name !== "string" || !body.name.trim()) return null;
  if (typeof body.contact !== "string" || typeof body.initials !== "string" || typeof body.color !== "string") return null;
  if (typeof body.status !== "string" || !leadStatuses.includes(body.status as LeadStatus)) return null;
  if (typeof body.recordState !== "string" || !recordStates.includes(body.recordState as LeadRecordState)) return null;
  if (typeof body.action !== "string" || typeof body.followUp !== "string" || typeof body.owner !== "string") return null;
  if (typeof body.city !== "string" || typeof body.industry !== "string" || typeof body.lastActivity !== "string") return null;
  if (typeof body.type !== "string" || typeof body.firstContact !== "string") return null;

  const alternateEmail = typeof body.alternateEmail === "string" ? body.alternateEmail.trim() : "";
  if (alternateEmail && (alternateEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alternateEmail))) return null;

  return {
    name: body.name.trim(),
    companyUrl: typeof body.companyUrl === "string" ? body.companyUrl.trim() : "",
    contact: body.contact,
    contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : "",
    alternateEmail,
    contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : "",
    initials: body.initials,
    color: body.color,
    status: body.status as LeadStatus,
    action: body.action,
    followUp: body.followUp,
    owner: body.owner,
    city: body.city,
    industry: body.industry,
    lastActivity: body.lastActivity,
    type: body.type,
    firstContact: body.firstContact,
    recordState: body.recordState as LeadRecordState,
  };
}
