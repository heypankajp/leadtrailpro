// Relative with the extension so the unit tests can load this module under Node without the Next alias.
import { entryStageCode } from "../list-values/model.ts";
import { addWorkingDays } from "../../lib/natural-dates.ts";
import type { PipelineSettings, StageFollowUpActivity } from "../settings/model.ts";

/**
 * Pipeline board rules (PIPE-*, SPEC §10.11). A stage is a `stage` list value; the ordered list is the board's columns.
 * Pure helpers here are shared by the repository, the tracker import, and the unit tests.
 */

/** `pipelineId`: the pipeline the stage belongs to (PD-09); null only for data from before migration 26. */
export type StageValue = { id: number; code: string; value: string; sortOrder: number; active: boolean; pipelineId?: number | null };

/** PD-09: a pipeline is a board of its own with its own ordered stages. The default one takes the automatic placing (BD actions, import). */
export type Pipeline = { id: number; name: string; sortOrder: number; active: boolean; isDefault: boolean };

/** A BD action with no stage of its own counts as this stage: the lead has been contacted at least once. */
export const unmappedActionStageCode = "contact_made";

/** Statuses whose leads leave the board (PIPE-07): won (Client) and the two closed ones. */
export const offBoardStatusCodes: readonly string[] = ["client", "lost", "disqualified"];

/** The stage a BD action lands a lead in: the action's mapped stage, Contact Made when it has none, New Deal when there is no action. */
export function resolveStageForAction(bdActionId: number | null, actionStageId: number | null, stages: readonly StageValue[]): StageValue | null {
  const byCode = (code: string) => stages.find((stage) => stage.code === code) ?? null;
  if (!bdActionId) return byCode(entryStageCode) ?? stages[0] ?? null;
  const mapped = actionStageId ? stages.find((stage) => stage.id === actionStageId) ?? null : null;
  return mapped ?? byCode(unmappedActionStageCode) ?? byCode(entryStageCode) ?? stages[0] ?? null;
}

/** PIPE-03: an action moves a lead forward only; a lead with no stage yet takes the mapped one. */
export function stageAdvances(current: Pick<StageValue, "sortOrder" | "pipelineId"> | null, mapped: Pick<StageValue, "sortOrder" | "pipelineId"> | null): boolean {
  if (!mapped) return false;
  if (!current) return true;
  // PD-09: an action never pulls a deal out of the pipeline it was put in.
  if ((current.pipelineId ?? null) !== (mapped.pipelineId ?? null) && current.pipelineId != null && mapped.pipelineId != null) return false;
  return mapped.sortOrder > current.sortOrder;
}

export type PipelineScope = "mine" | "team";
export const pipelinePageSize = 50;

export type PipelineFilters = {
  scope: PipelineScope;
  leadTypeId: number | null;
  ownerId: number | null;
  statusId: number | null;
  q: string;
  /** With `offset`: the next cards of one column (Show more). */
  stageId: number | null;
  offset: number;
  /** PD-09: the pipeline shown; null = the default one. */
  pipelineId: number | null;
};

export function parsePipelineFilters(params: URLSearchParams): PipelineFilters {
  const id = (key: string) => {
    const value = Number(params.get(key));
    return params.get(key) && Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const offset = Number(params.get("offset") || "0");
  return {
    scope: params.get("scope") === "team" ? "team" : "mine",
    leadTypeId: id("leadTypeId"),
    ownerId: id("ownerId"),
    statusId: id("statusId"),
    q: (params.get("q") || "").trim().slice(0, 200),
    stageId: id("stageId"),
    pipelineId: id("pipelineId"),
    offset: Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0,
  };
}

export type PipelineCard = {
  id: number;
  clientName: string;
  clientExecutive: string;
  city: string | null;
  leadTypeId: number;
  leadType: string;
  statusId: number;
  statusCode: string;
  statusLabel: string;
  bdActionId: number | null;
  bdAction: string | null;
  ownerId: number;
  ownerName: string;
  stageId: number;
  followUpDate: string | null;
  /** PD-11: the deal's value, when one was entered. */
  dealValue: number | null;
  nextTaskDueAt: string | null;
  nextTaskTitle: string | null;
  lastActivityAt: string;
  lastClientEmailAt: string | null;
  lastTeamEmailAt: string | null;
  /** Days since the last timeline entry against the limit from the needs-attention rules (§7.9); `quiet` when over it. */
  quietDays: number;
  quietLimit: number;
  quiet: boolean;
};

/** `valueTotal`: the sum of the values of every deal in the stage (not only the cards loaded), 0 when none has a value. */
export type PipelineStage = StageValue & { count: number; valueTotal: number; leads: PipelineCard[] };
export type PipelineBoard = { scope: PipelineScope; total: number; stages: PipelineStage[] };

export type NextStep = { kind: "task" | "follow_up"; date: string; title: string | null };

/** PIPE-06: the next step of a card is its earliest open task, else its follow-up date; null means "No next step". */
export function nextStepOf(card: Pick<PipelineCard, "followUpDate" | "nextTaskDueAt" | "nextTaskTitle">): NextStep | null {
  const taskDate = card.nextTaskDueAt ? card.nextTaskDueAt.slice(0, 10) : null;
  if (taskDate && (!card.followUpDate || taskDate <= card.followUpDate)) return { kind: "task", date: taskDate, title: card.nextTaskTitle };
  if (card.followUpDate) return { kind: "follow_up", date: card.followUpDate, title: null };
  if (card.nextTaskDueAt === null && card.nextTaskTitle) return { kind: "task", date: "", title: card.nextTaskTitle };
  return null;
}

/** Whole days between the last activity and now (never negative). */
export function quietDaysSince(lastActivityAt: string, now: Date): number {
  const last = new Date(lastActivityAt).getTime();
  if (Number.isNaN(last)) return 0;
  return Math.max(0, Math.floor((now.getTime() - last) / 86_400_000));
}

/** Column order of the cards: the earliest next step first, then the most recently active (PIPE-04). */
export function compareCards(a: Pick<PipelineCard, "followUpDate" | "nextTaskDueAt" | "nextTaskTitle" | "lastActivityAt" | "id">, b: typeof a): number {
  const nextA = nextStepOf(a)?.date || null;
  const nextB = nextStepOf(b)?.date || null;
  if (nextA !== nextB) {
    if (nextA === null) return 1;
    if (nextB === null) return -1;
    return nextA < nextB ? -1 : 1;
  }
  if (a.lastActivityAt !== b.lastActivityAt) return a.lastActivityAt > b.lastActivityAt ? -1 : 1;
  return b.id - a.id;
}

// ---- Next step (PIPE-09) ----

export const activityTitles: Record<StageFollowUpActivity, string> = { call: "Call", email: "Email", visit: "Visit", task: "Follow up with" };

export type NextStepDefault = { activity: StageFollowUpActivity; title: string; date: string; businessDays: number; /** True when the stage has its own suggestion under Settings → Pipeline. */ fromStage: boolean };

/** The next step a stage suggests (Settings → Pipeline), or a plain follow-up on the next working day; due dates skip weekends and holidays. */
export function defaultNextStep(stageCode: string | null, pipeline: PipelineSettings, today: string, holidays: readonly string[], names: { executive?: string | null; client: string }): NextStepDefault {
  const configured = stageCode ? pipeline.followUps[stageCode] : undefined;
  const activity: StageFollowUpActivity = configured?.activity ?? "task";
  const businessDays = configured ? configured.businessDays : 1;
  const who = names.executive?.trim() || names.client;
  return { activity, title: `${activityTitles[activity]} ${who}`, date: addWorkingDays(today, businessDays, holidays), businessDays, fromStage: Boolean(configured) };
}

/**
 * The stages offered wherever a stage is chosen (PD-09): the stages of the active pipelines, the default pipeline first.
 * With one pipeline the names are plain; with several, a stage of another pipeline reads "Pipeline: Stage".
 */
export function stageChoices<Stage extends { value: string; sortOrder: number; pipelineId?: number | null }>(stages: readonly Stage[], pipelines: readonly Pipeline[]): Stage[] {
  const active = pipelines.filter((pipeline) => pipeline.active);
  if (active.length <= 1) return stages.filter((stage) => stage.pipelineId == null || active.some((pipeline) => pipeline.id === stage.pipelineId) || !pipelines.length);
  const rank = new Map(active.map((pipeline, index) => [pipeline.id, { index: pipeline.isDefault ? -1 : index, pipeline }]));
  return stages
    .filter((stage) => stage.pipelineId == null || rank.has(stage.pipelineId))
    .map((stage) => ({ stage, place: stage.pipelineId == null ? undefined : rank.get(stage.pipelineId) }))
    .sort((a, b) => (a.place?.index ?? -1) - (b.place?.index ?? -1) || a.stage.sortOrder - b.stage.sortOrder)
    .map(({ stage, place }) => (place && !place.pipeline.isDefault ? { ...stage, value: `${place.pipeline.name}: ${stage.value}` } : stage));
}

/** The stages of one pipeline, in order: the columns of its board and the steps of the stage bar. */
export function stagesOfPipeline<Stage extends { pipelineId?: number | null }>(stages: readonly Stage[], pipelineId: number | null | undefined, pipelines: readonly Pipeline[]): Stage[] {
  const fallback = pipelines.find((pipeline) => pipeline.isDefault)?.id ?? null;
  const wanted = pipelineId ?? fallback;
  return stages.filter((stage) => (stage.pipelineId ?? fallback) === wanted);
}
