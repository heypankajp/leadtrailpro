"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, DownloadCloud, LoaderCircle, Plus, Save, TriangleAlert, UserRound } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import SuggestInput from "@/features/shell/SuggestInput";
import { createOrganization, createPerson, fetchOrganization, fetchOrganizations, lookupWebsite, updateOrganization, updatePerson } from "./client";
import type { WebsiteDetails } from "./websiteDetails";
import { contactKey, type Organization, type OrganizationRow, type Person, type PersonRow } from "./model";

/** Add or edit an organization (SPEC §10.14). Saving an edit updates the company details on every deal of the organization. */
export function OrganizationFormDialog({ organization, onClose, onSaved }: { organization?: Organization; onClose: () => void; onSaved: (organization: Organization) => void }) {
  const { reference, openContact } = useApp();
  const [form, setForm] = useState({
    name: organization?.name ?? "", industry: organization?.industry ?? "", companySizeId: organization?.companySizeId ? String(organization.companySizeId) : "",
    cityId: organization?.cityId ? String(organization.cityId) : "", address: organization?.address ?? "", website: organization?.website ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  // A new organization (request of November 18, 2026): the name looks up the organizations that exist, so one is not
  // added twice (picking it opens it); "+ Add 'Acme' as new organization" marks the name NEW.
  const [isNew, setIsNew] = useState(false);
  const [matches, setMatches] = useState<{ q: string; rows: OrganizationRow[] } | null>(null);
  const typed = organization || isNew ? "" : form.name.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { fetchOrganizations(typed, 1).then((page) => { if (!cancelled) setMatches({ q: typed, rows: page.rows.slice(0, 8) }); }).catch(() => undefined); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typed]);
  const found = matches && matches.q === typed ? matches.rows : [];
  const exists = found.find((row) => contactKey(row.name) === contactKey(typed)) ?? null;

  // Website → Fetch (request of November 19, 2026): the server reads the website and the name, industry, city and address
  // it gives fill the form. A field the person typed is kept; one filled by an earlier fetch (or empty) is replaced.
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState<{ tone: "ok" | "error"; text: string; missing?: string } | null>(null);
  const [autoFilled, setAutoFilled] = useState<Partial<Record<keyof typeof form, string>>>({});
  // A company found outside Canada: its details wait for the person's yes before they fill the form.
  const [abroad, setAbroad] = useState<WebsiteDetails | null>(null);
  const fetchWebsite = async () => {
    if (!form.website.trim()) { setFetched({ tone: "error", text: "Enter the company's website first, e.g. company.com." }); return; }
    setFetching(true);
    setFetched(null);
    setAbroad(null);
    try {
      const { details } = await lookupWebsite(form.website);
      if (details.country && details.country.toLowerCase() !== "canada") setAbroad(details);
      else fillFrom(details);
    } catch (caught) {
      setFetched({ tone: "error", text: errorMessage(caught, "Could not read the website.") });
    } finally {
      setFetching(false);
    }
  };
  /** Fills the form with what the website gave and says what was found. */
  const fillFrom = (details: WebsiteDetails) => {
    // The City list value the address names: its town first, otherwise any city of the list the address mentions.
    const cities = reference.listValues.city.filter((item) => item.active !== false);
    const plain = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const byTown = details.city ? cities.find((item) => plain(item.value) === plain(details.city)) : undefined;
    const byAddress = byTown ?? [...cities].sort((a, b) => b.value.length - a.value.length)
      .find((item) => new RegExp(`(^|[^a-z])${plain(item.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(plain(details.address)));
    const found: Partial<Record<keyof typeof form, string>> = {
      website: details.website, name: details.name, industry: details.industry, address: details.address, cityId: byAddress ? String(byAddress.id) : "",
    };
    const filled: Partial<Record<keyof typeof form, string>> = {};
    const next = { ...form };
    for (const key of Object.keys(found) as (keyof typeof form)[]) {
      const value = found[key];
      if (!value) continue;
      // The website itself is always tidied; the name only for a new company (an edit keeps its name).
      if (key === "name" && organization) continue;
      if (key !== "website" && next[key].trim() && next[key] !== autoFilled[key]) continue;
      next[key] = value;
      filled[key] = value;
    }
    setForm(next);
    if (filled.name) setIsNew(false);
    setAutoFilled((current) => ({ ...current, ...filled }));
    const labels: Record<string, string> = { name: "name", industry: "industry", cityId: "city", address: details.addressSource === "google" ? "address (from Google Maps)" : "address" };
    const got = (Object.keys(filled) as string[]).filter((key) => labels[key]).map((key) => labels[key]);
    const missing = ["name", "cityId", "address"].filter((key) => !found[key as keyof typeof form]).map((key) => labels[key]);
    const cityNote = details.city && !byAddress ? ` The city ${details.city} is not in the City list.` : "";
    // What the website did not give is shown apart, in red; not the industry, which is a guess and often left empty.
    setFetched({
      tone: "ok",
      text: got.length ? `Filled from the website: ${got.join(", ")}.` : "Nothing new filled from the website.",
      missing: [missing.length ? `Not found: ${missing.join(", ")}.` : "", cityNote.trim()].filter(Boolean).join(" "),
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization && exists) { setError(`${exists.name} is already a company: pick it in the list to open it.`); return; }
    setSaving(true);
    setError("");
    const input = { name: form.name, industry: form.industry, companySizeId: form.companySizeId ? Number(form.companySizeId) : null, cityId: form.cityId ? Number(form.cityId) : null, address: form.address, website: form.website };
    try {
      const result = organization ? await updateOrganization(organization.id, input) : await createOrganization(input);
      onSaved(result.organization);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the company."));
      setSaving(false);
    }
  };

  return (
    <Dialog title={organization ? `Edit ${organization.name}` : "Add company"} eyebrow={organization ? "COMPANY" : undefined} onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Name" required wide hint={organization ? undefined : isNew ? "A new company." : "Start typing: the companies that exist are listed. Pick one to open it, or add the name as a new company."}>
          {organization
            ? <input value={form.name} onChange={set("name")} required maxLength={200} placeholder="Company name" autoFocus />
            : <SuggestInput
                value={form.name} onChange={(value) => { setForm((current) => ({ ...current, name: value })); setIsNew(false); setError(""); }}
                suggestions={found.map((row) => ({ key: String(row.id), label: row.name, detail: [row.city, "already exists: open it"].filter(Boolean).join(" · "), icon: <Building2 size={14} /> }))}
                onPick={(suggestion) => { onClose(); openContact("organization", Number(suggestion.key)); }}
                loading={typed.length >= 2 && matches?.q !== typed}
                icon={<Building2 size={16} />}
                create={typed.length >= 2 && matches?.q === typed && !exists ? { label: `Add '${typed}' as new company`, onCreate: () => setIsNew(true) } : null}
                isNew={isNew} onClear={() => { setForm((current) => ({ ...current, name: "" })); setIsNew(false); }}
                required maxLength={200} placeholder="Company" autoFocus
              />}
        </Field>
        <Field label="Website" wide hint={fetched || abroad ? undefined : "Fetch reads the company's name, industry, city and address from its website."}>
          <div className="website-fetch">
            <input
              type="text" inputMode="url" value={form.website} maxLength={2048} placeholder="https://company.com"
              onChange={(event) => { set("website")(event); setFetched(null); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void fetchWebsite(); } }}
              onBlur={() => { const value = form.website.trim(); if (value && !/^https?:\/\//i.test(value) && /^[\w-]+(\.[\w-]+)+/.test(value)) setForm((current) => ({ ...current, website: `https://${value}` })); }}
            />
            <button type="button" className="button button-outline website-fetch-button" onClick={() => void fetchWebsite()} disabled={fetching} aria-label="Fetch company details from the website" title="Fetch company details from the website">
              {fetching ? <LoaderCircle size={16} className="spin" /> : <DownloadCloud size={16} />} {fetching ? "Fetching..." : "Fetch"}
            </button>
          </div>
          {fetched && <small className={`website-fetch-note ${fetched.tone === "error" ? "is-error" : ""}`} role="status">{fetched.text}{fetched.missing && <> <span className="website-fetch-missing">{fetched.missing}</span></>}</small>}
          {abroad && (
            <div className="website-abroad" role="alertdialog" aria-label="Company outside Canada">
              <TriangleAlert size={18} aria-hidden="true" />
              <div>
                <strong>{abroad.name || "This company"} appears to be outside Canada, in {abroad.country}.</strong>
                <p>{abroad.address ? `Address found: ${abroad.address}. ` : ""}Are you sure you want to add this company?</p>
                <div className="website-abroad-actions">
                  <button type="button" className="button button-primary button-small" onClick={() => { const details = abroad; setAbroad(null); fillFrom(details); }}>Yes, fill in the details</button>
                  <button type="button" className="button button-outline button-small" onClick={() => { setAbroad(null); setFetched({ tone: "error", text: `Not filled: the company is in ${abroad.country}.` }); }}>No</button>
                </div>
              </div>
            </div>
          )}
        </Field>
        <Field label="Industry"><input value={form.industry} onChange={set("industry")} maxLength={120} placeholder="e.g. Healthcare" /></Field>
        <Field label="Company size">
          <select value={form.companySizeId} onChange={set("companySizeId")}><option value="">Not set</option>{reference.listValues.company_size.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        </Field>
        <Field label="City" wide>
          <select value={form.cityId} onChange={set("cityId")}><option value="">Not set</option>{reference.listValues.city.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}</select>
        </Field>
        <Field label="Address" wide><input value={form.address} onChange={set("address")} maxLength={500} placeholder="Street and location" /></Field>
        {organization && <p className="dialog-description field-wide">These details are shown on every deal of this company.</p>}
        <div className="field-wide"><ErrorText message={error} /></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{organization ? <Save size={15} /> : <Plus size={15} />} {saving ? "Saving..." : organization ? "Save changes" : "Save company"}</button>
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
  const { openContact } = useApp();
  const [suggestions, setSuggestions] = useState<OrganizationRow[]>([]);
  // The contacts of the organization chosen (request of November 18, 2026): a name already there opens that contact,
  // "+ Add 'Ana' as new person" marks the name NEW and the person is added inside the organization.
  const [orgPeople, setOrgPeople] = useState<PersonRow[]>([]);
  const [newPerson, setNewPerson] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // PD-15 / PD-17: the organization name that is new and waits for the user's confirmation.
  const [confirmNew, setConfirmNew] = useState<string | null>(null);
  // "+ Add 'Acme' as new organization" picked from the list: the new organization is confirmed already (NEW badge).
  const [newOrganization, setNewOrganization] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  // Organizations that match what is being typed, offered as suggestions.
  const typed = fixedOrganization ? "" : form.organizationName.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchOrganizations(typed, 1).then((page) => { if (!cancelled) setSuggestions(page.rows.slice(0, 12)); }).catch(() => { /* suggestions are optional */ });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typed]);

  // The organization named exactly, when it exists: its contacts are looked up for the name.
  const chosenOrg = person ? null : suggestions.find((row) => contactKey(row.name) === contactKey(form.organizationName)) ?? null;
  const chosenOrgId = chosenOrg?.id ?? null;
  useEffect(() => {
    if (!chosenOrgId) return;
    let cancelled = false;
    fetchOrganization(chosenOrgId).then((detail) => { if (!cancelled) setOrgPeople(detail.people); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [chosenOrgId]);
  const people = chosenOrgId ? orgPeople : [];
  const typedName = person || newPerson ? "" : form.name.trim();
  const sameName = people.find((item) => contactKey(item.name) === contactKey(typedName)) ?? null;
  const organizationGiven = Boolean(fixedOrganization || form.organizationName.trim());

  const save = async (createOrganization: boolean) => {
    setSaving(true);
    setError("");
    const input = { name: form.name, organizationName: form.organizationName, emails: form.emails.split(/[,;\s]+/).filter(Boolean), phone: form.phone, altPhone: form.altPhone, remark: form.remark, createOrganization: createOrganization || newOrganization };
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
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!person && sameName) { setError(`${sameName.name} is already a contact of ${form.organizationName.trim()}: pick the name in the list to open it.`); return; }
    void save(false);
  };

  return (
    <Dialog title={person ? `Edit ${person.name}` : "Add contact"} eyebrow={person ? "CONTACT" : undefined} onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Company" required wide hint={fixedOrganization ? (person ? "They have deals with this company, so they stay there. Someone who changed employer is added as a new contact at the new company." : undefined) : "Start typing the company's name: the companies that match appear in a list. Pick one, or keep typing a new name (you are asked before it is created)."}>
          {fixedOrganization
            ? <input value={form.organizationName} maxLength={200} disabled required />
            : <SuggestInput
                value={form.organizationName} onChange={(value) => { setForm((current) => ({ ...current, organizationName: value })); setConfirmNew(null); setNewOrganization(false); }}
                suggestions={typed.length >= 2 ? suggestions.map((row) => ({ key: String(row.id), label: row.name, icon: <Building2 size={14} /> })) : []} onPick={(suggestion) => { setForm((current) => ({ ...current, organizationName: suggestion.label })); setConfirmNew(null); setNewOrganization(false); }}
                icon={<Building2 size={16} />}
                create={typed.length >= 2 && !suggestions.some((row) => contactKey(row.name) === contactKey(typed)) ? { label: `Add '${typed}' as new company`, onCreate: () => { setNewOrganization(true); setConfirmNew(null); } } : null}
                isNew={newOrganization} onClear={() => { setForm((current) => ({ ...current, organizationName: "" })); setNewOrganization(false); }}
                maxLength={200} placeholder="Company" required
              />}
        </Field>
        <Field label="Name" required wide hint={person ? undefined : newPerson ? "A new person, added inside the company." : organizationGiven ? "Start typing: the company's contacts are listed. Pick one to open it, or add the name as a new person." : "Choose the company first: the person is added inside it."}>
          {person
            ? <input value={form.name} onChange={set("name")} required maxLength={160} placeholder="Contact person" autoFocus />
            : <SuggestInput
                value={form.name} onChange={(value) => { setForm((current) => ({ ...current, name: value })); setNewPerson(false); setError(""); }}
                suggestions={people.filter((item) => !typedName || contactKey(item.name).includes(contactKey(typedName))).map((item) => ({ key: String(item.id), label: item.name, detail: [item.email, "already a contact: open it"].filter(Boolean).join(" · "), icon: <UserRound size={14} /> }))}
                onPick={(suggestion) => { onClose(); openContact("person", Number(suggestion.key)); }}
                minChars={chosenOrgId ? 0 : 2} disabled={!organizationGiven}
                icon={<UserRound size={16} />}
                create={organizationGiven && typedName.length >= 2 && !sameName ? { label: `Add '${typedName}' as new person`, onCreate: () => setNewPerson(true) } : null}
                isNew={newPerson} onClear={() => { setForm((current) => ({ ...current, name: "" })); setNewPerson(false); }}
                required maxLength={160} placeholder={organizationGiven ? "Person" : "Choose the company first"}
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
              <p><strong>{confirmNew}</strong> is not a company yet. Create it and file the contact there?</p>
              <div className="duplicate-actions"><button type="button" className="button button-primary button-small" disabled={saving} onClick={() => void save(true)}>Create company and save</button></div>
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
