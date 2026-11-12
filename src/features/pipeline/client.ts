import { api, toQuery } from "@/lib/api";
import type { LeadSummary } from "@/features/leads/model";
import type { Task } from "@/features/tasks/model";
import type { PipelineBoard, PipelineScope } from "./model";

export type PipelineQuery = Partial<{ scope: PipelineScope; leadTypeId: number; ownerId: number; statusId: number; q: string; stageId: number; offset: number }>;

export const fetchPipeline = (query: PipelineQuery) => api<PipelineBoard>(`/api/pipeline${toQuery(query)}`);
/** `task` is the stage's suggested task when Settings → Pipeline creates it automatically (PIPE-09), else null. */
export const moveLeadToStage = (id: number, stageId: number, via: "board" | "detail" = "board") => api<{ lead: LeadSummary; task: Task | null }>(`/api/leads/${id}/stage`, { method: "PATCH", json: { stageId, via } });
/** Places every lead again from its BD action through the current mapping (administrators, List of values → BD action). */
export const recomputeStages = () => api<{ count: number }>("/api/pipeline/recompute", { method: "POST", json: {} });
