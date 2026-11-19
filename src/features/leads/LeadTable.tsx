"use client";

import { Fragment } from "react";
import { Clock3, ListChecks, MailOpen, MoreHorizontal } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/format";
import { Avatar, StatusPill } from "@/features/shell/components";
import { replyWaiting } from "@/features/gmail/watch-model";
import { indexLetter } from "@/features/contacts/model";
import type { LeadSummary } from "./model";

export type LeadTableProps = {
  leads: LeadSummary[];
  selected: number[];
  today: string;
  view: string;
  canSelect: boolean;
  canReview: boolean;
  canRestore: boolean;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (lead: LeadSummary) => void;
  onReview: (lead: LeadSummary, approve: boolean) => void;
  onRestore: (lead: LeadSummary) => void;
  /** The list is sorted by client name: a letter heading ("U") goes before each first letter, with this id prefix. */
  letterAnchors?: string;
};

export default function LeadTable({ leads, selected, today, view, canSelect, canReview, canRestore, onToggle, onToggleAll, onOpen, onReview, onRestore, letterAnchors }: LeadTableProps) {
  const columns = (canSelect ? 9 : 8) + (view === "archive" ? 1 : 0);
  const heading = (index: number) => {
    if (!letterAnchors) return null;
    const letter = indexLetter(leads[index].clientName);
    if (index > 0 && indexLetter(leads[index - 1].clientName) === letter) return null;
    return <tr className="contacts-letter-row" id={`${letterAnchors}${letter === "#" ? "other" : letter}`}><td colSpan={columns}>{letter}</td></tr>;
  };
  const allSelected = leads.length > 0 && leads.every((lead) => selected.includes(lead.id));
  return (
    <div className="table-scroll">
      <table className="lead-table">
        <thead>
          <tr>
            {canSelect && <th><input aria-label="Select all deals" type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} /></th>}
            <th>CLIENT</th>
            <th>STATUS</th>
            <th>STAGE</th>
            <th>LAST ACTIVITY</th>
            <th>{view === "archive" ? "REASON" : "FOLLOW-UP"}</th>
            {view === "archive" && <th>NOTES</th>}
            <th>FIRST CONTACT</th>
            <th>OWNER</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, index) => {
            const overdue = Boolean(lead.followUpDate && lead.followUpDate < today);
            const dueToday = lead.followUpDate === today;
            return (
              <Fragment key={lead.id}>
              {heading(index)}
              <tr className={overdue && view !== "archive" ? "row-due" : ""}>
                {canSelect && <td><input aria-label={`Select ${lead.clientName}`} type="checkbox" checked={selected.includes(lead.id)} onChange={() => onToggle(lead.id)} /></td>}
                <td>
                  <button className="client-cell" onClick={() => onOpen(lead)}>
                    <Avatar name={lead.clientName} seed={lead.id} />
                    <span><strong>{lead.clientName}</strong><small>{lead.clientExecutive || "No contact yet"}{lead.city ? ` · ${lead.city}` : ""}</small></span>
                  </button>
                  {lead.todoList && <small className="todo-badge"><ListChecks size={11} /> To Do: {lead.todoList}{lead.todoSince ? ` · since ${relativeTime(lead.todoSince)}` : ""}</small>}
                  {lead.lastClientEmailAt && <small className={replyWaiting(lead) ? "reply-badge reply-waiting" : "reply-badge"}><MailOpen size={11} /> Client wrote {relativeTime(lead.lastClientEmailAt)}{replyWaiting(lead) ? " · awaiting reply" : ""}</small>}
                </td>
                <td><StatusPill status={lead.statusLabel} code={lead.statusCode} /></td>
                <td><span className="muted-cell stage-cell">{lead.stage ?? "—"}</span></td>
                <td><span className="action-cell">{relativeTime(lead.lastActivityAt)}</span></td>
                <td>
                  {/* Review of November 18, 2026: the archive shows the Archival reason and the notes typed with it. */}
                  {view === "archive"
                    ? <span className="reason-cell">{lead.archiveReason ?? "—"}</span>
                    : <span className={dueToday ? "due-today" : overdue ? "overdue" : "muted-cell"}>{(dueToday || overdue) && <Clock3 size={13} />}{formatDate(lead.followUpDate, "—")}</span>}
                </td>
                {view === "archive" && <td><span className="muted-cell reason-cell">{lead.stateReason || "—"}</span></td>}
                <td><span className="muted-cell">{formatDate(lead.firstContactDate)}</span></td>
                <td><span className="owner-cell"><span className="mini-avatar">{lead.ownerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>{lead.ownerName}</span></td>
                <td>
                  {view === "queued" && canReview ? (
                    <span className="review-actions"><button onClick={() => onReview(lead, true)}>Approve</button><button onClick={() => onReview(lead, false)}>Reject</button></span>
                  ) : view === "archive" && canRestore ? (
                    <button className="restore-button" onClick={() => onRestore(lead)}>Restore</button>
                  ) : (
                    <button className="row-more" aria-label={`Open ${lead.clientName}`} onClick={() => onOpen(lead)}><MoreHorizontal size={18} /></button>
                  )}
                </td>
              </tr>
              </Fragment>
            );
          })}
          {!leads.length && <tr><td colSpan={(canSelect ? 9 : 8) + (view === "archive" ? 1 : 0)} className="empty-state">No deals match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
