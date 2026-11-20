"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field } from "@/features/shell/components";
import { entryStageCode } from "@/features/list-values/model";
import { addStage, deleteStage, moveStage, renameStage } from "./client";
import type { PipelineStage } from "./model";

// "Edit pipeline" on the board (PD-21, SPEC §10.19): Sales Managers and Admins rename a stage in place, move it a place
// left or right, delete it (its deals go to another stage), and add one at the end. Changes reach everyone's board.

/** The head of a column while the pipeline is being edited. `onChanged` reloads the stages everywhere. */
export function EditableStageHead({ stage, first, last, others, onChanged }: { stage: PipelineStage; first: boolean; last: boolean; others: PipelineStage[]; onChanged: (message: string) => Promise<void> }) {
  const { notify } = useApp();
  const [name, setName] = useState(stage.value);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    try { await onChanged(await work()); } catch (caught) { notify(errorMessage(caught), "error"); setName(stage.value); } finally { setBusy(false); }
  };
  const save = () => { const next = name.trim(); if (next && next !== stage.value) void act(async () => { await renameStage(stage.id, next); return `Stage renamed to ${next}`; }); else setName(stage.value); };
  return (
    <header className="pipeline-column-head stage-edit-head">
      <input aria-label={`Stage name ${stage.value}`} value={name} maxLength={120} disabled={busy} onChange={(event) => setName(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); } if (event.key === "Escape") setName(stage.value); }} />
      <div className="stage-edit-actions">
        <button type="button" className="icon-button" aria-label={`Move ${stage.value} left`} title="Move left" disabled={busy || first} onClick={() => void act(async () => { await moveStage(stage.id, "left"); return `${stage.value} moved left`; })}><ChevronLeft size={15} /></button>
        <button type="button" className="icon-button" aria-label={`Move ${stage.value} right`} title="Move right" disabled={busy || last} onClick={() => void act(async () => { await moveStage(stage.id, "right"); return `${stage.value} moved right`; })}><ChevronRight size={15} /></button>
        {stage.code !== entryStageCode && <button type="button" className="icon-button stage-delete" aria-label={`Delete ${stage.value}`} title="Delete stage" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={14} /></button>}
        <span className="stage-edit-count">{stage.count} {stage.count === 1 ? "deal" : "deals"}</span>
      </div>
      {deleting && <DeleteStageDialog stage={stage} others={others} onClose={() => setDeleting(false)} onDeleted={async (message) => { setDeleting(false); await onChanged(message); }} />}
    </header>
  );
}

function DeleteStageDialog({ stage, others, onClose, onDeleted }: { stage: PipelineStage; others: PipelineStage[]; onClose: () => void; onDeleted: (message: string) => Promise<void> }) {
  const [moveTo, setMoveTo] = useState(others[0] ? String(others[0].id) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The count on the board follows its filters; the server moves every deal of the stage, archived ones too.
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await deleteStage(stage.id, moveTo ? Number(moveTo) : null);
      const target = others.find((item) => String(item.id) === moveTo)?.value;
      await onDeleted(result.moved ? `${stage.value} deleted; ${result.moved === 1 ? "its deal" : `its ${result.moved} deals`} moved to ${target}` : `${stage.value} deleted`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Delete ${stage.value}?`} eyebrow="PIPELINE STAGE" size="narrow" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <p className="dialog-description">The stage goes from everyone&apos;s board. Its deals, archived ones included, move to the stage you choose, with an entry on each deal&apos;s timeline. BD actions that led to it lead to that stage instead.</p>
        <Field label="Move Its Deals to" required>
          <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} required>
            {others.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
          </select>
        </Field>
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-danger" disabled={busy || !moveTo}>{busy ? "Deleting..." : "Delete Stage"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** "+ Stage" at the end of the board while it is being edited. */
export function AddStageColumn({ pipelineId, onChanged }: { pipelineId: number | null; onChanged: (message: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      await addStage(next, pipelineId);
      setName("");
      await onChanged(`Stage ${next} added`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pipeline-column stage-add-column" aria-label="Add a stage">
      <form className="stage-add-form" onSubmit={submit}>
        <input aria-label="New stage name" placeholder="New stage name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        <button type="submit" className="button button-outline button-small" disabled={busy || !name.trim()}><Plus size={14} /> Stage</button>
        <ErrorText message={error} />
      </form>
    </section>
  );
}
