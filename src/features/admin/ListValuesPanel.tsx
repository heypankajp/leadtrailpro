"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { listKeyLabels, listKeys, type ListKey, type ListValue, type ListValuesByKey } from "@/features/list-values/model";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Loading } from "@/features/shell/components";
import { createListValue, fetchListValues, reorderListValues, updateListValue } from "./client";

export default function ListValuesPanel() {
  const { notify, refreshReference } = useApp();
  const [listKey, setListKey] = useState<ListKey>("bd_action");
  const fetcher = useCallback(() => fetchListValues(true).then((result) => result.listValues), []);
  const { data: values, error, reload } = useAsyncData<ListValuesByKey>(fetcher);
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);

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

  const current = values?.[listKey] ?? [];

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>List of values</h1><p>Maintain the dropdown values used across leads. Renames update every existing record; deactivate instead of deleting values that are in use.</p></div></div>
      <div className="values-layout">
        <nav className="panel values-nav" aria-label="Lists">
          {listKeys.map((key) => <button key={key} className={key === listKey ? "is-active" : ""} onClick={() => { setListKey(key); setEditing(null); }}>{listKeyLabels[key]}<span>{values ? values[key].length : ""}</span></button>)}
        </nav>
        <section className="panel values-panel">
          <div className="panel-heading"><div><h2>{listKeyLabels[listKey]}</h2><p>{current.filter((item) => item.active).length} active · {current.filter((item) => !item.active).length} inactive</p></div></div>
          <form className="values-add" onSubmit={add}><input value={newValue} onChange={(event) => setNewValue(event.target.value)} maxLength={120} placeholder={`New ${listKeyLabels[listKey].toLowerCase()} value`} required /><button className="button button-primary button-small" type="submit"><Plus size={14} /> Add value</button></form>
          <ErrorText message={error} />
          {!values && !error && <Loading />}
          {values && (
            <div className="table-scroll">
              <table className="lead-table values-table">
                <thead><tr><th>ORDER</th><th>VALUE</th><th>CODE</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
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
                      <td><span className={`badge ${value.active ? "badge-on" : "badge-off"}`}>{value.active ? "Active" : "Inactive"}</span></td>
                      <td><span className="row-actions"><button className="icon-button" aria-label={`Rename ${value.value}`} title="Rename" onClick={() => setEditing({ id: value.id, value: value.value })}><Pencil size={14} /></button><button className="text-button" onClick={() => void toggle(value)}>{value.active ? "Deactivate" : "Activate"}</button></span></td>
                    </tr>
                  ))}
                  {!current.length && <tr><td colSpan={5} className="empty-state">No values yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
