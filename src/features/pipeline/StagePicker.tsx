"use client";

import type { CSSProperties } from "react";
import { useApp } from "@/features/shell/AppContext";
import { stagesOfPipeline } from "./model";

/**
 * The Pipeline stage of the add-deal form as green arrows (review of November 18, 2026): one arrow per
 * stage of the deal's pipeline, filled up to the stage picked; a click picks that stage. With several pipelines a picker
 * chooses the pipeline first. `value` is the stage id as a string ("" = no stage, only possible for an old deal).
 */
export default function StagePicker({ value, onChange, hint }: { value: string; onChange: (stageId: string) => void; hint?: string }) {
  const { reference } = useApp();
  const all = reference.listValues.stage;
  const current = all.find((stage) => String(stage.id) === value) ?? null;
  const pipelines = reference.pipelines.filter((pipeline) => pipeline.active);
  const defaultPipeline = reference.pipelines.find((pipeline) => pipeline.isDefault)?.id ?? null;
  const pipelineId = current?.pipelineId ?? defaultPipeline;
  const stages = stagesOfPipeline(all, pipelineId, reference.pipelines).filter((stage) => stage.active || String(stage.id) === value);
  const index = stages.findIndex((stage) => String(stage.id) === value);
  // The filled arrows go from light green (first stage) to dark green (last stage), whatever the number of stages.
  const shade = (position: number) => {
    const light = [143, 212, 166];
    const dark = [31, 107, 60];
    const ratio = stages.length > 1 ? position / (stages.length - 1) : 1;
    return `rgb(${light.map((channel, index) => Math.round(channel + (dark[index] - channel) * ratio)).join(", ")})`;
  };
  const pickPipeline = (id: number) => {
    const first = stagesOfPipeline(all, id, reference.pipelines).find((stage) => stage.active);
    if (first) onChange(String(first.id));
  };

  return (
    <div className="field-wide stage-picker-field">
      <span className="field-label" id="stage-picker-label">Pipeline stage</span>
      {pipelines.length > 1 && (
        <select className="stage-picker-pipeline" aria-label="Pipeline" value={pipelineId ?? ""} onChange={(event) => pickPipeline(Number(event.target.value))}>
          {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </select>
      )}
      <div className="stage-picker" role="radiogroup" aria-labelledby="stage-picker-label">
        {stages.map((stage, position) => (
          <button
            key={stage.id} type="button" role="radio" aria-checked={position === index}
            className={position <= index ? "is-on" : undefined} title={stage.value}
            style={position <= index ? ({ "--stage-green": shade(position) } as CSSProperties) : undefined}
            onClick={() => onChange(String(stage.id))}
          >
            <span className="sr-only">{stage.value}</span>
          </button>
        ))}
      </div>
      <small className="stage-picker-name">{index >= 0 ? `${stages[index].value} · stage ${index + 1} of ${stages.length}` : "No stage yet: pick one"}</small>
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}
