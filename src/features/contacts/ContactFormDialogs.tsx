"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
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
 * Add or edit a person. A new person is filed under the organization typed here: an existing one is linked, a new
 * name creates the organization, and the field may stay empty. `organizationName` fixes it (added from an organization's page).
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const input = { name: form.name, organizationName: form.organizationName, emails: form.emails.split(/[,;\s]+/).filter(Boolean), phone: form.phone, altPhone: form.altPhone, remark: form.remark };
    try {
      const result = person ? await updatePerson(person.id, input) : await createPerson(input);
      onSaved(result.person);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the person."));
      setSaving(false);
    }
  };

  return (
    <Dialog title={person ? `Edit ${person.name}` : "Add person"} eyebrow={person ? "PERSON" : undefined} onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Name" required wide><input value={form.name} onChange={set("name")} required maxLength={160} placeholder="Contact person" autoFocus /></Field>
        <Field label="Organization" wide hint={fixedOrganization ? (person ? "They have deals with this organization, so they stay there. Someone who changed employer is added as a new person at the new organization." : undefined) : "Type the company's name: an existing organization is linked, a new name is added. May stay empty."}>
          <input value={form.organizationName} onChange={set("organizationName")} maxLength={200} placeholder="Company name" list="organization-suggestions" disabled={Boolean(fixedOrganization)} />
        </Field>
        <datalist id="organization-suggestions">{typed.length >= 2 && suggestions.map((name) => <option key={name} value={name} />)}</datalist>
        <Field label="Email(s)" wide hint="Separate several addresses with commas."><input value={form.emails} onChange={set("emails")} placeholder="name@company.com" /></Field>
        <Field label="Phone"><input type="tel" value={form.phone} onChange={set("phone")} maxLength={40} placeholder="+1 (555) 123-4567" /></Field>
        <Field label="Extension or alternate number"><input type="tel" value={form.altPhone} onChange={set("altPhone")} maxLength={40} /></Field>
        <Field label="Remark" wide><input value={form.remark} onChange={set("remark")} maxLength={500} placeholder="Best time to call, preferences..." /></Field>
        {person && <p className="dialog-description field-wide">These details are shown on every deal of this person.</p>}
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{person ? <Save size={15} /> : <Plus size={15} />} {saving ? "Saving..." : person ? "Save changes" : "Save person"}</button>
        </div>
      </form>
    </Dialog>
  );
}
