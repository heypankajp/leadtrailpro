"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { ArrowRightLeft, CircleDashed, Clock3, Filter, Kanban, MailOpen, Plus, Search, Undo2, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatShortDate, initials, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { replyWaiting } from "@/features/gmail/watch-model";
import { offBoardStatusCodes } from "./model";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState, ErrorText, Loading, StatusPill } from "@/features/shell/components";
import { fetchPipeline, moveLeadToStage, type PipelineQuery } from "./client";
import NextStepDialog, { type NextStepLead } from "./NextStepDialog";
import { compareCards, nextStepOf, type PipelineBoard, type PipelineCard, type PipelineScope, type PipelineStage } from "./model";

type Filters = { leadTypeId: string; ownerId: string; statusId: string; q: string };
const emptyFilters: Filters = { leadTypeId: "", ownerId: "", statusId: "", q: "" };
type LastMove = { leadId: number; clientName: string; fromStageId: number; toStageName: string };

/**
 * The Pipeline board (PIPE-04..07, SPEC §10.11): one column per stage, a card per active lead whose status is neither Client nor
 * closed. Drag a card to another column, or pick the stage from the arrows on the card (keyboard and touch); every move is a
 * timeline entry on the lead and can be undone from the bar above the board.
 */
export default function PipelinePage() {
  const { reference, can, user, openLead, openNewLead, notify, dataVersion, bumpData } = useApp();
  const [scope, setScope] = useState<PipelineScope>(user.role === "admin" ? "team" : "mine");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // Local changes (a move, Show more) sit on top of the last server answer and fall away when a fresh board arrives.
  const [local, setLocal] = useState<{ base: PipelineBoard | null; board: PipelineBoard } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [loadingMore, setLoadingMore] = useState<number | null>(null);
  const [nextStep, setNextStep] = useState<NextStepLead | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const query = useMemo<PipelineQuery>(() => {
    const numeric = (value: string) => (value ? Number(value) : undefined);
    return { scope, leadTypeId: numeric(filters.leadTypeId), ownerId: scope === "team" ? numeric(filters.ownerId) : undefined, statusId: numeric(filters.statusId), q: debouncedQ };
  }, [scope, filters.leadTypeId, filters.ownerId, filters.statusId, debouncedQ]);
  const fetcher = useCallback(() => fetchPipeline(query), [query]);
  const { data, error, loading } = useAsyncData<PipelineBoard>(fetcher, dataVersion);
  const board = local && local.base === data ? local.board : data;
  const setBoard = useCallback((update: (current: PipelineBoard) => PipelineBoard) => {
    setLocal((current) => {
      const start = current && current.base === data ? current.board : data;
      return start ? { base: data, board: update(start) } : current;
    });
  }, [data]);

  // The undo bar goes away on its own after a while.
  useEffect(() => {
    if (!lastMove) return;
    const timer = window.setTimeout(() => setLastMove(null), 10000);
    return () => window.clearTimeout(timer);
  }, [lastMove]);

  const canMove = (card: PipelineCard) => can("edit_any_lead") || (can("edit_leads") && card.ownerId === user.id);
  const stageName = (stageId: number) => board?.stages.find((stage) => stage.id === stageId)?.value ?? "";
  const findCard = (leadId: number) => board?.stages.flatMap((stage) => stage.leads).find((card) => card.id === leadId) ?? null;

  /** Moves the card between columns at once; the server answer (or an error) follows. */
  const applyLocally = (leadId: number, toStageId: number) => setBoard((current) => {
    const card = current.stages.flatMap((stage) => stage.leads).find((item) => item.id === leadId);
    if (!card || card.stageId === toStageId) return current;
    const moved = { ...card, stageId: toStageId };
    return {
      ...current,
      stages: current.stages.map((stage) => {
        if (stage.id === card.stageId) return { ...stage, count: Math.max(0, stage.count - 1), leads: stage.leads.filter((item) => item.id !== leadId) };
        if (stage.id === toStageId) return { ...stage, count: stage.count + 1, leads: [...stage.leads, moved].sort(compareCards) };
        return stage;
      }),
    };
  });

  const move = async (card: PipelineCard, toStageId: number, undo = false) => {
    if (card.stageId === toStageId || !canMove(card)) return;
    const fromStageId = card.stageId;
    applyLocally(card.id, toStageId);
    try {
      const result = await moveLeadToStage(card.id, toStageId);
      setLastMove(undo ? null : { leadId: card.id, clientName: card.clientName, fromStageId, toStageName: stageName(toStageId) });
      notify(result.task
        ? `${card.clientName} moved to ${stageName(toStageId)} · ${result.task.title} scheduled for ${result.task.dueAt ? result.task.dueAt.slice(0, 10) : "later"}`
        : `${card.clientName} moved to ${stageName(toStageId)}`);
      bumpData();
      // PIPE-09: ask for the next step unless Settings → Pipeline created it already.
      if (!undo && !result.task && reference.pipeline.promptNextStep && !reference.pipeline.autoFollowUp && can("manage_tasks")) {
        setNextStep({ id: card.id, clientName: card.clientName, clientExecutive: card.clientExecutive, ownerId: card.ownerId, stageCode: board?.stages.find((stage) => stage.id === toStageId)?.code ?? null, stage: stageName(toStageId), followUpDate: card.followUpDate });
      }
    } catch (caught) {
      applyLocally(card.id, fromStageId);
      notify(errorMessage(caught, "Could not move the lead."), "error");
    }
  };

  const loadMore = async (stage: PipelineStage) => {
    setLoadingMore(stage.id);
    try {
      const page = await fetchPipeline({ ...query, stageId: stage.id, offset: stage.leads.length });
      const more = page.stages.find((item) => item.id === stage.id);
      if (more) setBoard((current) => ({ ...current, stages: current.stages.map((item) => item.id === stage.id ? { ...item, count: more.count, leads: [...item.leads, ...more.leads.filter((card) => !item.leads.some((known) => known.id === card.id))] } : item) }));
    } catch (caught) {
      notify(errorMessage(caught, "Could not load more leads."), "error");
    } finally {
      setLoadingMore(null);
    }
  };

  const onDrop = (stage: PipelineStage) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData("text/plain")) || dragging;
    const card = id ? findCard(id) : null;
    setDragging(null);
    setOverStage(null);
    if (card) void move(card, stage.id);
  };

  const update = (changes: Partial<Filters>) => setFilters((current) => ({ ...current, ...changes }));
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const boardStatuses = reference.listValues.status.filter((status) => !offBoardStatusCodes.includes(status.code));
  const activeFilterCount = [filters.leadTypeId, filters.statusId, scope === "team" ? filters.ownerId : ""].filter(Boolean).length;
  const options = (list: { id: number; value: string }[], placeholder: string, value: string, key: keyof Filters) => (
    <select value={value} onChange={(event) => update({ [key]: event.target.value } as Partial<Filters>)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {list.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
    </select>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{scope === "mine" ? "YOUR PIPELINE" : "TEAM PIPELINE"} <span className="eyebrow-dot">·</span> {board ? `${board.total} ${board.total === 1 ? "LEAD" : "LEADS"} ON THE BOARD` : "LOADING"}</div>
          <h1>Pipeline</h1>
          <p>Drag a lead to the stage it has reached, or use the arrows on its card. Clients and closed leads leave the board.</p>
        </div>
        {can("create_leads") && <button className="button button-primary" onClick={openNewLead}><Plus size={17} /> Add a lead</button>}
      </div>

      <section className="panel pipeline-panel">
        <div className="pipeline-toolbar">
          <div className="scope-toggle" role="group" aria-label="Pipeline scope">
            <button className={scope === "mine" ? "is-active" : ""} onClick={() => setScope("mine")}>Mine</button>
            <button className={scope === "team" ? "is-active" : ""} onClick={() => setScope("team")}>Team</button>
          </div>
          <div className="search-field lead-search">
            <Search size={16} />
            <input aria-label="Search the board" placeholder="Search client, contact, city..." value={filters.q} onChange={(event) => update({ q: event.target.value })} />
            {filters.q && <button className="clear-search" aria-label="Clear search" onClick={() => update({ q: "" })}><X size={13} /></button>}
          </div>
          <label className="select-filter"><Filter size={15} />{options(boardStatuses, "All statuses", filters.statusId, "statusId")}</label>
          <button className={`button button-outline button-small ${showFilters || activeFilterCount ? "is-active" : ""}`} onClick={() => setShowFilters((open) => !open)}>
            <Filter size={14} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
        {showFilters && (
          <div className="filters-panel">
            <div className="filter-grid">
              {options(reference.listValues.lead_type, "Any lead type", filters.leadTypeId, "leadTypeId")}
              {scope === "team" && (
                <select value={filters.ownerId} onChange={(event) => update({ ownerId: event.target.value })} aria-label="Owner">
                  <option value="">Any owner</option>
                  {owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              )}
            </div>
            <div className="filter-actions"><button className="text-button" onClick={() => setFilters((current) => ({ ...emptyFilters, q: current.q }))}>Clear filters</button></div>
          </div>
        )}
        {lastMove && (
          <div className="pipeline-undo" role="status">
            <span>Moved <strong>{lastMove.clientName}</strong> to {lastMove.toStageName}.</span>
            <button className="text-button" onClick={() => { const card = findCard(lastMove.leadId); setLastMove(null); if (card) void move(card, lastMove.fromStageId, true); }}><Undo2 size={13} /> Undo</button>
          </div>
        )}
        <ErrorText message={error} />
        {!board && loading && <Loading text="Loading the board..." />}
        {board && board.total === 0 && !loading && (
          <div className="pipeline-empty">
            <EmptyState icon={<Kanban size={22} />} title={scope === "mine" ? "No leads of yours on the board" : "No leads on the board"} text="Leads appear here from the moment they are created until they become clients or are closed." />
          </div>
        )}
        {board && board.total > 0 && (
          <div className="pipeline-board" aria-busy={loading}>
            {board.stages.map((stage) => (
              <section
                key={stage.id}
                className={`pipeline-column ${overStage === stage.id ? "is-over" : ""} ${stage.active ? "" : "is-inactive"}`}
                aria-label={`${stage.value} stage`}
                onDragOver={(event) => { if (dragging !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (overStage !== stage.id) setOverStage(stage.id); } }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage((current) => (current === stage.id ? null : current)); }}
                onDrop={onDrop(stage)}
              >
                <header className="pipeline-column-head"><h2>{stage.value}{stage.active ? "" : " (inactive)"}</h2><span>{stage.count}</span></header>
                <div className="pipeline-column-body">
                  {stage.leads.map((card) => {
                    const next = nextStepOf(card);
                    const overdue = Boolean(next?.date && next.date < reference.today);
                    const movable = canMove(card);
                    return (
                      <article
                        key={card.id}
                        className={`pipeline-card ${dragging === card.id ? "is-dragging" : ""} ${card.quiet ? "is-quiet" : ""}`}
                        draggable={movable}
                        onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(card.id)); event.dataTransfer.effectAllowed = "move"; setDragging(card.id); }}
                        onDragEnd={() => { setDragging(null); setOverStage(null); }}
                      >
                        <div className="pipeline-card-head">
                          <button className="pipeline-card-title" onClick={() => openLead(card.id)}>
                            <strong>{card.clientName}</strong>
                            <small>{card.clientExecutive || "No contact yet"}{card.city ? ` · ${card.city}` : ""}</small>
                          </button>
                          {movable && (
                            <label className="pipeline-move" title="Move to another stage">
                              <ArrowRightLeft size={13} />
                              <select aria-label={`Move ${card.clientName} to stage`} value={card.stageId} onChange={(event) => void move(card, Number(event.target.value))}>
                                {board.stages.filter((item) => item.active || item.id === card.stageId).map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
                              </select>
                            </label>
                          )}
                        </div>
                        <div className="pipeline-card-meta">
                          <StatusPill status={card.statusLabel} code={card.statusCode} />
                          <span className="pipeline-owner" title={card.ownerName}><span className="mini-avatar">{initials(card.ownerName)}</span>{scope === "team" ? card.ownerName : null}</span>
                        </div>
                        {card.bdAction && <small className="pipeline-action">{card.bdAction} · {relativeTime(card.lastActivityAt)}</small>}
                        <div className="pipeline-card-foot">
                          {next
                            ? <span className={`pipeline-next ${overdue ? "overdue" : ""}`} title={next.title ?? undefined}><Clock3 size={12} /> {next.kind === "task" ? "Task" : "Follow-up"} {next.date ? formatShortDate(next.date) : "no date"}</span>
                            : <span className="pipeline-next pipeline-none"><CircleDashed size={12} /> No next step</span>}
                          {replyWaiting(card) && <span className="pipeline-reply" title="The client wrote and is waiting for a reply"><MailOpen size={12} /></span>}
                          {card.quiet && <span className="pipeline-quiet" title={`No activity for ${card.quietDays} days; the limit is ${card.quietLimit}`}>Quiet {card.quietDays}d</span>}
                        </div>
                      </article>
                    );
                  })}
                  {stage.leads.length < stage.count && (
                    <button className="text-button pipeline-more" disabled={loadingMore === stage.id} onClick={() => void loadMore(stage)}>
                      {loadingMore === stage.id ? "Loading..." : `Show ${Math.min(stage.count - stage.leads.length, 50)} more`}
                    </button>
                  )}
                  {!stage.leads.length && <p className="pipeline-column-empty">{dragging !== null ? "Drop here" : "No leads"}</p>}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
      {nextStep && (
        <NextStepDialog lead={nextStep} reason={`You moved ${nextStep.clientName} to ${nextStep.stage}.`} onClose={() => setNextStep(null)} onSaved={(message) => { setNextStep(null); notify(message); bumpData(); }} />
      )}
    </>
  );
}
