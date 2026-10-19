"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading } from "@/features/shell/components";
import type { TargetTemplate, TargetTemplateInput } from "@/features/targets/model";
import { stageLabels, userStages, type UserStage } from "@/features/users/model";
import { fetchUsers } from "@/features/users/client";
import type { UserAccount } from "@/features/users/model";
import { assignTargetTemplate, createTargetTemplate, fetchTargetTemplates, updateTargetTemplate } from "./client";

const numberFields: { key: keyof Omit<TargetTemplateInput, "name" | "stage">; label: string }[] = [
  { key: "dailyLeads", label: "Leads per day" }, { key: "weeklyLeads", label: "Leads per week" }, { key: "dailyVisits", label: "Road visits per day" },
  { key: "weeklyVisits", label: "Road visits per week" }, { key: "monthlyConversions", label: "Conversions per month" },
];

export default function TargetsPanel() {
  const { notify, refreshReference, roleLabel } = useApp();
  const fetcher = useCallback(async () => {
    const [templateResult, userResult] = await Promise.all([fetchTargetTemplates(), fetchUsers()]);
    return { templates: templateResult.templates, users: userResult.users.filter((user) => user.active && user.role !== "recruiter") };
  }, []);
  const { data, error, reload } = useAsyncData<{ templates: TargetTemplate[]; users: UserAccount[] }>(fetcher);
  const templates = data?.templates ?? null;
  const users = data?.users ?? [];
  const [dialog, setDialog] = useState<{ template?: TargetTemplate } | null>(null);
  const [assignTemplate, setAssignTemplate] = useState("");
  const [assignUsers, setAssignUsers] = useState<number[]>([]);

  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignTemplate || !assignUsers.length) { notify("Choose a template and at least one person.", "error"); return; }
    try {
      await assignTargetTemplate(Number(assignTemplate), assignUsers);
      setAssignUsers([]);
      reload();
      await refreshReference();
      notify("Target template assigned");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">ADMINISTRATION</div><h1>Targets & templates</h1><p>Daily and weekly lead targets, minimum road visits, and monthly conversions per productivity stage.</p></div>
        <button className="button button-primary" onClick={() => setDialog({})}><Plus size={17} /> New template</button>
      </div>
      <ErrorText message={error} />
      {!templates && !error && <Loading />}
      {templates && (
        <>
          <section className="panel team-panel">
            <div className="table-scroll">
              <table className="lead-table team-table">
                <thead><tr><th>TEMPLATE</th><th>STAGE</th>{numberFields.map((field) => <th key={field.key}>{field.label.toUpperCase()}</th>)}<th>ASSIGNED TO</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td><strong>{template.name}</strong></td>
                      <td>{stageLabels[template.stage]}</td>
                      {numberFields.map((field) => <td key={field.key}>{template[field.key]}</td>)}
                      <td><span className="muted-cell">{users.filter((user) => user.targetTemplateId === template.id).map((user) => user.name).join(", ") || `Default for ${stageLabels[template.stage].toLowerCase()} stage`}</span></td>
                      <td><button className="text-button" onClick={() => setDialog({ template })}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel assign-panel">
            <div className="panel-heading"><div><h2>Assign a template</h2><p>People without an explicit assignment use the first template for their stage.</p></div></div>
            <form className="assign-form" onSubmit={assign}>
              <Field label="Template"><select value={assignTemplate} onChange={(event) => setAssignTemplate(event.target.value)} required><option value="">Choose a template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
              <fieldset className="user-privileges"><legend>People</legend>
                {users.map((user) => <label key={user.id}><input type="checkbox" checked={assignUsers.includes(user.id)} onChange={(event) => setAssignUsers((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />{user.name} <small>· {roleLabel(user.role)} · {stageLabels[user.stage]}</small></label>)}
              </fieldset>
              <div className="modal-actions"><button className="button button-primary" type="submit"><Save size={15} /> Assign</button></div>
            </form>
          </section>
        </>
      )}
      {dialog && (
        <TemplateDialog template={dialog.template} onClose={() => setDialog(null)} onSaved={async (message) => { setDialog(null); reload(); await refreshReference(); notify(message); }} />
      )}
    </>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template?: TargetTemplate; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [form, setForm] = useState<TargetTemplateInput>(template ? { ...template } : { name: "", stage: "onboarding", dailyLeads: 2, weeklyLeads: 10, dailyVisits: 1, weeklyVisits: 4, monthlyConversions: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (template) await updateTargetTemplate(template.id, form); else await createTargetTemplate(form);
      await onSaved(template ? "Template updated" : "Template created");
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog title={template ? `Edit ${template.name}` : "New target template"} eyebrow="TARGETS" onClose={onClose}>
      <form className="lead-form" onSubmit={submit}>
        <Field label="Template name" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={80} autoFocus /></Field>
        <Field label="Stage" required><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value as UserStage })}>{userStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></Field>
        {numberFields.map((field) => <Field key={field.key} label={field.label}><input type="number" min={0} max={100000} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: Number(event.target.value) })} required /></Field>)}
        <ErrorText message={error} />
        <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Save template"}</button></div>
      </form>
    </Dialog>
  );
}
