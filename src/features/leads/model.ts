import { isValidYmd } from "@/lib/dates";

export const recordStates = ["active", "queued", "archived"] as const;
export type LeadRecordState = (typeof recordStates)[number];

export function isRecordState(value: unknown): value is LeadRecordState {
  return typeof value === "string" && recordStates.includes(value as LeadRecordState);
}

/** Fields a user supplies when creating or editing a lead (BRD section 6). */
export type LeadInput = {
  clientName: string;
  companyUrl: string;
  address: string;
  comments: string;
  clientExecutive: string;
  contactPhone: string;
  contactAltPhone: string;
  contactRemark: string;
  clientEmails: string[];
  industry: string;
  positions: string;
  leadTypeId: number;
  statusId: number;
  statusReasonId: number | null;
  bdActionId: number | null;
  clientResponseId: number | null;
  leadCategoryId: number | null;
  companySizeId: number | null;
  cityId: number | null;
  firstContactDate: string;
  followUpDate: string | null;
  contractSignedDate: string | null;
};

export type LeadSummary = LeadInput & {
  id: number;
  ownerId: number;
  ownerName: string;
  createdById: number;
  createdByName: string;
  leadType: string;
  status: string;
  statusCode: string;
  statusReason: string | null;
  /** "Status – Reason" for closed statuses, otherwise the status (LEAD-06). */
  statusLabel: string;
  bdAction: string | null;
  clientResponse: string | null;
  leadCategory: string | null;
  companySize: string | null;
  city: string | null;
  recordState: LeadRecordState;
  stateReason: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadPage = { leads: LeadSummary[]; total: number; page: number; pageSize: number };

export const activityTypes = [
  "created", "call", "email", "visit", "note", "status_change", "bd_action", "client_response", "follow_up",
  "transfer", "state_change", "task", "file", "edit",
] as const;
export type ActivityType = (typeof activityTypes)[number];

/** Activity types a user records explicitly from the lead timeline. */
export const loggableActivityTypes = ["call", "email", "visit", "note"] as const;
export type LoggableActivityType = (typeof loggableActivityTypes)[number];

export const activityLabels: Record<ActivityType, string> = {
  created: "Lead created",
  call: "Call",
  email: "Email",
  visit: "Visit",
  note: "Note",
  status_change: "Status changed",
  bd_action: "BD action",
  client_response: "Client response",
  follow_up: "Follow-up date",
  transfer: "Ownership transfer",
  state_change: "Record state",
  task: "Task",
  file: "File",
  edit: "Details updated",
};

export type LeadActivity = {
  id: number;
  leadId: number;
  userId: number;
  userName: string;
  type: ActivityType;
  summary: string;
  body: string | null;
  valueCode: string | null;
  meta: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
};

export const leadSortKeys = ["last_activity", "first_contact", "follow_up", "client_name", "owner", "created"] as const;
export type LeadSortKey = (typeof leadSortKeys)[number];

export type LeadFilters = {
  state: LeadRecordState;
  q: string;
  mine: boolean;
  statusCode: string | null;
  statusId: number | null;
  statusReasonId: number | null;
  leadTypeId: number | null;
  leadCategoryId: number | null;
  companySizeId: number | null;
  cityId: number | null;
  ownerId: number | null;
  clientResponseId: number | null;
  bdActionId: number | null;
  firstContactFrom: string | null;
  firstContactTo: string | null;
  followUpFrom: string | null;
  followUpTo: string | null;
  contractSignedFrom: string | null;
  contractSignedTo: string | null;
  sort: LeadSortKey;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown, max: number, label: string, errors: string[], required = false): string => {
  if (value === undefined || value === null) {
    if (required) errors.push(`${label} is required.`);
    return "";
  }
  if (typeof value !== "string") { errors.push(`${label} must be text.`); return ""; }
  const trimmed = value.trim();
  if (required && !trimmed) errors.push(`${label} is required.`);
  if (trimmed.length > max) errors.push(`${label} must be ${max} characters or fewer.`);
  return trimmed;
};

const optionalId = (value: unknown, label: string, errors: string[]): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) { errors.push(`${label} is not valid.`); return null; }
  return id;
};

const requiredId = (value: unknown, label: string, errors: string[]): number => {
  const id = optionalId(value, label, errors);
  if (id === null) errors.push(`${label} is required.`);
  return id ?? 0;
};

const optionalDate = (value: unknown, label: string, errors: string[]): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !isValidYmd(value)) { errors.push(`${label} must be a valid date (YYYY-MM-DD).`); return null; }
  return value;
};

const emailList = (value: unknown, errors: string[]): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\s]+/) : [];
  const emails: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") { errors.push("Client emails must be text."); continue; }
    const email = entry.trim().toLowerCase();
    if (!email) continue;
    if (!emailPattern.test(email) || email.length > 254) { errors.push(`"${email}" is not a valid email address.`); continue; }
    if (!emails.includes(email)) emails.push(email);
  }
  if (emails.length > 10) errors.push("Enter at most 10 client email addresses.");
  return emails;
};

export type ParsedLeadInput = { input: LeadInput; errors: string[] };

export function parseLeadInput(value: unknown): ParsedLeadInput {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { input: {} as LeadInput, errors: ["Invalid lead data."] };
  const body = value as Record<string, unknown>;
  const companyUrl = text(body.companyUrl, 2048, "Company website", errors);
  if (companyUrl && !/^https?:\/\/\S+$/i.test(companyUrl)) errors.push("Company website must begin with http:// or https://.");
  const input: LeadInput = {
    clientName: text(body.clientName, 200, "Client name", errors, true),
    companyUrl,
    address: text(body.address, 500, "Address", errors),
    comments: text(body.comments, 5000, "Comments", errors),
    clientExecutive: text(body.clientExecutive, 160, "Client executive", errors),
    contactPhone: text(body.contactPhone, 40, "Contact number", errors),
    contactAltPhone: text(body.contactAltPhone, 40, "Extension or alternate number", errors),
    contactRemark: text(body.contactRemark, 500, "Contact remark", errors),
    clientEmails: emailList(body.clientEmails, errors),
    industry: text(body.industry, 120, "Client industry", errors),
    positions: text(body.positions, 5000, "Positions", errors),
    leadTypeId: requiredId(body.leadTypeId, "Lead type", errors),
    statusId: requiredId(body.statusId, "Status", errors),
    statusReasonId: optionalId(body.statusReasonId, "Status reason", errors),
    bdActionId: optionalId(body.bdActionId, "BD action", errors),
    clientResponseId: optionalId(body.clientResponseId, "Client response", errors),
    leadCategoryId: optionalId(body.leadCategoryId, "Lead category", errors),
    companySizeId: optionalId(body.companySizeId, "Company size", errors),
    cityId: optionalId(body.cityId, "City", errors),
    firstContactDate: optionalDate(body.firstContactDate, "First contact date", errors) ?? "",
    followUpDate: optionalDate(body.followUpDate, "Follow-up date", errors),
    contractSignedDate: optionalDate(body.contractSignedDate, "Contract signed date", errors),
  };
  if (!input.firstContactDate) errors.push("First contact date is required.");
  return { input, errors };
}

/** Parses a partial update: only keys present in the body are validated and returned. */
export function parseLeadPatch(value: unknown): { changes: Partial<LeadInput>; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { changes: {}, errors: ["Invalid lead data."] };
  const body = value as Record<string, unknown>;
  const changes: Partial<LeadInput> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  if (has("clientName")) changes.clientName = text(body.clientName, 200, "Client name", errors, true);
  if (has("companyUrl")) {
    changes.companyUrl = text(body.companyUrl, 2048, "Company website", errors);
    if (changes.companyUrl && !/^https?:\/\/\S+$/i.test(changes.companyUrl)) errors.push("Company website must begin with http:// or https://.");
  }
  if (has("address")) changes.address = text(body.address, 500, "Address", errors);
  if (has("comments")) changes.comments = text(body.comments, 5000, "Comments", errors);
  if (has("clientExecutive")) changes.clientExecutive = text(body.clientExecutive, 160, "Client executive", errors);
  if (has("contactPhone")) changes.contactPhone = text(body.contactPhone, 40, "Contact number", errors);
  if (has("contactAltPhone")) changes.contactAltPhone = text(body.contactAltPhone, 40, "Extension or alternate number", errors);
  if (has("contactRemark")) changes.contactRemark = text(body.contactRemark, 500, "Contact remark", errors);
  if (has("clientEmails")) changes.clientEmails = emailList(body.clientEmails, errors);
  if (has("industry")) changes.industry = text(body.industry, 120, "Client industry", errors);
  if (has("positions")) changes.positions = text(body.positions, 5000, "Positions", errors);
  if (has("leadTypeId")) changes.leadTypeId = requiredId(body.leadTypeId, "Lead type", errors);
  if (has("statusId")) changes.statusId = requiredId(body.statusId, "Status", errors);
  if (has("statusReasonId")) changes.statusReasonId = optionalId(body.statusReasonId, "Status reason", errors);
  if (has("bdActionId")) changes.bdActionId = optionalId(body.bdActionId, "BD action", errors);
  if (has("clientResponseId")) changes.clientResponseId = optionalId(body.clientResponseId, "Client response", errors);
  if (has("leadCategoryId")) changes.leadCategoryId = optionalId(body.leadCategoryId, "Lead category", errors);
  if (has("companySizeId")) changes.companySizeId = optionalId(body.companySizeId, "Company size", errors);
  if (has("cityId")) changes.cityId = optionalId(body.cityId, "City", errors);
  if (has("firstContactDate")) {
    const date = optionalDate(body.firstContactDate, "First contact date", errors);
    if (!date) errors.push("First contact date is required."); else changes.firstContactDate = date;
  }
  if (has("followUpDate")) changes.followUpDate = optionalDate(body.followUpDate, "Follow-up date", errors);
  if (has("contractSignedDate")) changes.contractSignedDate = optionalDate(body.contractSignedDate, "Contract signed date", errors);
  return { changes, errors };
}

export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const id = (key: string) => {
    const value = Number(params.get(key));
    return params.get(key) && Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const date = (key: string) => {
    const value = params.get(key);
    return value && isValidYmd(value) ? value : null;
  };
  const state = params.get("state");
  const sort = params.get("sort");
  const pageSize = Number(params.get("pageSize") || "50");
  const page = Number(params.get("page") || "1");
  return {
    state: isRecordState(state) ? state : "active",
    q: (params.get("q") || "").trim().slice(0, 200),
    mine: params.get("mine") === "1" || params.get("mine") === "true",
    statusCode: params.get("statusCode")?.trim().slice(0, 60) || null,
    statusId: id("statusId"),
    statusReasonId: id("statusReasonId"),
    leadTypeId: id("leadTypeId"),
    leadCategoryId: id("leadCategoryId"),
    companySizeId: id("companySizeId"),
    cityId: id("cityId"),
    ownerId: id("ownerId"),
    clientResponseId: id("clientResponseId"),
    bdActionId: id("bdActionId"),
    firstContactFrom: date("firstContactFrom"),
    firstContactTo: date("firstContactTo"),
    followUpFrom: date("followUpFrom"),
    followUpTo: date("followUpTo"),
    contractSignedFrom: date("contractSignedFrom"),
    contractSignedTo: date("contractSignedTo"),
    sort: leadSortKeys.includes(sort as LeadSortKey) ? (sort as LeadSortKey) : "last_activity",
    direction: params.get("direction") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 50,
  };
}
