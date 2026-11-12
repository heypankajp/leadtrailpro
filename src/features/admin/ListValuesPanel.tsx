"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { entryStageCode, fixedListKeys, listKeyLabels, listKeys, statusCodes, type ListKey, type ListValue, type ListValuesByKey } from "@/features/list-values/model";
import { recomputeStages } from "@/features/pipeline/client";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Loading } from "@/features/shell/components";
import { createListValue, fetchListValues, reorderListValues, updateListValue } from "./client";

export default function ListValuesPanel() {
  const { notify, refreshReference } = useApp();
  const [listKey, setListKey] = useState<ListKey>("bd_action");
  const fetcher = useCallback(() => fetchListValues(true).then((result) => result.listValues), []);
  const { data: values, error, reload } = useAsyncData<ListValuesByKey>(fetcher);
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  const [recomputeOpen, setRecomputeOpen] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const after = async (message: string) => {
    reload();
    await refreshReference();
    notify(message);
  };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createListValue(listKey, newValue);
      setNewValue("");
      await after(`Added "${newValue.trim()}" to ${listKeyLabels[listKey]}`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const rename = async () => {
    if (!editing) return;
    try {
      await updateListValue(editing.id, { value: editing.value });
      setEditing(null);
      await after("Value renamed. Existing leads now show the new name.");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const toggle = async (value: ListValue) => {
    try {
      await updateListValue(value.id, { active: !value.active });
      await after(value.active ? `"${value.value}" deactivated (kept on existing leads)` : `"${value.value}" reactivated`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!values) return;
    const list = [...values[listKey]];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    try {
      await reorderListValues(listKey, list.map((item) => item.id));
      reload();
      await refreshReference();
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  /** PIPE-03: the stage a BD action lands a lead in. */
  const setStage = async (value: ListValue, stageId: number | null) => {
    try {
      await updateListValue(value.id, { stageId });
      const stage = stageId ? values?.stage.find((item) => item.id === stageId) : null;
      await after(stage ? `"${value.value}" now lands leads in ${stage.value}` : `"${value.value}" no longer maps to a stage (counts as Contact Made)`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const recompute = async () => {
    setRecomputing(true);
    try {
      const { count } = await recomputeStages();
      setRecomputeOpen(false);
      notify(`${count} ${count === 1 ? "lead" : "leads"} placed again from their BD actions`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setRecomputing(false);
    }
  };

  const current = values?.[listKey] ?? [];
  const stages = values?.stage.filter((item) => item.active) ?? [];
  const fixed = fixedListKeys.includes(listKey);
  const locked = (value: ListValue) => fixed || (value.listKey === "status" && statusCodes.includes(value.code as (typeof statusCodes)[number])) || (value.listKey === "stage" && value.code === entryStageCode);

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>List of values</h1><p>Maintain the dropdown values used across leads. Renames update every existing record; deactivate instead of deleting values that are in use.</p></div></div>
      <div className="values-layout">
        <nav className="panel values-nav" aria-label="Lists">
          {listKeys.map((key) => <button key={key} className={key === listKey ? "is-active" : ""} onClick={() => { setListKey(key); setEditing(null); }}>{listKeyLabels[key]}<span>{values ? values[key].length : ""}</span></button>)}
        </nav>
        <section className="panel values-panel">
          <div className="panel-heading"><div><h2>{listKeyLabels[listKey]}</h2><p>{current.filter((item) => item.active).length} active · {current.filter((item) => !item.active).length} inactive</p></div></div>
          {listKey === "stage" && <p className="field-hint values-fixed-note">Leads move through these stages, in this order, on the Pipeline board. New Deal is the entry stage and cannot be deactivated.</p>}
          {listKey === "bd_action" && (
            <div className="values-stage-note">
              <p className="field-hint">Each BD action lands a lead in a pipeline stage; recording an action from a later stage moves the lead forward. An action with no stage counts as Contact Made.</p>
              <button className="button button-outline button-small" onClick={() => setRecomputeOpen(true)}><RefreshCw size={13} /> Recompute stages from BD actions</button>
            </div>
          )}
          {fixed
            ? <p className="field-hint values-fixed-note">These values are fixed by the requirement: rename them if needed, but they cannot be added to or deactivated.</p>
            : <form className="values-add" onSubmit={add}><input value={newValue} onChange={(event) => setNewValue(event.target.value)} maxLength={120} placeholder={`New ${listKeyLabels[listKey].toLowerCase()} value`} required /><button className="button button-primary button-small" type="submit"><Plus size={14} /> Add value</button></form>}
          <ErrorText message={error} />
          {!values && !error && <Loading />}
          {values && (
            <div className="table-scroll">
              <table className="lead-table values-table">
                <thead><tr><th>ORDER</th><th>VALUE</th><th>CODE</th>{listKey === "bd_action" && <th>STAGE</th>}<th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {current.map((value, index) => (
                    <tr key={value.id} className={value.active ? "" : "row-inactive"}>
                      <td><span className="order-controls"><button className="icon-button" aria-label="Move up" disabled={index === 0} onClick={() => void move(index, -1)}><ArrowUp size={13} /></button><button className="icon-button" aria-label="Move down" disabled={index === current.length - 1} onClick={() => void move(index, 1)}><ArrowDown size={13} /></button></span></td>
                      <td>
                        {editing?.id === value.id ? (
                          <span className="inline-edit"><input value={editing.value} onChange={(event) => setEditing({ id: value.id, value: event.target.value })} maxLength={120} autoFocus onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void rename(); } if (event.key === "Escape") setEditing(null); }} /><button className="icon-button" aria-label="Save" onClick={() => void rename()}><Check size={13} /></button><button className="icon-button" aria-label="Cancel" onClick={() => setEditing(null)}><X size={13} /></button></span>
                        ) : <strong>{value.value}</strong>}
                      </td>
                      <td><span className="muted-cell">{value.code}</span></td>
                      {listKey === "bd_action" && (
                        <td>
                          <select className="inline-select" aria-label={`Stage for ${value.value}`} value={value.stageId ?? ""} onChange={(event) => void setStage(value, event.target.value ? Number(event.target.value) : null)}>
                            <option value="">Not mapped</option>
                            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.value}</option>)}
                          </select>
                        </td>
                      )}
                      <td><span className={`badge ${value.active ? "badge-on" : "badge-off"}`}>{value.active ? "Active" : "Inactive"}</span></td>
                      <td><span className="row-actions"><button className="icon-button" aria-label={`Rename ${value.value}`} title="Rename" onClick={() => setEditing({ id: value.id, value: value.value })}><Pencil size={14} /></button>{!locked(value) && <button className="text-button" onClick={() => void toggle(value)}>{value.active ? "Deactivate" : "Activate"}</button>}</span></td>
                    </tr>
                  ))}
                  {!current.length && <tr><td colSpan={listKey === "bd_action" ? 6 : 5} className="empty-state">No values yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {recomputeOpen && (
        <Dialog title="Recompute stages from BD actions" eyebrow="PIPELINE" size="narrow" onClose={() => setRecomputeOpen(false)}>
          <p className="dialog-description">Every lead is placed again in the stage of its BD action through the mapping above; a lead with no BD action goes to New Deal. Moves made by hand on the board are replaced. No timeline entries are written.</p>
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={() => setRecomputeOpen(false)}>Cancel</button>
            <button type="button" className="button button-primary" disabled={recomputing} onClick={() => void recompute()}>{recomputing ? "Working..." : "Recompute stages"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
