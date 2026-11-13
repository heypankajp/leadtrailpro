import { api } from "@/lib/api";
import type { ContactActivityInput, ContactPage, ContactsTimeline, Organization, OrganizationDetail, OrganizationInput, OrganizationRow, Person, PersonDetail, PersonInput, PersonRow } from "./model";

const search = (q: string, page: number) => new URLSearchParams({ ...(q ? { q } : {}), page: String(page) }).toString();
export const fetchPeople = (q: string, page: number) => api<ContactPage<PersonRow>>(`/api/contacts/people?${search(q, page)}`);
export const fetchOrganizations = (q: string, page: number) => api<ContactPage<OrganizationRow>>(`/api/contacts/organizations?${search(q, page)}`);
export const fetchOrganization = (id: number) => api<OrganizationDetail>(`/api/contacts/organizations/${id}`);
export const fetchPerson = (id: number) => api<PersonDetail>(`/api/contacts/people/${id}`);
export const createOrganization = (input: OrganizationInput) => api<{ organization: Organization }>("/api/contacts/organizations", { method: "POST", json: input });
export const updateOrganization = (id: number, input: OrganizationInput) => api<{ organization: Organization }>(`/api/contacts/organizations/${id}`, { method: "PATCH", json: input });
export const removeOrganization = (id: number) => api<{ ok: true }>(`/api/contacts/organizations/${id}`, { method: "DELETE" });
export const createPerson = (input: PersonInput) => api<{ person: Person }>("/api/contacts/people", { method: "POST", json: input });
export const updatePerson = (id: number, input: PersonInput) => api<{ person: Person }>(`/api/contacts/people/${id}`, { method: "PATCH", json: input });
export const removePerson = (id: number) => api<{ ok: true }>(`/api/contacts/people/${id}`, { method: "DELETE" });
export const logOrganizationActivity = (id: number, input: ContactActivityInput) => api<{ ok: true }>(`/api/contacts/organizations/${id}/activities`, { method: "POST", json: input });
export const logPersonActivity = (id: number, input: ContactActivityInput) => api<{ ok: true }>(`/api/contacts/people/${id}/activities`, { method: "POST", json: input });
/** Folds the other contact into this one (SPEC §10.16). */
export const mergeOrganization = (id: number, otherId: number) => api<{ organization: Organization }>(`/api/contacts/organizations/${id}/merge`, { method: "POST", json: { otherId } });
export const mergePerson = (id: number, otherId: number) => api<{ person: Person }>(`/api/contacts/people/${id}/merge`, { method: "POST", json: { otherId } });
export const fetchContactsTimeline = (q: string, page: number) => api<ContactsTimeline>(`/api/contacts/timeline?${search(q, page)}`);
