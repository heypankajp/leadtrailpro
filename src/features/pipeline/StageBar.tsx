"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText } from "@/features/shell/components";
import type { LeadSummary } from "@/features/leads/model";
import type { Task } from "@/features/tasks/model";
import { moveLeadToStage } from "./client";
import { stagesOfPipeline } from "./model";

type Props = {
  lead: { id: number; clientName: string; stageId: number | null; recordState: string };
  canMove: boolean;
  /** `lead` is the deal as saved, in its new stage. */
  onMoved: (message: string, task: Task | null, lead: LeadSummary) => void;
};

/**
 * PIPE-11: the stages in board order across the top of the lead page, the current one highlighted and the earlier ones
 * ticked off; a click on another stage moves the lead after a confirmation (a timeline entry like a board move).
 */
export default function StageBar({ lead, canMove, onMoved }: Props) {
  const { reference } = useApp();
  // PD-09: the steps are the stages of the pipeline the deal is in.
  const own = reference.listValues.stage.find((stage) => stage.id === lead.stageId);
  const stages = stagesOfPipeline(reference.listValues.stage, own?.pipelineId, reference.pipelines).filter((stage) => stage.active || stage.id === lead.stageId);
  const currentIndex = stages.findIndex((stage) => stage.id === lead.stageId);
  const [target, setTarget] = useState<{ id: number; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!stages.length) return null;

  const move = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const result = await moveLeadToStage(lead.id, target.id, "detail");
      setTarget(null);
      onMoved(result.task ? `Moved to ${target.value} · ${result.task.title} scheduled for ${result.task.dueAt ? result.task.dueAt.slice(0, 10) : "later"}` : `Moved to ${target.value}`, result.task, result.lead);
    } catch (caught) {
      setError(errorMessage(caught, "Could not move the deal."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ol className="stage-bar" aria-label="Pipeline stage">
        {stages.map((stage, index) => {
          const state = index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : "";
          const clickable = canMove && lead.recordState === "active" && stage.id !== lead.stageId;
          return (
            <li key={stage.id} className={`stage-step ${state}`}>
              <button
                type="button" disabled={!clickable} aria-current={index === currentIndex ? "step" : undefined}
                aria-label={index === currentIndex ? `${stage.value} (current stage)` : `Move to ${stage.value}`} title={clickable ? `Move to ${stage.value}` : stage.value}
                onClick={() => setTarget({ id: stage.id, value: stage.value })}
              >
                <span className="stage-step-index">{index + 1}</span>
                <span className="stage-step-label">{stage.value}{stage.active ? "" : " (inactive)"}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {target && (
        <Dialog title={`Move ${lead.clientName} to ${target.value}?`} eyebrow="PIPELINE STAGE" size="narrow" onClose={() => setTarget(null)}>
          <p className="dialog-description">The move goes on the deal&apos;s timeline. The status and the BD action stay as they are.</p>
          <ErrorText message={error} />
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={() => setTarget(null)}>Cancel</button>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void move()}>{busy ? "Moving..." : `Move to ${target.value}`}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
