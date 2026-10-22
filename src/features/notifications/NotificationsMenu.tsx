"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Bell, CheckCheck, CalendarCheck2, Mail, Paperclip, Users, UserRound, Inbox, MessageSquare } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useApp } from "@/features/shell/AppContext";
import { fetchNotifications, markNotificationsRead } from "./client";
import type { AppNotification } from "./model";

const pollSeconds = 60;

const icon = (type: AppNotification["type"]) => {
  switch (type) {
    case "task_assigned": case "task_updated": case "task_completed": return <CalendarCheck2 size={14} />;
    case "lead_transferred": return <UserRound size={14} />;
    case "queued_lead": case "queued_reviewed": return <Users size={14} />;
    case "file_uploaded": return <Paperclip size={14} />;
    case "mention": return <AtSign size={14} />;
    case "daily_digest": case "weekly_digest": return <Mail size={14} />;
    default: return <MessageSquare size={14} />;
  }
};

/** The bell in the top bar (NTF-01 in-app channel): unread count, latest notifications, mark as read, jump to the record. */
export default function NotificationsMenu() {
  const { navigate, openLead, notify, dataVersion } = useApp();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const anchor = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (withList: boolean) => {
    try {
      const page = await fetchNotifications({ limit: withList ? 20 : 1 });
      setUnread(page.unread);
      if (withList) setItems(page.notifications);
    } catch {
      /* the next poll retries */
    }
  }, []);

  // The first fetch runs from a timer callback rather than the effect body (React Compiler rule), like the shell's toasts.
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(open); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, open, dataVersion]);
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(open); }, pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, open]);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (anchor.current && !anchor.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const markAll = async () => {
    try {
      const result = await markNotificationsRead("all");
      setUnread(result.unread);
      setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? null);
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  const openItem = async (item: AppNotification) => {
    if (!item.readAt) {
      try { const result = await markNotificationsRead([item.id]); setUnread(result.unread); } catch { /* ignore */ }
      setItems((current) => current?.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)) ?? null);
    }
    if (item.leadId) { setOpen(false); openLead(item.leadId); return; }
    if (item.taskId) { setOpen(false); navigate("tasks", item.taskId); return; }
    setExpanded((current) => (current === item.id ? null : item.id));
  };

  return (
    <div className="menu-anchor notif-anchor" ref={anchor}>
      <button className="topbar-icon notif-button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <Bell size={17} />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="menu-dropdown notif-dropdown" role="menu" aria-label="Notifications">
          <div className="notif-head"><strong>Notifications</strong>{unread > 0 && <button className="text-button" onClick={() => void markAll()}><CheckCheck size={13} /> Mark all read</button>}</div>
          {items === null ? <p className="notif-empty">Loading...</p> : items.length === 0 ? <p className="notif-empty"><Inbox size={16} /> You are all caught up.</p> : (
            <ul className="notif-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button className={`notif-item ${item.readAt ? "" : "is-unread"}`} role="menuitem" onClick={() => void openItem(item)}>
                    <span className="notif-icon">{icon(item.type)}</span>
                    <span className="notif-text"><strong>{item.title}</strong>{expanded === item.id && item.body ? <pre className="notif-body">{item.body}</pre> : item.body && !item.leadId && !item.taskId ? <small>Click to expand</small> : item.body ? <small>{item.body.slice(0, 120)}</small> : null}<small className="notif-time">{relativeTime(item.createdAt)}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
