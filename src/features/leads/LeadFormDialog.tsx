"use client";

import { useState, type FormEvent } from "react";
import { Plus, Save, ShieldCheck } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { reasonListFor } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import { createLead, updateLead } from "./client";
import type { LeadInput, LeadSummary } from "./model";

type Props = { lead?: LeadSummary; onClose: () => void; onSaved: (lead: LeadSummary) => void };

type FormState = {
  clientName: string; companyUrl: string; address: string; comments: string; clientExecutive: string; contactPhone: string; contactAltPhone: string; contactRemark: string;
  clientEmails: string; industry: string; positions: string; leadTypeId: string; statusId: string; statusReasonId: string; bdActionId: string; clientResponseId: string; leadCategoryId: string;
  companySizeId: string; cityId: string; firstContactDate: string; followUpDate: string; contractSignedDate: string; ownerId: string;
};

/** Add or edit a lead with every field from BRD section 6 except files and notes (those live on the lead itself). */
export default function LeadFormDialog({ lead, onClose, onSaved }: Props) {
  const { reference, can, user } = useApp();
  const values = reference.listValues;
  const defaultStatus = values.status.find((item) => item.code === "cold") ?? values.status[0];
  const [form, setForm] = useState<FormState>(() => lead ? {
    clientName: lead.clientName, companyUrl: lead.companyUrl, address: lead.address, comments: lead.comments, clientExecutive: lead.clientExecutive, contactPhone: lead.contactPhone,
    contactAltPhone: lead.contactAltPhone, contactRemark: lead.contactRemark, clientEmails: lead.clientEmails.join(", "), industry: lead.industry, positions: lead.positions,
    leadTypeId: String(lead.leadTypeId), statusId: String(lead.statusId), statusReasonId: lead.statusReasonId ? String(lead.statusReasonId) : "", bdActionId: lead.bdActionId ? String(lead.bdActionId) : "", clientResponseId: lead.clientResponseId ? String(lead.clientResponseId) : "",
    leadCategoryId: lead.leadCategoryId ? String(lead.leadCategoryId) : "", companySizeId: lead.companySizeId ? String(lead.companySizeId) : "", cityId: lead.cityId ? String(lead.cityId) : "",
    firstContactDate: lead.firstContactDate, followUpDate: lead.followUpDate ?? "", contractSignedDate: lead.contractSignedDate ?? "", ownerId: String(lead.ownerId),
  } : {
    clientName: "", companyUrl: "", address: "", comments: "", clientExecutive: "", contactPhone: "", contactAltPhone: "", contactRemark: "", clientEmails: "", industry: "", positions: "",
    leadTypeId: values.lead_type[0] ? String(values.lead_type[0].id) : "", statusId: defaultStatus ? String(defaultStatus.id) : "", statusReasonId: "", bdActionId: "", clientResponseId: "", leadCategoryId: "",
    companySizeId: "", cityId: "", firstContactDate: reference.today, followUpDate: "", contractSignedDate: "", ownerId: String(user.id),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const idOrNull = (value: string) => (value ? Number(value) : null);
  const yesterday = (() => { const [y, m, d] = reference.today.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d - 1)); return date.toISOString().slice(0, 10); })();
  const historical = Boolean(form.firstContactDate && form.firstContactDate < yesterday);
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  // LEAD-06: Lost Lead and Disqualified need a reason from their own list; other statuses clear it.
  const reasonKey = reasonListFor(values.status.find((item) => String(item.id) === form.statusId)?.code);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const input: LeadInput = {
      clientName: form.clientName, companyUrl: form.companyUrl, address: form.address, comments: form.comments, clientExecutive: form.clientExecutive, contactPhone: form.contactPhone,
      contactAltPhone: form.contactAltPhone, contactRemark: form.contactRemark, clientEmails: form.clientEmails.split(/[,;\s]+/).filter(Boolean), industry: form.industry, positions: form.positions,
      leadTypeId: Number(form.leadTypeId), statusId: Number(form.statusId), statusReasonId: reasonKey ? idOrNull(form.statusReasonId) : null, bdActionId: idOrNull(form.bdActionId), clientResponseId: idOrNull(form.clientResponseId),
      leadCategoryId: idOrNull(form.leadCategoryId), companySizeId: idOrNull(form.companySizeId), cityId: idOrNull(form.cityId),
      firstContactDate: form.firstContactDate, followUpDate: form.followUpDate || null, contractSignedDate: form.contractSignedDate || null,
    };
    try {
      const result = lead ? await updateLead(lead.id, input) : await createLead({ ...input, ownerId: can("reassign_leads") ? Number(form.ownerId) : null });
      onSaved(result.lead);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the lead."));
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
    <Dialog title={lead ? `Edit ${lead.clientName}` : "Add a new lead"} eyebrow={lead ? "LEAD DETAILS" : "YOUR PIPELINE"} onClose={onClose} size="wide">
      <form className="lead-form" onSubmit={submit}>
        <Field label="Client name" required wide><input value={form.clientName} onChange={set("clientName")} required maxLength={200} placeholder="Company or client name" autoFocus /></Field>
        <Field label="Lead type" required>{select("leadTypeId", values.lead_type, "")}</Field>
        <Field label="Status" required>
          <select value={form.statusId} onChange={(event) => setForm((current) => ({ ...current, statusId: event.target.value, statusReasonId: "" }))}>
            {values.status.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        {reasonKey && (
          <Field label="Status reason" required hint="Shown with the status everywhere as \u201cStatus \u2013 Reason\u201d.">
            <select value={form.statusReasonId} onChange={set("statusReasonId")} required>
              <option value="">Choose a reason</option>
              {values[reasonKey].map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
            </select>
          </Field>
        )}
        <Field label="First contact date" required hint={historical ? (can("review_queued") ? "Historical date: saved directly because you can approve queued leads." : "Earlier than yesterday: the lead will be queued for Admin approval.") : undefined}>
          <input type="date" value={form.firstContactDate} onChange={set("firstContactDate")} required />
        </Field>
        <Field label="Follow-up date"><input type="date" value={form.followUpDate} onChange={set("followUpDate")} /></Field>
        {!lead && can("reassign_leads") && (
          <Field label="Owner" hint="The creator becomes the owner unless you choose someone else."><select value={form.ownerId} onChange={set("ownerId")}>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        )}
        <Field label="BD action">{select("bdActionId", values.bd_action)}</Field>
        <Field label="Client response">{select("clientResponseId", values.client_response)}</Field>
        <Field label="Lead category">{select("leadCategoryId", values.lead_category)}</Field>
        <Field label="Company size">{select("companySizeId", values.company_size)}</Field>
        <Field label="City">{select("cityId", values.city)}</Field>
        <Field label="Client industry"><input value={form.industry} onChange={set("industry")} maxLength={120} placeholder="e.g. Healthcare" /></Field>
        <Field label="Address" wide><input value={form.address} onChange={set("address")} maxLength={500} placeholder="Street and location" /></Field>
        <Field label="Client executive"><input value={form.clientExecutive} onChange={set("clientExecutive")} maxLength={160} placeholder="Contact person" /></Field>
        <Field label="Client email(s)" hint="Separate several addresses with commas."><input value={form.clientEmails} onChange={set("clientEmails")} placeholder="name@company.com" /></Field>
        <Field label="Contact number"><input type="tel" value={form.contactPhone} onChange={set("contactPhone")} maxLength={40} placeholder="+1 (555) 123-4567" /></Field>
        <Field label="Extension or alternate number"><input type="tel" value={form.contactAltPhone} onChange={set("contactAltPhone")} maxLength={40} /></Field>
        <Field label="Contact remark" wide><input value={form.contactRemark} onChange={set("contactRemark")} maxLength={500} placeholder="Best time to call, preferences..." /></Field>
        <Field label="Company website" wide><input type="url" value={form.companyUrl} onChange={set("companyUrl")} pattern="https?://.+" title="Enter a URL beginning with http:// or https://" placeholder="https://company.com" /></Field>
        <Field label="Position(s)" wide><textarea value={form.positions} onChange={set("positions")} rows={2} maxLength={5000} placeholder="Open or target positions" /></Field>
        <Field label="Contract signed date"><input type="date" value={form.contractSignedDate} onChange={set("contractSignedDate")} /></Field>
        <Field label="Comments" wide><textarea value={form.comments} onChange={set("comments")} rows={3} maxLength={5000} placeholder="General comments" /></Field>
        {!lead && <div className="form-note"><ShieldCheck size={14} /> Interaction notes, documents, and candidate profiles are added from the lead page after saving.</div>}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{lead ? <Save size={15} /> : <Plus size={15} />} {saving ? "Saving..." : lead ? "Save changes" : "Save lead"}</button>
        </div>
      </form>
    </Dialog>
  );
}
