"use client";

import {
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { leadStatuses } from "./model";
import type { LeadStatus, StoredLead } from "./model";

type LeadTableProps = {
  leads: StoredLead[];
  totalCount: number;
  activeView: string;
  selected: number[];
  search: string;
  statusFilter: LeadStatus | "All statuses";
  mode?: "table" | "follow-up";
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: LeadStatus | "All statuses") => void;
  onSelectionChange: (ids: number[]) => void;
  onToggleSelected: (id: number) => void;
  onArchiveSelected: () => void;
  onOpenLead: (lead: StoredLead) => void;
  onReviewQueued: (lead: StoredLead, approve: boolean) => void;
  onRestoreLead: (lead: StoredLead) => void;
  onNotify: (message: string) => void;
};

const statusClassName = (status: LeadStatus) => status.toLowerCase().replaceAll(" ", "-");

export default function LeadTable({
  leads,
  totalCount,
  activeView,
  selected,
  search,
  statusFilter,
  mode = "table",
  onSearchChange,
  onStatusFilterChange,
  onSelectionChange,
  onToggleSelected,
  onArchiveSelected,
  onOpenLead,
  onReviewQueued,
  onRestoreLead,
  onNotify,
}: LeadTableProps) {
  return (
    <div className="lead-list-wrap">
      <div className="lead-toolbar">
        <div className="search-field lead-search">
          <Search size={16} />
          <input
            aria-label="Search leads"
            placeholder="Search clients, contacts, notes..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <label className="select-filter">
          <Filter size={15} />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => {
              const status = leadStatuses.find((option) => option === event.target.value);
              onStatusFilterChange(status ?? "All statuses");
            }}
          >
            <option>All statuses</option>
            {leadStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <button className="icon-button filter-button" aria-label="More filters" onClick={() => onNotify("Advanced filters are ready to configure.")}>
          <Filter size={16} />
        </button>
      </div>
      {selected.length > 0 && activeView !== "queued" && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          <button onClick={onArchiveSelected}><FileText size={14} /> {activeView === "archive" ? "Restore selected" : "Archive selected"}</button>
          <button className="bulk-clear" onClick={() => onSelectionChange([])}>Clear selection</button>
        </div>
      )}
      <div className="table-scroll">
        <table className="lead-table">
          <thead>
            <tr>
              <th><input aria-label="Select all leads" type="checkbox" checked={leads.length > 0 && leads.every((lead) => selected.includes(lead.id))} onChange={(event) => onSelectionChange(event.target.checked ? leads.map((lead) => lead.id) : [])} /></th>
              <th>CLIENT</th>
              <th>STATUS</th>
              <th>ACTION</th>
              <th>FOLLOW-UP</th>
              <th>OWNER</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className={mode === "follow-up" && lead.followUp === "Today" ? "row-due" : ""}>
                <td><input aria-label={`Select ${lead.name}`} type="checkbox" checked={selected.includes(lead.id)} onChange={() => onToggleSelected(lead.id)} /></td>
                <td>
                  <button className="client-cell" onClick={() => onOpenLead(lead)}>
                    <span className={`avatar avatar-${lead.color}`}>{lead.initials}</span>
                    <span><strong>{lead.name}</strong><small>{lead.contact} · {lead.city}</small></span>
                  </button>
                </td>
                <td><span className={`status-pill status-${statusClassName(lead.status)}`}><i />{lead.status}</span></td>
                <td><span className="action-cell">{lead.action}</span><small className="activity-time">{lead.lastActivity}</small></td>
                <td><span className={lead.followUp === "Today" ? "due-today" : "muted-cell"}>{lead.followUp === "Today" && <Clock3 size={13} />}{lead.followUp}</span></td>
                <td><span className="owner-cell"><span className="mini-avatar">SL</span>{lead.owner}</span></td>
                <td>
                  {activeView === "queued" ? (
                    <span className="review-actions"><button onClick={() => onReviewQueued(lead, true)}>Approve</button><button onClick={() => onReviewQueued(lead, false)}>Reject</button></span>
                  ) : activeView === "archive" ? (
                    <button className="restore-button" onClick={() => onRestoreLead(lead)}>Restore</button>
                  ) : (
                    <button className="row-more" aria-label={`Open ${lead.name}`} onClick={() => onOpenLead(lead)}><MoreHorizontal size={18} /></button>
                  )}
                </td>
              </tr>
            ))}
            {!leads.length && <tr><td colSpan={7} className="empty-state">No leads match your search. Try another name or status.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>Showing <strong>{leads.length}</strong> of <strong>{totalCount}</strong> leads</span><button onClick={() => onNotify("You’re viewing the latest activity first.")}>Recently active <ChevronDown size={14} /></button></div>
    </div>
  );
}
