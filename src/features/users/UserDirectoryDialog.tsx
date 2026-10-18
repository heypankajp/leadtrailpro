"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, Dialog, EmptyState } from "@/features/shell/components";
import type { UserSummary } from "./model";

type Props = {
  title: string;
  description?: string;
  users: UserSummary[];
  excludeIds?: number[];
  confirmLabel?: string;
  onPick: (user: UserSummary) => void;
  onClose: () => void;
};

/** Pick a person from the active directory (transfer, reassign, terminate hand-off). */
export default function UserDirectoryDialog({ title, description, users, excludeIds = [], confirmLabel = "Select", onPick, onClose }: Props) {
  const { roleLabel } = useApp();
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLowerCase();
  const visible = users.filter((user) => !excludeIds.includes(user.id) && (!normalized || user.name.toLowerCase().includes(normalized)));
  return (
    <Dialog title={title} eyebrow="TEAM" onClose={onClose} size="narrow">
      {description && <p className="dialog-description">{description}</p>}
      <div className="search-field picker-search"><Search size={15} /><input aria-label="Search people" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus /></div>
      <div className="user-directory-list">
        {visible.map((user) => (
          <article className="user-directory-row" key={user.id}>
            <Avatar name={user.name} seed={user.id} className="user-directory-avatar" />
            <div className="user-directory-details"><strong>{user.name}</strong><span>{roleLabel(user.role)}</span></div>
            <button className="button button-outline button-small" onClick={() => onPick(user)}>{confirmLabel}</button>
          </article>
        ))}
        {!visible.length && <EmptyState title="No matching people" text="Only active Sales Managers and Admins can own leads." />}
      </div>
    </Dialog>
  );
}
