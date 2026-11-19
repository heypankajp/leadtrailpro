"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { CalendarRange, CircleDashed, Clock3, Filter, Kanban, List, MailOpen, MoreHorizontal, Pencil, Plus, Search, Undo2, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatShortDate, initials, relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { replyWaiting } from "@/features/gmail/watch-model";
import { reasonListFor } from "@/features/list-values/model";
import { updateLead } from "@/features/leads/client";
import { StatusReasonDialog } from "@/features/leads/DealPage";
import QuickFilterMenu from "@/features/leads/QuickFilterMenu";
import type { QuickFilterKey } from "@/features/leads/quick-filters";
import { useApp } from "@/features/shell/AppContext";
import { ConvertToClientDialog, EmptyState, ErrorText, Loading, StatusPill } from "@/features/shell/components";
import StatusFilter from "@/features/shell/StatusFilter";
import { fetchPipeline, moveLeadToStage, type PipelineQuery } from "./client";
import CardActions from "./CardActions";
import NextStepDialog, { type NextStepLead } from "./NextStepDialog";
import { AddStageColumn, EditableStageHead } from "./StageEditor";
import { formatDealValue } from "@/features/leads/model";
import { compareCards, nextStepOf, offBoardStatusCodes, stagesOfPipeline, type PipelineBoard, type PipelineCard, type PipelineDateField, type PipelineGroupBy, type PipelineScope, type PipelineStage } from "./model";

type Filters = { leadTypeId: string; ownerId: string; statusId: string; stageId: string; q: string; dateField: PipelineDateField; dateFrom: string; dateTo: string; quick: QuickFilterKey | null };
const emptyFilters: Filters = { leadTypeId: "", ownerId: "", statusId: "", stageId: "", q: "", dateField: "first_contact", dateFrom: "", dateTo: "", quick: null };
/** What the undo bar puts back: a stage move, or a status change on the board by status (with the reason it had). */
type LastMove = { leadId: number; clientName: string; toName: string } & ({ kind: "stage"; fromStageId: number } | { kind: "status"; fromStatusId: number; fromReasonId: number | null });

/**
 * The board (PIPE-04..07, SPEC §10.11). By stage (the default): one column per
 * stage, a card per active deal whose status is neither Client nor closed; drag a card to another column or use the card's
 * menu to move it. By status (PD-24): one column per status, the stage a filter, and a drag changes the status (Lost and
 * Disqualified ask for the reason). Every move is a timeline entry and can be undone from the bar above the board.
 * "Edit pipeline" (PD-21) lets Sales Managers and Admins rename, reorder, delete and add stages. The page heading, the
 * view switch and the "+ Deal" button belong to DealsPage, which renders this board.
 */
export default function PipelinePage({ groupBy = "stage" }: { groupBy?: PipelineGroupBy }) {
  const { reference, refreshReference, can, user, navigate, openLead, openNewLeadIn, openNewLeadFor, notify, dataVersion, bumpData } = useApp();
  const byStatus = groupBy === "status";
  const [scope, setScope] = useState<PipelineScope>(user.role === "admin" ? "team" : "mine");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState(false);
  // Local changes (a move, Show more) sit on top of the last server answer and fall away when a fresh board arrives.
  const [local, setLocal] = useState<{ base: PipelineBoard | null; board: PipelineBoard } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [loadingMore, setLoadingMore] = useState<number | null>(null);
  const [nextStep, setNextStep] = useState<NextStepLead | null>(null);
  const [reasonFor, setReasonFor] = useState<{ card: PipelineCard; statusId: number; statusName: string; listKey: NonNullable<ReturnType<typeof reasonListFor>> } | null>(null);
  // PD-09: with a second pipeline the board gets a picker; the default pipeline is shown first.
  const pipelines = reference.pipelines.filter((pipeline) => pipeline.active);
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const shownPipeline = pipelines.find((pipeline) => pipeline.id === pipelineId) ?? pipelines.find((pipeline) => pipeline.isDefault) ?? null;
  const pipelineStages = stagesOfPipeline(reference.listValues.stage, shownPipeline?.id ?? null, reference.pipelines).filter((stage) => stage.active);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const query = useMemo<PipelineQuery>(() => {
    const numeric = (value: string) => (value ? Number(value) : undefined);
    // The default pipeline is asked for without an id, so the board also shows deals that have no stage yet.
    const chosen = reference.pipelines.find((pipeline) => pipeline.active && pipeline.id === pipelineId);
    const firstContact = filters.dateField === "first_contact";
    return {
      scope, leadTypeId: numeric(filters.leadTypeId), ownerId: scope === "team" ? numeric(filters.ownerId) : undefined, q: debouncedQ, quick: filters.quick ?? undefined,
      pipelineId: chosen && !chosen.isDefault ? chosen.id : undefined,
      ...(byStatus ? { groupBy: "status" as const, stageId: numeric(filters.stageId) } : { statusId: numeric(filters.statusId) }),
      ...(firstContact ? { firstContactFrom: filters.dateFrom || undefined, firstContactTo: filters.dateTo || undefined } : { followUpFrom: filters.dateFrom || undefined, followUpTo: filters.dateTo || undefined }),
    };
  }, [scope, filters.leadTypeId, filters.ownerId, filters.statusId, filters.stageId, filters.dateField, filters.dateFrom, filters.dateTo, filters.quick, debouncedQ, pipelineId, reference.pipelines, byStatus]);
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
  const columnOf = (card: PipelineCard) => (byStatus ? card.statusId : card.stageId);
  const columnName = (columnId: number) => board?.stages.find((column) => column.id === columnId)?.value ?? "";
  const stageName = (stageId: number) => reference.listValues.stage.find((stage) => stage.id === stageId)?.value ?? columnName(stageId);
  const findCard = (leadId: number) => board?.stages.flatMap((column) => column.leads).find((card) => card.id === leadId) ?? null;

  /** Moves the card between columns at once; the server answer (or an error) follows. */
  const applyLocally = (leadId: number, toColumn: number, changes: Partial<PipelineCard>) => setBoard((current) => {
    const card = current.stages.flatMap((column) => column.leads).find((item) => item.id === leadId);
    if (!card) return current;
    const from = columnOf(card);
    const moved = { ...card, ...changes };
    if (from === toColumn) return { ...current, stages: current.stages.map((column) => ({ ...column, leads: column.leads.map((item) => (item.id === leadId ? moved : item)) })) };
    return {
      ...current,
      stages: current.stages.map((column) => {
        if (column.id === from) return { ...column, count: Math.max(0, column.count - 1), valueTotal: Math.max(0, column.valueTotal - (card.dealValue ?? 0)), leads: column.leads.filter((item) => item.id !== leadId) };
        if (column.id === toColumn) return { ...column, count: column.count + 1, valueTotal: column.valueTotal + (card.dealValue ?? 0), leads: [...column.leads, moved].sort(compareCards) };
        return column;
      }),
    };
  });

  const move = async (card: PipelineCard, toStageId: number, undo = false) => {
    if (card.stageId === toStageId || !canMove(card)) return;
    const fromStageId = card.stageId;
    applyLocally(card.id, byStatus ? card.statusId : toStageId, { stageId: toStageId });
    try {
      const result = await moveLeadToStage(card.id, toStageId);
      setLastMove(undo ? null : { kind: "stage", leadId: card.id, clientName: card.clientName, fromStageId, toName: stageName(toStageId) });
      notify(result.task
        ? `${card.clientName} moved to ${stageName(toStageId)} · ${result.task.title} scheduled for ${result.task.dueAt ? result.task.dueAt.slice(0, 10) : "later"}`
        : `${card.clientName} moved to ${stageName(toStageId)}`);
      bumpData();
      // PIPE-09: ask for the next step unless Settings → Pipeline created it already.
      if (!undo && !result.task && reference.pipeline.promptNextStep && !reference.pipeline.autoFollowUp && can("manage_tasks")) {
        setNextStep({ id: card.id, clientName: card.clientName, clientExecutive: card.clientExecutive, ownerId: card.ownerId, stageCode: reference.listValues.stage.find((stage) => stage.id === toStageId)?.code ?? null, stage: stageName(toStageId), followUpDate: card.followUpDate });
      }
    } catch (caught) {
      applyLocally(card.id, byStatus ? card.statusId : fromStageId, { stageId: fromStageId });
      notify(errorMessage(caught, "Could not move the deal."), "error");
    }
  };

  /** PD-24: a drop on the board by status. Lost and Disqualified ask for their reason first (LEAD-06). */
  const changeStatus = async (card: PipelineCard, statusId: number, statusReasonId: number | null = null, undo = false, confirmed = false) => {
    if (!canMove(card) || (card.statusId === statusId && card.statusReasonId === statusReasonId)) return;
    const target = reference.listValues.status.find((status) => status.id === statusId);
    const listKey = reasonListFor(target?.code);
    if (listKey && !statusReasonId) { setReasonFor({ card, statusId, statusName: target?.value ?? "", listKey }); return; }
    // A drop on Client asks first (request of November 19, 2026); Undo does not.
    if (target?.code === "client" && !undo && !confirmed) { setConfirmClient({ card, statusId }); return; }
    const from = { statusId: card.statusId, statusReasonId: card.statusReasonId, statusCode: card.statusCode, statusLabel: card.statusLabel };
    applyLocally(card.id, statusId, { statusId, statusReasonId, statusCode: target?.code ?? card.statusCode, statusLabel: target?.value ?? card.statusLabel });
    try {
      await updateLead(card.id, { statusId, statusReasonId });
      setLastMove(undo ? null : { kind: "status", leadId: card.id, clientName: card.clientName, fromStatusId: from.statusId, fromReasonId: from.statusReasonId, toName: target?.value ?? "" });
      notify(`${card.clientName} is now ${target?.value ?? "updated"}`);
      bumpData();
    } catch (caught) {
      applyLocally(card.id, from.statusId, from);
      notify(errorMessage(caught, "Could not change the status."), "error");
    }
  };

  /** Review of November 18, 2026: Convert to Client from the card menu. The deal leaves the board and is listed under Clients. */
  const clientStatus = reference.listValues.status.find((status) => status.code === "client") ?? null;
  // Convert to Client and a drop on Client ask "Do you want to convert this deal to client?" first (request of November 19, 2026).
  const [confirmClient, setConfirmClient] = useState<{ card: PipelineCard; statusId: number | null } | null>(null);
  const convertToClient = async (card: PipelineCard) => {
    if (!clientStatus) return;
    try {
      await updateLead(card.id, { statusId: clientStatus.id, statusReasonId: null });
      notify(`${card.clientName} is now a client`);
      bumpData();
    } catch (caught) {
      notify(errorMessage(caught, "Could not convert the deal."), "error");
    }
  };

  const undoLast = () => {
    if (!lastMove) return;
    const card = findCard(lastMove.leadId);
    setLastMove(null);
    if (!card) return;
    if (lastMove.kind === "stage") void move(card, lastMove.fromStageId, true);
    else void changeStatus(card, lastMove.fromStatusId, lastMove.fromReasonId, true);
  };

  const loadMore = async (column: PipelineStage) => {
    setLoadingMore(column.id);
    try {
      const page = await fetchPipeline({ ...query, ...(byStatus ? { column: column.id } : { stageId: column.id }), offset: column.leads.length });
      const more = page.stages.find((item) => item.id === column.id);
      if (more) setBoard((current) => ({ ...current, stages: current.stages.map((item) => item.id === column.id ? { ...item, count: more.count, valueTotal: more.valueTotal, leads: [...item.leads, ...more.leads.filter((card) => !item.leads.some((known) => known.id === card.id))] } : item) }));
    } catch (caught) {
      notify(errorMessage(caught, "Could not load more deals."), "error");
    } finally {
      setLoadingMore(null);
    }
  };

  const onDrop = (column: PipelineStage) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData("text/plain")) || dragging;
    const card = id ? findCard(id) : null;
    setDragging(null);
    setOverColumn(null);
    if (!card) return;
    if (byStatus) void changeStatus(card, column.id);
    else void move(card, column.id);
  };

  /** After a stage was renamed, moved, added or deleted: the stage lists everywhere and the board reload. */
  const stagesChanged = async (message: string) => {
    await refreshReference();
    bumpData();
    notify(message);
  };

  const update = (changes: Partial<Filters>) => setFilters((current) => ({ ...current, ...changes }));
  const owners = reference.users.filter((item) => item.role !== "recruiter");
  const boardStatuses = reference.listValues.status.filter((status) => !offBoardStatusCodes.includes(status.code));
  const activeFilterCount = [filters.leadTypeId, scope === "team" ? filters.ownerId : "", filters.dateFrom || filters.dateTo].filter(Boolean).length;
  const options = (list: { id: number; value: string }[], placeholder: string, value: string, key: keyof Filters) => (
    <select value={value} onChange={(event) => update({ [key]: event.target.value } as Partial<Filters>)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {list.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
    </select>
  );
  const editable = !byStatus && editing && can("manage_stages");
  const columns = board?.stages ?? [];

  return (
    <>
      <section className="panel pipeline-panel">
        <div className="pipeline-toolbar">
          <div className="scope-toggle" role="group" aria-label="Pipeline scope">
            <button className={scope === "mine" ? "is-active" : ""} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>My deals</button>
            <button className={scope === "team" ? "is-active" : ""} aria-pressed={scope === "team"} onClick={() => setScope("team")}>Everyone</button>
          </div>
          {pipelines.length > 1 && (
            <label className="select-filter pipeline-picker">
              <Kanban size={15} />
              <select aria-label="Pipeline" value={shownPipeline?.id ?? ""} onChange={(event) => { setPipelineId(Number(event.target.value)); setLastMove(null); update({ stageId: "" }); }}>
                {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
              </select>
            </label>
          )}
          <div className="search-field lead-search">
            <Search size={16} />
            <input aria-label="Search the board" placeholder="Search client, contact, city..." value={filters.q} onChange={(event) => update({ q: event.target.value })} />
            {filters.q && <button className="clear-search" aria-label="Clear search" onClick={() => update({ q: "" })}><X size={13} /></button>}
          </div>
          {byStatus
            ? <label className="select-filter"><Filter size={15} />{options(pipelineStages, "All stages", filters.stageId, "stageId")}</label>
            : <StatusFilter statuses={boardStatuses} value={filters.statusId} onChange={(statusId) => update({ statusId })} />}
          <button className={`button button-outline button-small ${showFilters || activeFilterCount ? "is-active" : ""}`} onClick={() => setShowFilters((open) => !open)}>
            <Filter size={14} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          {!byStatus && can("manage_stages") && (
            <button className={`button button-outline button-small ${editing ? "is-active" : ""}`} aria-pressed={editing} onClick={() => { setEditing((open) => !open); setLastMove(null); }}>
              <Pencil size={14} /> {editing ? "Done editing" : "Edit pipeline"}
            </button>
          )}
          <span className="board-total" role="status">{board ? `${board.total} ${board.total === 1 ? "deal" : "deals"}` : ""}</span>
          {/* PD-30: ready-made and data cleanup filters; the list view does the clean-up with its bulk actions. */}
          {/* Review of November 18, 2026: Followup in the Filter menu sets the date filter to the follow-up date. */}
          <QuickFilterMenu
            value={filters.quick} onChange={(quick) => update({ quick })}
            followUp={{
              from: filters.dateField === "follow_up" ? filters.dateFrom : "", to: filters.dateField === "follow_up" ? filters.dateTo : "",
              onChange: (from, to) => update(from ? { dateField: "follow_up", dateFrom: from, dateTo: to } : { dateFrom: "", dateTo: "" }),
            }}
          />
          {filters.quick && <button className="text-button quick-filter-list" onClick={() => navigate("deals", "list", { quick: filters.quick!, scope: scope === "team" ? "everyone" : "mine" })}><List size={13} /> Open in the list</button>}
        </div>
        {showFilters && (
          <div className="filters-panel">
            <div className="filter-grid">
              {options(reference.listValues.lead_type, "Any deal source", filters.leadTypeId, "leadTypeId")}
              {scope === "team" && (
                <select value={filters.ownerId} onChange={(event) => update({ ownerId: event.target.value })} aria-label="Owner">
                  <option value="">Any owner</option>
                  {owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              )}
            </div>
            {/* PD-23: deals created (first contact) or due a follow-up in a period, or on one day (From = To). */}
            <div className="date-filter" role="group" aria-label="Date filter">
              <CalendarRange size={15} />
              <select aria-label="Date" value={filters.dateField} onChange={(event) => update({ dateField: event.target.value as PipelineDateField })}>
                <option value="first_contact">Created (first contact)</option>
                <option value="follow_up">Follow-up date</option>
              </select>
              <input type="date" aria-label="From" value={filters.dateFrom} onChange={(event) => update({ dateFrom: event.target.value, dateTo: filters.dateTo && filters.dateTo < event.target.value ? event.target.value : filters.dateTo })} />
              <span>to</span>
              <input type="date" aria-label="To" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => update({ dateTo: event.target.value })} />
              <button type="button" className="text-button" onClick={() => update({ dateFrom: reference.today, dateTo: reference.today })}>Today</button>
            </div>
            <div className="filter-actions"><button className="text-button" onClick={() => setFilters((current) => ({ ...emptyFilters, q: current.q }))}>Clear filters</button></div>
          </div>
        )}
        {editable && <p className="form-note stage-edit-note"><Pencil size={14} /> Rename a stage in its box, move it with the arrows, or delete it; add one at the end. Changes apply to everyone&apos;s board.</p>}
        {lastMove && (
          <div className="pipeline-undo" role="status">
            <span>{lastMove.kind === "stage" ? "Moved" : "Changed"} <strong>{lastMove.clientName}</strong> to {lastMove.toName}.</span>
            <button className="text-button" onClick={undoLast}><Undo2 size={13} /> Undo</button>
          </div>
        )}
        <ErrorText message={error} />
        {!board && loading && <Loading text="Loading the board..." />}
        {board && board.total === 0 && !loading && !editable && (
          <div className="pipeline-empty">
            <EmptyState icon={<Kanban size={22} />} title={scope === "mine" ? "No deals of yours on the board" : "No deals on the board"} text={byStatus ? "Change the filters to see more deals." : "Deals appear here from the moment they are created until they become clients or are closed."} />
          </div>
        )}
        {board && (board.total > 0 || editable) && (
          <div className="pipeline-board" aria-busy={loading}>
            {columns.map((column, index) => (
              <section
                key={column.id}
                className={`pipeline-column ${overColumn === column.id ? "is-over" : ""} ${column.active ? "" : "is-inactive"}`}
                aria-label={`${column.value} ${byStatus ? "status" : "stage"}`}
                onDragOver={(event) => { if (dragging !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (overColumn !== column.id) setOverColumn(column.id); } }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverColumn((current) => (current === column.id ? null : current)); }}
                onDrop={onDrop(column)}
              >
                {editable
                  ? <EditableStageHead key={`${column.id}:${column.value}`} stage={column} first={index === 0} last={index === columns.length - 1} others={columns.filter((item) => item.id !== column.id && item.active)} onChanged={stagesChanged} />
                  : (
                    <header className="pipeline-column-head">
                      <h2>{column.value}{column.active ? "" : " (inactive)"}</h2>
                      <span>{column.valueTotal > 0 ? `${formatDealValue(column.valueTotal)} · ` : ""}{column.count} {column.count === 1 ? "deal" : "deals"}</span>
                      {/* PD-28: the column's own menu. */}
                      <ColumnMenu
                        name={column.value}
                        addLabel={byStatus ? "Add deal with this status" : "Add deal to this stage"}
                        listLabel={byStatus ? "View these deals in list view" : "View deals in this stage in list view"}
                        onAdd={can("create_leads") && column.active ? () => (byStatus ? openNewLeadFor({ prefill: { statusId: column.id } }) : openNewLeadIn(column.id)) : null}
                        onList={() => navigate("deals", "list", { [byStatus ? "statusId" : "stageId"]: String(column.id), scope: scope === "team" ? "everyone" : "mine" })}
                      />
                    </header>
                  )}
                <div className="pipeline-column-body">
                  {column.leads.map((card) => {
                    const next = nextStepOf(card);
                    const overdue = Boolean(next?.date && next.date < reference.today);
                    const movable = canMove(card) && !editable;
                    return (
                      <article
                        key={card.id}
                        className={`pipeline-card ${dragging === card.id ? "is-dragging" : ""} ${card.quiet ? "is-quiet" : ""}`}
                        draggable={movable}
                        onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(card.id)); event.dataTransfer.effectAllowed = "move"; setDragging(card.id); }}
                        onDragEnd={() => { setDragging(null); setOverColumn(null); }}
                      >
                        <div className="pipeline-card-head">
                          <button className="pipeline-card-title" onClick={() => openLead(card.id)}>
                            <strong>{card.clientName}</strong>
                            <small>{card.clientExecutive || "No contact yet"}{card.city ? ` · ${card.city}` : ""}</small>
                          </button>
                          {/* PD-22: one menu for moving, following up, To Do, converting to a client and archiving; it shows on hover or focus. */}
                          {!editable && (
                            <CardActions
                              card={card}
                              stages={(byStatus ? pipelineStages : columns.filter((item) => item.active || item.id === card.stageId)).map((item) => ({ id: item.id, value: item.value }))}
                              canEdit={canMove(card)}
                              onMove={(stageId) => void move(card, stageId)}
                              onConvert={clientStatus && card.statusCode !== "client" ? () => setConfirmClient({ card, statusId: null }) : null}
                              onChanged={(message) => { notify(message); bumpData(); }}
                            />
                          )}
                        </div>
                        <div className="pipeline-card-meta">
                          <span className="pipeline-owner" title={card.ownerName}><span className="mini-avatar">{initials(card.ownerName)}</span>{scope === "team" ? card.ownerName : null}</span>
                          <StatusPill status={card.statusLabel} code={card.statusCode} />
                          {card.dealValue !== null && <span className="deal-value" title="Deal value">{formatDealValue(card.dealValue)}</span>}
                        </div>
                        {byStatus
                          ? <small className="pipeline-action">{stageName(card.stageId)} · {relativeTime(card.lastActivityAt)}</small>
                          : <small className="pipeline-action">Last activity {relativeTime(card.lastActivityAt)}</small>}
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
                  {column.leads.length < column.count && (
                    <button className="text-button pipeline-more" disabled={loadingMore === column.id} onClick={() => void loadMore(column)}>
                      {loadingMore === column.id ? "Loading..." : `Show ${Math.min(column.count - column.leads.length, 50)} more`}
                    </button>
                  )}
                  {!column.leads.length && <p className="pipeline-column-empty">{dragging !== null ? "Drop here" : "No deals"}</p>}
                  {/* PD-28: a deal is added from its stage (or, on the board by status, with that status). */}
                  {!editable && can("create_leads") && column.active && dragging === null && (
                    <button className="pipeline-add" aria-label={`Add a deal in ${column.value}`} title={`Add a deal in ${column.value}`} onClick={() => (byStatus ? openNewLeadFor({ prefill: { statusId: column.id } }) : openNewLeadIn(column.id))}><Plus size={16} /></button>
                  )}
                </div>
              </section>
            ))}
            {editable && <AddStageColumn pipelineId={shownPipeline && !shownPipeline.isDefault ? shownPipeline.id : null} onChanged={stagesChanged} />}
          </div>
        )}
      </section>
      {nextStep && (
        <NextStepDialog lead={nextStep} reason={`You moved ${nextStep.clientName} to ${nextStep.stage}.`} onClose={() => setNextStep(null)} onSaved={(message) => { setNextStep(null); notify(message); bumpData(); }} />
      )}
      {confirmClient && (
        <ConvertToClientDialog
          dealName={confirmClient.card.clientName}
          onClose={() => setConfirmClient(null)}
          onConfirm={async () => {
            const { card, statusId } = confirmClient;
            setConfirmClient(null);
            if (statusId === null) await convertToClient(card); else await changeStatus(card, statusId, null, false, true);
          }}
        />
      )}
      {reasonFor && (
        <StatusReasonDialog
          leadName={reasonFor.card.clientName} statusName={reasonFor.statusName} options={reference.listValues[reasonFor.listKey]}
          onClose={() => setReasonFor(null)}
          onConfirm={async (statusReasonId) => { const pending = reasonFor; setReasonFor(null); await changeStatus(pending.card, pending.statusId, statusReasonId); }}
        />
      )}
    </>
  );
}

/** The "…" menu on a column head (PD-28): add a deal there, or see the column's deals in the list view. */
function ColumnMenu({ name, addLabel, listLabel, onAdd, onList }: { name: string; addLabel: string; listLabel: string; onAdd: (() => void) | null; onList: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "mousedown" && (event.target as Element | null)?.closest?.(".column-menu")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div className="column-menu">
      <button type="button" className="icon-button column-menu-button" aria-label={`More for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="menu-dropdown column-menu-list" role="menu" aria-label={`More for ${name}`}>
          {onAdd && <button type="button" role="menuitem" onClick={() => { setOpen(false); onAdd(); }}><Plus size={13} /> {addLabel}</button>}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onList(); }}><List size={13} /> {listLabel}</button>
        </div>
      )}
    </div>
  );
}
