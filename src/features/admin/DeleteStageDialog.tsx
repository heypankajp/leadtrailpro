"use client";

import { useCallback, useState } from "react";
import { List } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import type { ListValue } from "@/features/list-values/model";
import { deleteStage, fetchStageDeals } from "@/features/pipeline/client";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading } from "@/features/shell/components";

/**
 * Deleting a stage from List of Values → Pipeline Stage (request of November 18, 2026). A stage that still holds deals
 * cannot be deleted: the user either moves its deals by hand (the Pipeline list opens on that stage, where Move to stage
 * does it in bulk) and comes back, or picks a stage that takes them all, after which the stage is deleted. The server
 * applies the same rule (`stageDeleteProblem`).
 */
export default function DeleteStageDialog({ stage, others, onClose, onDeleted }: {
  stage: ListValue; others: ListValue[]; onClose: () => void; onDeleted: (message: string) => void;
}) {
  const { navigate } = useApp();
  const fetcher = useCallback(() => fetchStageDeals(stage.id), [stage.id]);
  const { data, error: loadError } = useAsyncData(fetcher);
  const [choice, setChoice] = useState<"manual" | "move">("move");
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const deals = data?.deals;
  const total = deals?.total ?? 0;
  const count = (n: number) => (n === 1 ? "1 deal" : `${n} deals`);

  const remove = async (target: number | null) => {
    setBusy(true);
    setError("");
    try {
      const result = await deleteStage(stage.id, target);
      const name = others.find((item) => item.id === target)?.value;
      onDeleted(`Stage ${stage.value} deleted${result.moved && name ? `; ${count(result.moved)} moved to ${name}` : ""}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not delete the stage."));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Delete ${stage.value}?`} eyebrow="PIPELINE STAGE" onClose={onClose} size="narrow">
      <div className="stack-form">
        <ErrorText message={loadError} />
        {!deals && !loadError && <Loading text="Counting the deals in this stage..." />}
        {deals && total === 0 && (
          <p className="dialog-description">No deal is in {stage.value}. The stage leaves the pipeline; BD actions that led to it are no longer mapped, and older timeline entries keep its name.</p>
        )}
        {deals && total > 0 && (
          <>
            <p className="dialog-description">
              <strong>{stage.value} has {count(total)}</strong>
              {deals.archived || deals.queued ? ` (${[deals.active && `${deals.active} active`, deals.queued && `${deals.queued} queued`, deals.archived && `${deals.archived} archived`].filter(Boolean).join(", ")})` : ""}.
              {" "}A stage cannot be deleted while it holds deals. Move them first:
            </p>
            <fieldset className="trip-delete-options">
              <legend className="sr-only">How to move the deals</legend>
              <label className={`trip-delete-option ${choice === "move" ? "is-active" : ""}`}>
                <input type="radio" name="stage-deals" checked={choice === "move"} onChange={() => setChoice("move")} />
                <span><strong>Move them to another stage, then delete</strong><small>Every deal of {stage.value}, archived ones included, moves to the stage you choose, with an entry on its timeline.</small></span>
              </label>
              <label className={`trip-delete-option ${choice === "manual" ? "is-active" : ""}`}>
                <input type="radio" name="stage-deals" checked={choice === "manual"} onChange={() => setChoice("manual")} />
                <span><strong>Move them myself</strong><small>Open the deals in the Pipeline list, select them and use Move to stage. Come back and delete {stage.value} once it is empty.{deals.archived || deals.queued ? " Archived and queued deals are not in that list: the other choice moves them." : ""}</small></span>
              </label>
            </fieldset>
            {choice === "move" && (
              <Field label="Move the Deals to" required>
                <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} required>
                  <option value="">Choose a stage</option>
                  {others.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                </select>
              </Field>
            )}
          </>
        )}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          {deals && total === 0 && <button type="button" className="button button-danger" disabled={busy} onClick={() => void remove(null)}>{busy ? "Deleting..." : "Delete Stage"}</button>}
          {deals && total > 0 && choice === "move" && (
            <button type="button" className="button button-danger" disabled={busy || !moveTo} onClick={() => void remove(Number(moveTo))}>{busy ? "Moving..." : `Move ${count(total)} and Delete`}</button>
          )}
          {deals && total > 0 && choice === "manual" && (
            <button type="button" className="button button-primary" onClick={() => { onClose(); navigate("deals", "list", { stageId: String(stage.id), scope: "everyone" }); }}><List size={15} /> Open the Deals</button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
