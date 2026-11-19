"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Building2, Mail, Plus, Save, ShieldCheck, UserRound } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { entryStageCode, reasonListFor } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, ConvertToClientDialog } from "@/features/shell/components";
import SuggestInput from "@/features/shell/SuggestInput";
import StagePicker from "@/features/pipeline/StagePicker";
import { fetchOrganization, fetchOrganizations, fetchPerson } from "@/features/contacts/client";
import { OrganizationFormDialog, PersonFormDialog } from "@/features/contacts/ContactFormDialogs";
import { contactKey, type OrganizationDetail, type OrganizationRow } from "@/features/contacts/model";
import { createLead, updateLead } from "./client";
import { dealCurrency, parseDealValue, type LeadInput, type LeadSummary } from "./model";

type Props = {
  lead?: LeadSummary;
  /** Starting values for a new lead, for example from an opportunity card. */
  prefill?: Partial<LeadInput>;
  /** The opportunity card this lead is created from; it becomes "assigned" together with the lead. */
  opportunityId?: number;
  /** The contact the deal is added from (SPEC §10.14): another deal of that organization is not a duplicate, and a person without an organization joins the deal's. */
  contact?: { organizationId?: number | null; personId?: number | null };
  /** The card carries the sales tracker's history (SPEC §10.9): its first-contact date is real, so no approval queue applies. */
  importedHistory?: boolean;
  onClose: () => void;
  onSaved: (lead: LeadSummary) => void;
};

type DuplicateNotice = { leadId: number; clientName: string; ownerName: string; statusLabel: string; recordState: string; canOverride: boolean; message: string };
/** PD-15: what saving would create, waiting for the user's confirmation. */
type ConfirmNotice = { organization: string | null; contact: string | null };

type FormState = {
  clientName: string; companyUrl: string; address: string; comments: string; clientExecutive: string; contactPhone: string; contactAltPhone: string; contactRemark: string;
  clientEmails: string; industry: string; positions: string; leadTypeId: string; statusId: string; statusReasonId: string; leadCategoryId: string;
  companySizeId: string; cityId: string; firstContactDate: string; followUpDate: string; contractSignedDate: string; ownerId: string; stageId: string;
  dealValue: string; expectedCloseDate: string;
};

/** Add or edit a lead with every field from BRD section 6 except files and notes (those live on the lead itself). */
export default function LeadFormDialog({ lead, prefill, opportunityId, contact, importedHistory, onClose, onSaved }: Props) {
  const { reference, can, user, openLead } = useApp();
  const values = reference.listValues;
  const defaultStatus = values.status.find((item) => item.code === "cold") ?? values.status[0];
  // PIPE-02: a new lead starts in the entry stage unless the form says otherwise.
  const entryStage = values.stage.find((item) => item.code === entryStageCode) ?? values.stage[0];
  const [form, setForm] = useState<FormState>(() => lead ? {
    clientName: lead.clientName, companyUrl: lead.companyUrl, address: lead.address, comments: lead.comments, clientExecutive: lead.clientExecutive, contactPhone: lead.contactPhone,
    contactAltPhone: lead.contactAltPhone, contactRemark: lead.contactRemark, clientEmails: lead.clientEmails.join(", "), industry: lead.industry, positions: lead.positions,
    leadTypeId: String(lead.leadTypeId), statusId: String(lead.statusId), statusReasonId: lead.statusReasonId ? String(lead.statusReasonId) : "",
    leadCategoryId: lead.leadCategoryId ? String(lead.leadCategoryId) : "", companySizeId: lead.companySizeId ? String(lead.companySizeId) : "", cityId: lead.cityId ? String(lead.cityId) : "",
    firstContactDate: lead.firstContactDate, followUpDate: lead.followUpDate ?? "", contractSignedDate: lead.contractSignedDate ?? "", ownerId: String(lead.ownerId), stageId: lead.stageId ? String(lead.stageId) : "",
    dealValue: lead.dealValue === null || lead.dealValue === undefined ? "" : String(lead.dealValue), expectedCloseDate: lead.expectedCloseDate ?? "",
  } : {
    clientName: prefill?.clientName ?? "", companyUrl: prefill?.companyUrl ?? "", address: prefill?.address ?? "", comments: prefill?.comments ?? "", clientExecutive: prefill?.clientExecutive ?? "",
    contactPhone: prefill?.contactPhone ?? "", contactAltPhone: prefill?.contactAltPhone ?? "", contactRemark: prefill?.contactRemark ?? "", clientEmails: (prefill?.clientEmails ?? []).join(", "),
    industry: prefill?.industry ?? "", positions: prefill?.positions ?? "",
    leadTypeId: prefill?.leadTypeId ? String(prefill.leadTypeId) : values.lead_type[0] ? String(values.lead_type[0].id) : "", statusId: prefill?.statusId ? String(prefill.statusId) : defaultStatus ? String(defaultStatus.id) : "",
    statusReasonId: "", leadCategoryId: "",
    companySizeId: prefill?.companySizeId ? String(prefill.companySizeId) : "", cityId: prefill?.cityId ? String(prefill.cityId) : "", firstContactDate: prefill?.firstContactDate || reference.today, followUpDate: prefill?.followUpDate ?? "", contractSignedDate: prefill?.contractSignedDate ?? "", ownerId: String(user.id), stageId: prefill?.stageId ? String(prefill.stageId) : entryStage ? String(entryStage.id) : "",
    dealValue: "", expectedCloseDate: "",
  });
  const [duplicate, setDuplicate] = useState<DuplicateNotice | null>(null);
  const [confirm, setConfirm] = useState<ConfirmNotice | null>(null);
  // "+ Add 'Acme' as new organization / contact" picked from the list (request of November 18, 2026): the new record is
  // confirmed already, shown with a blue NEW badge; typing another name drops it.
  const [newOrganization, setNewOrganization] = useState(false);
  const [newContact, setNewContact] = useState(false);
  // "+ Add ... as new company / contact" opens Add company / Add contact with the name typed (request of November 19, 2026);
  // the record saved there becomes the deal's company or contact.
  const [addingOrg, setAddingOrg] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState<string | null>(null);
  // The Client status picked, waiting for "Do you want to convert this deal to client?".
  const [clientStatusId, setClientStatusId] = useState<string | null>(null);
  // "Save anyway" on a similar company is kept when the new organization is then confirmed.
  const allowSimilarChosen = useRef(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // PD-15: a new deal starts from an organization. Matching organizations are offered while typing; once the name is an
  // existing organization, its record fills the empty company fields, its contacts are offered, and its open deals are shown.
  const [orgRows, setOrgRows] = useState<{ q: string; rows: OrganizationRow[] } | null>(null);
  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const lookup = !lead && !contact?.organizationId;
  const typedOrganization = lookup ? form.clientName.trim() : "";
  useEffect(() => {
    if (typedOrganization.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchOrganizations(typedOrganization, 1).then(async (page) => {
        if (cancelled) return;
        setOrgRows({ q: typedOrganization, rows: page.rows.slice(0, 8) });
        const exact = page.rows.find((row) => contactKey(row.name) === contactKey(typedOrganization));
        const detail = exact ? await fetchOrganization(exact.id) : null;
        if (!cancelled) setOrganization(detail);
      }).catch(() => { /* suggestions are optional; the server still decides on save */ });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typedOrganization]);
  // A deal started from an organization's page (+ Deal) comes with that organization: its record is loaded at once, so
  // its contacts are offered in the Contact field like those of an organization picked by name.
  const fixedOrganizationId = !lead ? contact?.organizationId ?? null : null;
  useEffect(() => {
    if (!fixedOrganizationId) return;
    let cancelled = false;
    fetchOrganization(fixedOrganizationId).then((detail) => { if (!cancelled) setOrganization(detail); }).catch(() => { /* the lookup is a convenience */ });
    return () => { cancelled = true; };
  }, [fixedOrganizationId]);
  const matchedOrganization = organization && (fixedOrganizationId ? organization.organization.id === fixedOrganizationId : contactKey(organization.organization.name) === contactKey(form.clientName)) ? organization : null;
  // Contacts are looked up on every new deal, whether the organization was typed or came with the page it was started from.
  const contactLookup = !lead;
  const matchedPerson = matchedOrganization?.people.find((person) => contactKey(person.name) === contactKey(form.clientExecutive)) ?? null;
  const openDeals = matchedOrganization?.deals.filter((deal) => deal.recordState === "active") ?? [];

  // Review of November 18, 2026: a contact belongs to an organization, so contacts are looked up only inside the
  // organization picked above (by name or by a typed email address). Until an organization is chosen there is no lookup.
  const people = matchedOrganization?.people ?? [];
  const typedEmail = contactLookup ? (form.clientEmails.split(/[,;\s]+/).pop() ?? "").trim().toLowerCase() : "";
  const pickContact = (name: string, email?: string | null) => {
    setForm((current) => {
      const emails = current.clientEmails.split(/[,;\s]+/).filter(Boolean);
      if (email) { if (emails.length && emails[emails.length - 1].toLowerCase() === typedEmail) emails.pop(); if (!emails.includes(email)) emails.push(email); }
      return { ...current, clientExecutive: name, clientEmails: emails.join(", ") };
    });
    setConfirm(null);
  };
  const orgSuggestions = orgRows && orgRows.q === typedOrganization ? orgRows.rows.map((row) => ({
    key: String(row.id), label: row.name, icon: <Building2 size={14} />,
    detail: [row.city, row.industry, `${row.openDeals} open ${row.openDeals === 1 ? "deal" : "deals"}`, row.people ? `${row.people} ${row.people === 1 ? "contact" : "contacts"}` : null].filter(Boolean).join(" · "),
  })) : [];
  const contactSuggestions = people
    .filter((person) => !form.clientExecutive.trim() || contactKey(person.name).includes(contactKey(form.clientExecutive)))
    .map((person) => ({ key: `p${person.id}`, label: person.name, detail: [person.email, person.phone].filter(Boolean).join(" · ") || undefined, icon: <UserRound size={14} /> }));
  const emailSuggestions = typedEmail.length >= 3
    ? people
      .filter((person) => person.email && person.email.toLowerCase().includes(typedEmail))
      .map((person) => ({ key: `e${person.id}`, label: person.email ?? person.name, detail: person.name, icon: <Mail size={14} /> }))
    : [];
  // The "+ Add … as new …" lines: offered once the lookup has answered and nothing of that name exists.
  const organizationIsNew = lookup && typedOrganization.length >= 2 && orgRows?.q === typedOrganization
    && !orgRows.rows.some((row) => contactKey(row.name) === contactKey(typedOrganization));
  const contactIsNew = contactLookup && form.clientExecutive.trim().length >= 2 && !people.some((person) => contactKey(person.name) === contactKey(form.clientExecutive));
  // The contact is chosen after the organization: the field waits until a name is typed there.
  const organizationChosen = !contactLookup || form.clientName.trim().length > 0;

  // Picking an existing organization or contact fills the fields that are still empty from its record.
  const matchedOrganizationId = matchedOrganization?.organization.id ?? null;
  useEffect(() => {
    if (!matchedOrganization) return;
    const record = matchedOrganization.organization;
    setForm((current) => ({
      ...current,
      industry: current.industry || record.industry, address: current.address || record.address, companyUrl: current.companyUrl || record.website,
      cityId: current.cityId || (record.cityId ? String(record.cityId) : ""), companySizeId: current.companySizeId || (record.companySizeId ? String(record.companySizeId) : ""),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per organization picked
  }, [matchedOrganizationId]);
  const matchedPersonId = matchedPerson?.id ?? null;
  useEffect(() => {
    if (!matchedPersonId) return;
    let cancelled = false;
    fetchPerson(matchedPersonId).then(({ person }) => {
      if (cancelled) return;
      setForm((current) => ({
        ...current,
        clientEmails: current.clientEmails || person.emails.join(", "), contactPhone: current.contactPhone || person.phone,
        contactAltPhone: current.contactAltPhone || person.altPhone, contactRemark: current.contactRemark || person.remark,
      }));
    }).catch(() => { /* the contact's details are a convenience */ });
    return () => { cancelled = true; };
  }, [matchedPersonId]);

  /** A company saved in (or picked from) Add company: the deal's company, its record loaded so its details and contacts follow. */
  const linkOrg = (id: number, name: string) => {
    setForm((current) => ({ ...current, clientName: name, clientExecutive: "" }));
    setNewOrganization(false); setNewContact(false); setDuplicate(null); setConfirm(null);
    fetchOrganization(id).then(setOrganization).catch(() => undefined);
  };
  /** A contact saved in (or picked from) Add contact: the deal's contact, the company's contacts reloaded so it is matched. */
  const linkPerson = (_id: number, name: string) => {
    const organizationId = matchedOrganization?.organization.id ?? null;
    if (organizationId) fetchOrganization(organizationId).then(setOrganization).catch(() => undefined);
    pickContact(name);
    setNewContact(false);
  };
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const idOrNull = (value: string) => (value ? Number(value) : null);
  const yesterday = (() => { const [y, m, d] = reference.today.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d - 1)); return date.toISOString().slice(0, 10); })();
  const historical = Boolean(form.firstContactDate && form.firstContactDate < yesterday) && !importedHistory;
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  // LEAD-06: Lost Lead and Disqualified need a reason from their own list; other statuses clear it.
  const reasonKey = reasonListFor(values.status.find((item) => String(item.id) === form.statusId)?.code);

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(false); };

  const save = async (allowSimilar: boolean, confirmed = false) => {
    allowSimilarChosen.current = allowSimilar;
    // PD-11: the value is optional; what is typed must be an amount.
    const typedValue = parseDealValue(form.dealValue);
    if (typedValue.error) { setError(typedValue.error); return; }
    setSaving(true);
    setError("");
    setDuplicate(null);
    setConfirm(null);
    const input: LeadInput = {
      clientName: form.clientName, companyUrl: form.companyUrl, address: form.address, comments: form.comments, clientExecutive: form.clientExecutive, contactPhone: form.contactPhone,
      contactAltPhone: form.contactAltPhone, contactRemark: form.contactRemark, clientEmails: form.clientEmails.split(/[,;\s]+/).filter(Boolean), industry: form.industry, positions: form.positions,
      leadTypeId: Number(form.leadTypeId), statusId: Number(form.statusId), statusReasonId: reasonKey ? idOrNull(form.statusReasonId) : null,
      leadCategoryId: idOrNull(form.leadCategoryId), companySizeId: idOrNull(form.companySizeId), cityId: idOrNull(form.cityId),
      firstContactDate: form.firstContactDate, followUpDate: form.followUpDate || null, contractSignedDate: form.contractSignedDate || null,
      stageId: idOrNull(form.stageId),
      dealValue: typedValue.value, expectedCloseDate: form.expectedCloseDate || null,
    };
    try {
      const result = lead ? await updateLead(lead.id, input) : await createLead({
        ...input, ownerId: can("reassign_leads") ? Number(form.ownerId) : null, opportunityId: opportunityId ?? null,
        organizationId: contact?.organizationId ?? matchedOrganization?.organization.id ?? null, personId: contact?.personId ?? matchedPerson?.id ?? null,
        allowSimilar, createOrganization: confirmed || newOrganization, createContact: confirmed || newContact,
      });
      onSaved(result.lead);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      const found = apiError?.status === 409 && apiError.data.duplicate ? (apiError.data.duplicate as Omit<DuplicateNotice, "canOverride" | "message">) : null;
      if (apiError?.status === 409 && apiError.data.code === "confirm_create") setConfirm({ organization: (apiError.data.organization as string | null) ?? null, contact: (apiError.data.contact as string | null) ?? null });
      else if (apiError && found) setDuplicate({ ...found, canOverride: apiError.data.canOverride === true, message: apiError.message });
      else setError(errorMessage(caught, "Could not save the deal."));
      setSaving(false);
    }
  };

  const select = (key: keyof FormState, list: { id: number; value: string }[], placeholder = "Not set") => (
    <select value={form[key]} onChange={set(key)}>
      {placeholder && <option value="">{placeholder}</option>}
      {list.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
    </select>
  );

  return (
    <Dialog title={lead ? `Edit ${lead.clientName}` : "Add deal"} eyebrow={lead ? "DEAL DETAILS" : undefined} onClose={onClose} size="wide">
      {/* The add-deal layout: the deal on the left, the person and the organization on the right. */}
      <form className="lead-form deal-form" onSubmit={submit}>
        <div className="deal-form-col">
          <Field label="Company" required wide hint={lookup ? (newOrganization ? "A new company: it is created with the deal." : "Start typing the company's name: pick one of the companies that match, or add it as a new one.") : undefined}>
            {lookup
              ? <SuggestInput
                  value={form.clientName} onChange={(value) => { setForm((current) => ({ ...current, clientName: value })); setDuplicate(null); setConfirm(null); setNewOrganization(false); }}
                  suggestions={orgSuggestions} onPick={(suggestion) => { setForm((current) => ({ ...current, clientName: suggestion.label })); setDuplicate(null); setConfirm(null); setNewOrganization(false); }}
                  loading={!orgRows || orgRows.q !== typedOrganization}
                  icon={<Building2 size={16} />}
                  create={organizationIsNew ? { label: `Add '${typedOrganization}' as new company`, onCreate: () => { setAddingOrg(typedOrganization); setConfirm(null); } } : null}
                  isNew={newOrganization} onClear={() => { setForm((current) => ({ ...current, clientName: "" })); setNewOrganization(false); setNewContact(false); setConfirm(null); }}
                  required maxLength={200} placeholder="Company" autoFocus
                />
              : <input value={form.clientName} onChange={(event) => { set("clientName")(event); setDuplicate(null); setConfirm(null); }} required maxLength={200} placeholder="Company name" autoFocus />}
          </Field>
          {openDeals.length > 0 && (
            <div className="form-note open-deals-note field-wide" role="status">
              <Building2 size={14} />
              <div>
                <p><strong>{matchedOrganization?.organization.name}</strong> already has {openDeals.length === 1 ? "an open deal" : `${openDeals.length} open deals`}. This one is added next to {openDeals.length === 1 ? "it" : "them"}.</p>
                <ul className="open-deals-list">
                  {openDeals.slice(0, 3).map((deal) => <li key={deal.id}><button type="button" className="link-button" onClick={() => { openLead(deal.id); onClose(); }}>{deal.clientName}</button> · {deal.ownerName}{deal.stage ? ` · ${deal.stage}` : ""}</li>)}
                </ul>
              </div>
            </div>
          )}
          <Field label="Contact" wide hint={!contactLookup ? undefined : matchedOrganization ? (matchedOrganization.people.length ? `Click or type to pick one of ${matchedOrganization.organization.name}'s contacts, or type a new name.` : `${matchedOrganization.organization.name} has no contacts yet: type a name to add one.`) : organizationChosen ? "A new company has no contacts yet: type a name. The company is created first and the contact is added inside it." : "Choose the company first: contacts are looked up inside it."}>
            {contactLookup
              ? <SuggestInput
                  value={form.clientExecutive} onChange={(value) => { setForm((current) => ({ ...current, clientExecutive: value })); setConfirm(null); setNewContact(false); }}
                  suggestions={contactSuggestions}
                  onPick={(suggestion) => {
                    const person = people.find((item) => `p${item.id}` === suggestion.key);
                    if (person) { pickContact(person.name); setNewContact(false); }
                  }}
                  minChars={0} disabled={!organizationChosen}
                  icon={<UserRound size={16} />}
                  create={contactIsNew ? { label: `Add '${form.clientExecutive.trim()}' as new contact`, onCreate: () => { setAddingPerson(form.clientExecutive.trim()); setConfirm(null); } } : null}
                  isNew={newContact} onClear={() => { setForm((current) => ({ ...current, clientExecutive: "" })); setNewContact(false); setConfirm(null); }}
                  maxLength={160} placeholder={!organizationChosen ? "Choose the company first" : "Contact person"}
                />
              : <input value={form.clientExecutive} onChange={(event) => { set("clientExecutive")(event); setConfirm(null); }} maxLength={160} placeholder="Contact person" />}
          </Field>
          <StagePicker value={form.stageId} onChange={(stageId) => setForm((current) => ({ ...current, stageId }))} hint={lead ? undefined : "Where the deal starts on the board: click an arrow."} />
          <Field label="Deal source" required>{select("leadTypeId", values.lead_type, "")}</Field>
          <Field label="Status" required>
            <select value={form.statusId} onChange={(event) => {
              const statusId = event.target.value;
              // Client asks first (request of November 19, 2026); the deal becomes a client when it is saved.
              if (values.status.find((item) => String(item.id) === statusId)?.code === "client" && lead?.statusCode !== "client") { setClientStatusId(statusId); return; }
              setForm((current) => ({ ...current, statusId, statusReasonId: "" }));
            }}>
              {values.status.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          </Field>
          {reasonKey && (
            <Field label="Status reason" required wide hint="Shown with the status everywhere as \u201cStatus \u2013 Reason\u201d.">
              <select value={form.statusReasonId} onChange={set("statusReasonId")} required>
                <option value="">Choose a reason</option>
                {values[reasonKey].map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
              </select>
            </Field>
          )}
          <Field label="First contact date" required hint={historical ? (can("review_queued") ? "Historical date: saved directly because you can approve queued deals." : "Earlier than yesterday: the deal will be queued for Admin approval.") : undefined}>
            <input type="date" value={form.firstContactDate} onChange={set("firstContactDate")} required />
          </Field>
          <Field label="Follow-up date"><input type="date" value={form.followUpDate} onChange={set("followUpDate")} /></Field>
          <Field label={`Value (${dealCurrency})`} hint="Optional."><input inputMode="decimal" value={form.dealValue} onChange={set("dealValue")} maxLength={16} placeholder="e.g. 25,000" /></Field>
          <Field label="Expected close date" hint="Optional."><input type="date" value={form.expectedCloseDate} onChange={set("expectedCloseDate")} /></Field>
          {!lead && can("reassign_leads") && (
            <Field label="Owner" wide hint={opportunityId ? "Who will follow up this company; the deal is created in their name." : "The creator becomes the owner unless you choose someone else."}><select value={form.ownerId} onChange={set("ownerId")}>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          )}
          <Field label="Deal category">{select("leadCategoryId", values.lead_category)}</Field>
          <Field label="Contract signed date"><input type="date" value={form.contractSignedDate} onChange={set("contractSignedDate")} /></Field>
          <Field label="Position(s)" wide><textarea value={form.positions} onChange={set("positions")} rows={2} maxLength={5000} placeholder="Open or target positions" /></Field>
          <Field label="Comments" wide><textarea value={form.comments} onChange={set("comments")} rows={3} maxLength={5000} placeholder="General comments" /></Field>
        </div>
        <div className="deal-form-col deal-form-side">
          <h3 className="deal-form-heading">CONTACT</h3>
          <Field label="Email(s)" wide hint={contactLookup ? "Separate several addresses with commas. Typing an address also finds the company's contact who has it." : "Separate several addresses with commas."}>
            {contactLookup
              ? <SuggestInput
                  value={form.clientEmails} onChange={(value) => setForm((current) => ({ ...current, clientEmails: value }))}
                  suggestions={emailSuggestions} minChars={3}
                  onPick={(suggestion) => { const person = people.find((item) => `e${item.id}` === suggestion.key); if (person) pickContact(person.name, person.email); }}
                  placeholder="name@company.com"
                />
              : <input value={form.clientEmails} onChange={set("clientEmails")} placeholder="name@company.com" />}
          </Field>
          <Field label="Contact number"><input type="tel" value={form.contactPhone} onChange={set("contactPhone")} maxLength={40} placeholder="+1 (555) 123-4567" /></Field>
          <Field label="Extension or alternate number"><input type="tel" value={form.contactAltPhone} onChange={set("contactAltPhone")} maxLength={40} /></Field>
          <Field label="Contact remark" wide><input value={form.contactRemark} onChange={set("contactRemark")} maxLength={500} placeholder="Best time to call, preferences..." /></Field>
          <h3 className="deal-form-heading">COMPANY</h3>
          <Field label="Client industry"><input value={form.industry} onChange={set("industry")} maxLength={120} placeholder="e.g. Healthcare" /></Field>
          <Field label="Company size">{select("companySizeId", values.company_size)}</Field>
          <Field label="City" wide>{select("cityId", values.city)}</Field>
          <Field label="Address" wide><input value={form.address} onChange={set("address")} maxLength={500} placeholder="Street and location" /></Field>
          <Field label="Company website" wide><input type="url" value={form.companyUrl} onChange={set("companyUrl")} pattern="https?://.+" title="Enter a URL beginning with http:// or https://" placeholder="https://company.com" /></Field>
        </div>
        {!lead && <div className="form-note"><ShieldCheck size={14} /> Notes, documents, and candidate profiles are added on the deal page after saving.</div>}
        {duplicate && (
          <div className="form-note duplicate-note" role="alert">
            <AlertTriangle size={14} />
            <div>
              <p>{duplicate.message}</p>
              <div className="duplicate-actions">
                <button type="button" className="button button-outline button-small" onClick={() => { openLead(duplicate.leadId); onClose(); }}>Open {duplicate.clientName}</button>
                {duplicate.canOverride && <button type="button" className="button button-outline button-small" onClick={() => void save(true)} disabled={saving}>Save anyway</button>}
              </div>
            </div>
          </div>
        )}
        {confirm && (
          <div className="form-note confirm-new-note" role="alert">
            <Building2 size={14} />
            <div>
              <p>Saving this deal also creates:</p>
              <ul className="open-deals-list">
                {confirm.organization && <li>{confirm.contact ? "First, the new company" : "New company"}: <strong>{confirm.organization}</strong></li>}
                {confirm.contact && <li>{confirm.organization ? "Then, inside it, the new contact" : "New contact"}: <strong>{confirm.contact}</strong>{!confirm.organization && matchedOrganization ? ` at ${matchedOrganization.organization.name}` : ""}</li>}
              </ul>
              <div className="duplicate-actions">
                <button type="button" className="button button-primary button-small" disabled={saving} onClick={() => void save(allowSimilarChosen.current, true)}>Create and add deal</button>
                <button type="button" className="button button-outline button-small" onClick={() => setConfirm(null)}>Back</button>
              </div>
            </div>
          </div>
        )}
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{lead ? <Save size={15} /> : <Plus size={15} />} {saving ? "Saving..." : lead ? "Save changes" : "Save deal"}</button>
        </div>
      </form>
      {addingOrg !== null && (
        <OrganizationFormDialog
          initialName={addingOrg}
          onUseExisting={(found) => { setAddingOrg(null); linkOrg(found.id, found.name); }}
          onClose={() => setAddingOrg(null)}
          onSaved={(saved) => { setAddingOrg(null); linkOrg(saved.id, saved.name); }}
        />
      )}
      {addingPerson !== null && (
        <PersonFormDialog
          organizationName={matchedOrganization?.organization.name ?? form.clientName.trim()}
          initialName={addingPerson}
          onUseExisting={(found) => { setAddingPerson(null); linkPerson(found.id, found.name); }}
          onClose={() => setAddingPerson(null)}
          onSaved={(saved) => { setAddingPerson(null); linkPerson(saved.id, saved.name); }}
        />
      )}
      {clientStatusId !== null && (
        <ConvertToClientDialog
          dealName={form.clientName.trim() || "This deal"}
          onClose={() => setClientStatusId(null)}
          onConfirm={() => { setForm((current) => ({ ...current, statusId: clientStatusId, statusReasonId: "" })); setClientStatusId(null); }}
        />
      )}
    </Dialog>
  );
}
