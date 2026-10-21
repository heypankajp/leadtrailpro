"use client";

import { Clock3, MoreHorizontal } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/format";
import { Avatar, StatusPill } from "@/features/shell/components";
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
};

export default function LeadTable({ leads, selected, today, view, canSelect, canReview, canRestore, onToggle, onToggleAll, onOpen, onReview, onRestore }: LeadTableProps) {
  const allSelected = leads.length > 0 && leads.every((lead) => selected.includes(lead.id));
  return (
    <div className="table-scroll">
      <table className="lead-table">
        <thead>
          <tr>
            {canSelect && <th><input aria-label="Select all leads" type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} /></th>}
            <th>CLIENT</th>
            <th>STATUS</th>
            <th>LAST BD ACTION</th>
            <th>{view === "archive" ? "REASON" : "FOLLOW-UP"}</th>
            <th>FIRST CONTACT</th>
            <th>OWNER</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const overdue = Boolean(lead.followUpDate && lead.followUpDate < today);
            const dueToday = lead.followUpDate === today;
            return (
              <tr key={lead.id} className={overdue && view !== "archive" ? "row-due" : ""}>
                {canSelect && <td><input aria-label={`Select ${lead.clientName}`} type="checkbox" checked={selected.includes(lead.id)} onChange={() => onToggle(lead.id)} /></td>}
                <td>
                  <button className="client-cell" onClick={() => onOpen(lead)}>
                    <Avatar name={lead.clientName} seed={lead.id} />
                    <span><strong>{lead.clientName}</strong><small>{lead.clientExecutive || "No contact yet"}{lead.city ? ` · ${lead.city}` : ""}</small></span>
                  </button>
                </td>
                <td><StatusPill status={lead.statusLabel} code={lead.statusCode} /></td>
                <td><span className="action-cell">{lead.bdAction ?? "—"}</span><small className="activity-time">{relativeTime(lead.lastActivityAt)}</small></td>
                <td>
                  {view === "archive"
                    ? <span className="muted-cell reason-cell">{lead.stateReason || "—"}</span>
                    : <span className={dueToday ? "due-today" : overdue ? "overdue" : "muted-cell"}>{(dueToday || overdue) && <Clock3 size={13} />}{formatDate(lead.followUpDate, "—")}</span>}
                </td>
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
            );
          })}
          {!leads.length && <tr><td colSpan={canSelect ? 8 : 7} className="empty-state">No leads match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
