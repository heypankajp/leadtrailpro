"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, Plus, Save } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import SuggestInput from "@/features/shell/SuggestInput";
import { createOrganization, createPerson, fetchOrganizations, updateOrganization, updatePerson } from "./client";
import type { Organization, Person } from "./model";

/** Add or edit an organization (SPEC §10.14). Saving an edit updates the company details on every deal of the organization. */
export function OrganizationFormDialog({ organization, onClose, onSaved }: { organization?: Organization; onClose: () => void; onSaved: (organization: Organization) => void }) {
  const { reference } = useApp();
  const [form, setForm] = useState({
    name: organization?.name ?? "", industry: organization?.industry ?? "", companySizeId: organization?.companySizeId ? String(organization.companySizeId) : "",
    cityId: organization?.cityId ? String(organization.cityId) : "", address: organization?.address ?? "", website: organization?.website ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const input = { name: form.name, industry: form.industry, companySizeId: form.companySizeId ? Number(form.companySizeId) : null, cityId: form.cityId ? Number(form.cityId) : null, address: form.address, website: form.website };
    try {
      const result = organization ? await updateOrganization(organization.id, input) : await createOrganization(input);
      onSaved(result.organization);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the organization."));
      setSaving(false);
    }
  };

  return (
    <Dialog title={organization ? `Edit ${organization.name}` : "Add organization"} eyebrow={organization ? "ORGANIZATION" : undefined} onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Name" required wide><input value={form.name} onChange={set("name")} required maxLength={200} placeholder="Company name" autoFocus /></Field>
        <Field label="Industry"><input value={form.industry} onChange={set("industry")} maxLength={120} placeholder="e.g. Healthcare" /></Field>
        <Field label="Company size">
          <select value={form.companySizeId} onChange={set("companySizeId")}><option value="">Not set</option>{reference.listValues.company_size.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        </Field>
        <Field label="City" wide>
          <select value={form.cityId} onChange={set("cityId")}><option value="">Not set</option>{reference.listValues.city.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        </Field>
        <Field label="Address" wide><input value={form.address} onChange={set("address")} maxLength={500} placeholder="Street and location" /></Field>
        <Field label="Website" wide><input type="url" value={form.website} onChange={set("website")} pattern="https?://.+" title="Enter a URL beginning with http:// or https://" placeholder="https://company.com" /></Field>
        {organization && <p className="dialog-description field-wide">These details are shown on every deal of this organization.</p>}
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{organization ? <Save size={15} /> : <Plus size={15} />} {saving ? "Saving..." : organization ? "Save changes" : "Save organization"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Add or edit a contact (a `persons` row). A contact always belongs to an organization (PD-17): an existing one is linked,
 * a new name is created only after the user confirms it (the server answers 409 `confirm_create` until `createOrganization`
 * is sent). `organizationName` fixes it (added from an organization's page).
 * An existing person keeps their organization once they have deals; `movable` (no deals yet) lets a wrong filing be corrected.
 */
export function PersonFormDialog({ person, organizationName, movable = false, onClose, onSaved }: { person?: Person; organizationName?: string; movable?: boolean; onClose: () => void; onSaved: (person: Person) => void }) {
  const fixedOrganization = organizationName ?? (person?.organization && !movable ? person.organization : null);
  const [form, setForm] = useState({
    name: person?.name ?? "", organizationName: fixedOrganization ?? person?.organization ?? "", emails: person?.emails.join(", ") ?? "", phone: person?.phone ?? "", altPhone: person?.altPhone ?? "", remark: person?.remark ?? "",
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // PD-15 / PD-17: the organization name that is new and waits for the user's confirmation.
  const [confirmNew, setConfirmNew] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  // Organizations that match what is being typed, offered as suggestions.
  const typed = fixedOrganization ? "" : form.organizationName.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchOrganizations(typed, 1).then((page) => { if (!cancelled) setSuggestions(page.rows.slice(0, 12).map((row) => row.name)); }).catch(() => { /* suggestions are optional */ });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typed]);

  const save = async (createOrganization: boolean) => {
    setSaving(true);
    setError("");
    const input = { name: form.name, organizationName: form.organizationName, emails: form.emails.split(/[,;\s]+/).filter(Boolean), phone: form.phone, altPhone: form.altPhone, remark: form.remark, createOrganization };
    try {
      const result = person ? await updatePerson(person.id, input) : await createPerson(input);
      onSaved(result.person);
    } catch (caught) {
      const asked = caught instanceof ApiError && caught.status === 409 && caught.data.code === "confirm_create" ? String(caught.data.organization ?? form.organizationName) : null;
      if (asked) setConfirmNew(asked);
      else setError(errorMessage(caught, "Could not save the contact."));
      setSaving(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(false); };

  return (
    <Dialog title={person ? `Edit ${person.name}` : "Add contact"} eyebrow={person ? "CONTACT" : undefined} onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Name" required wide><input value={form.name} onChange={set("name")} required maxLength={160} placeholder="Contact person" autoFocus /></Field>
        <Field label="Organization" required wide hint={fixedOrganization ? (person ? "They have deals with this organization, so they stay there. Someone who changed employer is added as a new contact at the new organization." : undefined) : "Start typing the company's name: the organizations that match appear in a list. Pick one, or keep typing a new name (you are asked before it is created)."}>
          {fixedOrganization
            ? <input value={form.organizationName} maxLength={200} disabled required />
            : <SuggestInput
                value={form.organizationName} onChange={(value) => { setForm((current) => ({ ...current, organizationName: value })); setConfirmNew(null); }}
                suggestions={typed.length >= 2 ? suggestions.map((name) => ({ key: name, label: name })) : []} onPick={(suggestion) => { setForm((current) => ({ ...current, organizationName: suggestion.label })); setConfirmNew(null); }}
                empty={`No organization called “${typed}” yet: saving adds it after you confirm.`}
                maxLength={200} placeholder="Type to search organizations…" required
              />}
        </Field>
        <Field label="Email(s)" wide hint="Separate several addresses with commas."><input value={form.emails} onChange={set("emails")} placeholder="name@company.com" /></Field>
        <Field label="Phone"><input type="tel" value={form.phone} onChange={set("phone")} maxLength={40} placeholder="+1 (555) 123-4567" /></Field>
        <Field label="Extension or alternate number"><input type="tel" value={form.altPhone} onChange={set("altPhone")} maxLength={40} /></Field>
        <Field label="Remark" wide><input value={form.remark} onChange={set("remark")} maxLength={500} placeholder="Best time to call, preferences..." /></Field>
        {person && <p className="dialog-description field-wide">These details are shown on every deal of this contact.</p>}
        {confirmNew && (
          <div className="form-note confirm-new-note field-wide" role="alert">
            <Building2 size={14} />
            <div>
              <p><strong>{confirmNew}</strong> is not an organization yet. Create it and file the contact there?</p>
              <div className="duplicate-actions"><button type="button" className="button button-primary button-small" disabled={saving} onClick={() => void save(true)}>Create organization and save</button></div>
            </div>
          </div>
        )}
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{person ? <Save size={15} /> : <Plus size={15} />} {saving ? "Saving..." : person ? "Save changes" : "Save contact"}</button>
        </div>
      </form>
    </Dialog>
  );
}
