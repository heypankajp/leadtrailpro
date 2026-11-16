import { api, toQuery } from "@/lib/api";
import type { ListValue } from "@/features/list-values/model";
import type { LeadSummary } from "@/features/leads/model";
import type { Task } from "@/features/tasks/model";
import type { QuickFilterKey } from "@/features/leads/quick-filters";
import type { PipelineBoard, PipelineGroupBy, PipelineScope } from "./model";

export type PipelineQuery = Partial<{
  scope: PipelineScope; leadTypeId: number; ownerId: number; statusId: number; q: string; stageId: number; pipelineId: number; offset: number;
  /** PD-24: the board by status; `column` is the status column of Show more there. */
  groupBy: PipelineGroupBy; column: number;
  /** PD-23: the date filter. */
  firstContactFrom: string; firstContactTo: string; followUpFrom: string; followUpTo: string;
  /** PD-30: a ready-made or data cleanup filter. */
  quick: QuickFilterKey;
}>;

export const fetchPipeline = (query: PipelineQuery) => api<PipelineBoard>(`/api/pipeline${toQuery(query)}`);
/** `task` is the stage's suggested task when Settings → Pipeline creates it automatically (PIPE-09), else null. */
export const moveLeadToStage = (id: number, stageId: number, via: "board" | "detail" = "board") => api<{ lead: LeadSummary; task: Task | null }>(`/api/leads/${id}/stage`, { method: "PATCH", json: { stageId, via } });
/** Places every lead again from its BD action through the current mapping (administrators, List of values → BD action). */
export const recomputeStages = () => api<{ count: number }>("/api/pipeline/recompute", { method: "POST", json: {} });

// PD-21: editing the stages from the board (Sales Managers and Admins).
export const addStage = (name: string, pipelineId: number | null) => api<{ stage: ListValue }>("/api/pipeline/stages", { method: "POST", json: { name, pipelineId } });
export const renameStage = (id: number, name: string) => api<{ stage: ListValue }>(`/api/pipeline/stages/${id}`, { method: "PATCH", json: { name } });
export const moveStage = (id: number, direction: "left" | "right") => api<{ ok: true }>(`/api/pipeline/stages/${id}`, { method: "PATCH", json: { direction } });
export const deleteStage = (id: number, moveTo: number | null) => api<{ moved: number }>(`/api/pipeline/stages/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`, { method: "DELETE" });
