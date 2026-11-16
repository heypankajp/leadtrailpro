"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArrowRightLeft, CalendarCheck2, Check, ListChecks, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { setLeadState, setLeadTodo } from "@/features/leads/client";
import { ScheduleActivityDialog } from "@/features/tasks/ScheduleActivity";
import { useApp } from "@/features/shell/AppContext";
import { PromptDialog } from "@/features/shell/components";
import type { PipelineCard } from "./model";

type Choice = { id: number; value: string };

/**
 * The ⇄ button on a board card (PD-22, SPEC §10.19): one menu for what is done to a deal without opening it. Move to
 * stage, Add follow-up, Add to To Do list ("To be visited" is where the team parks a deal for a visit), and Archive.
 * Each action needs the same rights as on the deal page. The menu is drawn over the page (fixed), so a column's own
 * scrolling never cuts it off.
 */
export default function CardActions({ card, stages, canEdit, onMove, onChanged }: {
  card: PipelineCard; stages: Choice[]; canEdit: boolean;
  onMove: (stageId: number) => void;
  onChanged: (message: string) => void;
}) {
  const { can, reference, notify } = useApp();
  // Where the menu is drawn: below the button, or above it when there is more room there; never past the window's edge.
  const [open, setOpen] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const [dialog, setDialog] = useState<"follow-up" | "archive" | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const todoLists = reference.listValues.todo_list.filter((item) => item.active || item.id === card.todoListId);
  const canFollowUp = canEdit && can("manage_tasks");
  const canArchive = can("archive_leads");

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "mousedown" && (menu.current?.contains(event.target as Node) || button.current?.contains(event.target as Node))) return;
      if (event.type === "scroll" && menu.current?.contains(event.target as Node)) return;
      setOpen(null);
      if (event.type === "keydown") button.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }, [open]);

  if (!canEdit && !canArchive) return null;
  const toggle = () => {
    if (open) { setOpen(null); return; }
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 240;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    setOpen(below >= 320 || below >= above
      ? { top: rect.bottom + 4, left, maxHeight: Math.max(below, 120) }
      : { bottom: window.innerHeight - rect.top + 4, left, maxHeight: Math.max(above, 120) });
  };
  const run = (action: () => void) => { setOpen(null); action(); };
  const changeTodo = async (listId: number | null) => {
    try {
      const result = await setLeadTodo(card.id, listId);
      onChanged(result.lead.todoList ? `${card.clientName} moved to To Do: ${result.lead.todoList}` : `${card.clientName} taken off the To Do list`);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  return (
    <>
      <button ref={button} type="button" className="pipeline-move" aria-label={`Actions for ${card.clientName}`} title="Move, follow up, To Do, archive" aria-haspopup="menu" aria-expanded={Boolean(open)} onClick={toggle}>
        <ArrowRightLeft size={13} />
      </button>
      {open && createPortal(
        <div ref={menu} className="menu-dropdown card-menu" role="menu" aria-label={`Actions for ${card.clientName}`} style={{ top: open.top ?? "auto", bottom: open.bottom ?? "auto", left: open.left, maxHeight: open.maxHeight }}>
          {canEdit && stages.length > 1 && (
            <>
              <div className="card-menu-label">Move to stage</div>
              {stages.map((stage) => (
                <button key={stage.id} role="menuitem" disabled={stage.id === card.stageId} onClick={() => run(() => onMove(stage.id))}>
                  {stage.id === card.stageId ? <Check size={13} /> : <span className="card-menu-gap" />} {stage.value}
                </button>
              ))}
            </>
          )}
          {canFollowUp && <><div className="card-menu-rule" /><button role="menuitem" onClick={() => run(() => setDialog("follow-up"))}><CalendarCheck2 size={13} /> Add follow-up</button></>}
          {canEdit && todoLists.length > 0 && (
            <>
              <div className="card-menu-rule" />
              <div className="card-menu-label">Add to To Do list</div>
              {todoLists.map((list) => (
                <button key={list.id} role="menuitem" disabled={list.id === card.todoListId} onClick={() => run(() => void changeTodo(list.id))}>
                  {list.id === card.todoListId ? <Check size={13} /> : <ListChecks size={13} />} {list.value}
                </button>
              ))}
              {card.todoListId && <button role="menuitem" onClick={() => run(() => void changeTodo(null))}><X size={13} /> Take off To Do</button>}
            </>
          )}
          {canArchive && <><div className="card-menu-rule" /><button role="menuitem" onClick={() => run(() => setDialog("archive"))}><Archive size={13} /> Archive</button></>}
        </div>,
        document.body,
      )}
      {/* PD-29: Add follow-up opens the Schedule an activity form. */}
      {dialog === "follow-up" && <ScheduleActivityDialog deal={card} canSetFollowUp={canEdit} onClose={() => setDialog(null)} onSaved={(message) => { setDialog(null); onChanged(`${message} · ${card.clientName}`); }} />}
      {dialog === "archive" && (
        <PromptDialog
          title={`Archive ${card.clientName}`} eyebrow="ARCHIVE" label="Reason (optional)" confirmLabel="Archive deal"
          description="The deal leaves the board. It can be restored from the archive."
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => { await setLeadState(card.id, "archived", reason); setDialog(null); onChanged(`${card.clientName} archived`); }}
        />
      )}
    </>
  );
}
