import type { LeadRecordInput, LeadRecordState, StoredLead } from "./model";

type LeadResponse = { error?: string; lead?: StoredLead; leads?: StoredLead[] };

async function requestLeads(path: string, init?: RequestInit): Promise<LeadResponse> {
  const response = await fetch(path, init);
  const result = await response.json() as LeadResponse;
  if (!response.ok) throw new Error(result.error || "The lead request could not be completed.");
  return result;
}

export async function fetchLeads(): Promise<StoredLead[]> {
  const result = await requestLeads("/api/leads", { cache: "no-store" });
  if (!Array.isArray(result.leads)) throw new Error("The leads API returned an invalid response.");
  return result.leads;
}

export async function createLeadRecord(lead: LeadRecordInput): Promise<StoredLead> {
  const result = await requestLeads("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
  if (!result.lead) throw new Error("The leads API did not return the created lead.");
  return result.lead;
}

export async function saveLeadRecord(id: number, lead: LeadRecordInput): Promise<void> {
  await requestLeads(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
}

export async function deleteLeadRecord(id: number): Promise<void> {
  await requestLeads(`/api/leads/${id}`, { method: "DELETE" });
}

export function leadPayload(lead: StoredLead, recordState: LeadRecordState): LeadRecordInput {
  return {
    ...lead,
    companyUrl: lead.companyUrl ?? "",
    contactEmail: lead.contactEmail ?? "",
    alternateEmail: lead.alternateEmail ?? "",
    contactPhone: lead.contactPhone ?? "",
    recordState,
  };
}
