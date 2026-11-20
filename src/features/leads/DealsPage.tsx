"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Archive, Clock3, Heart, List, Plus, SquareKanban, Tags } from "lucide-react";
import { useAsyncData } from "@/lib/useAsyncData";
import PipelinePage from "@/features/pipeline/PipelinePage";
import { useApp } from "@/features/shell/AppContext";
import { fetchLeads } from "./client";
import LeadListPage, { type LeadListView } from "./LeadListPage";

const statusModes = ["cold", "warm", "hot", "client"] as const;
type Tab = "board" | "status" | "list" | "queued" | "archive";

/**
 * The Pipeline page (the menu says "Pipeline" since PD-26; its records are deals): one heading, a view
 * switch (board by stage, board by status, list, archive, and the approval queue for people who review it) and the
 * "+ Deal" button. The address carries the view: #/deals (board), #/deals/status (PD-24), #/deals/list, #/deals/archive,
 * #/deals/queued, and #/deals/cold|warm|hot|client for the list of one status.
 */
export default function DealsPage({ mode }: { mode: string | null }) {
  const { user, can, route, navigate, openNewLead, dataVersion } = useApp();
  // Recruiters work from the list: the board is for the people who own deals.
  const boardAllowed = user.role !== "recruiter";
  const statusMode = statusModes.find((item) => item === mode) ?? null;
  // The heart (request of November 20, 2026) filters the open view to the person's favourites: the boards stay boards, the
  // list stays a list, and from the Archive or the queue it opens the list. #/deals/favorites (the first address) is the list.
  const favOnly = route.query.get("fav") === "1" || mode === "favorites";
  const tab: Tab = mode === "archive" ? "archive" : mode === "favorites" ? "list" : mode === "queued" && (can("review_queued") || can("edit_leads")) ? "queued" : statusMode || mode === "list" || !boardAllowed ? "list" : mode === "status" ? "status" : "board";
  const [scope, setScope] = useState<"mine" | "everyone">(() => {
    const asked = route.query.get("scope");
    if (asked === "mine" || asked === "everyone") return boardAllowed ? asked : "everyone";
    // A search from the top bar looks through everyone's deals.
    return !boardAllowed || user.role === "admin" || route.query.get("q") ? "everyone" : "mine";
  });
  const listView: LeadListView = tab === "archive" ? "archive" : favOnly && tab === "list" ? "favorites" : tab === "queued" ? "queued" : statusMode ?? (scope === "mine" ? "leads" : "all-leads");

  // Peer approval (request of November 20, 2026): the queue is open to everyone who may edit deals.
  const canReview = can("review_queued") || can("edit_leads");
  const queuedFetcher = useCallback(() => (canReview ? fetchLeads({ state: "queued", pageSize: 1 }).then((page) => page.total).catch(() => 0) : Promise.resolve(0)), [canReview]);
  const queued = useAsyncData(queuedFetcher, dataVersion).data ?? 0;

  const viewButton = (id: Tab, label: string, icon: ReactNode, count = 0) => (
    <button className={tab === id ? "is-active" : ""} aria-pressed={tab === id} aria-label={label} title={label} onClick={() => navigate("deals", id, favOnly && (id === "board" || id === "status" || id === "list") ? { fav: "1" } : undefined)}>
      {icon}{count > 0 && <span className="view-count">{count}</span>}
    </button>
  );

  return (
    <>
      <div className="deals-head">
        <h1 className="sr-only">Pipeline</h1>
        <div className="view-switch" role="group" aria-label="Pipeline view">
          {boardAllowed && viewButton("board", "Board", <SquareKanban size={16} />)}
          {boardAllowed && viewButton("status", "Board by status", <Tags size={16} />)}
          {viewButton("list", "List", <List size={16} />)}
          {viewButton("archive", "Archive", <Archive size={16} />)}
          {canReview && viewButton("queued", "Queued for approval", <Clock3 size={16} />, queued)}
          {/* Request of November 20, 2026: the deals the signed-in person marked with the heart. */}
          <button
            className={favOnly ? "is-active" : ""}
            aria-pressed={favOnly}
            aria-label="My favourites"
            title={favOnly ? "Showing your favourites: click to show all" : "Show only your favourites"}
            onClick={() => (favOnly
              ? navigate("deals", tab === "board" ? undefined : tab === "archive" || tab === "queued" ? "list" : tab)
              : navigate("deals", tab === "board" || tab === "status" ? (tab === "board" ? undefined : "status") : "list", { fav: "1" }))}
          >
            <Heart size={16} className="view-fav-icon" fill={favOnly ? "currentColor" : "none"} />
          </button>
        </div>
        {/* PD-28: on the boards a deal is added from its stage ("+" and the column's "…"); the list keeps the button. */}
        {can("create_leads") && tab === "list" && <button className="button button-primary deal-add" onClick={openNewLead}><Plus size={16} /> Deal</button>}
        <span className="deals-head-spacer" />
        {tab === "list" && !statusMode && !favOnly && boardAllowed && (
          <div className="scope-toggle" role="group" aria-label="Whose deals">
            <button className={scope === "mine" ? "is-active" : ""} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>My Deals</button>
            <button className={scope === "everyone" ? "is-active" : ""} aria-pressed={scope === "everyone"} onClick={() => setScope("everyone")}>Everyone</button>
          </div>
        )}
      </div>
      {tab === "board" || tab === "status" ? <PipelinePage key={`${tab}-${favOnly}`} groupBy={tab === "status" ? "status" : "stage"} favoritesOnly={favOnly} /> : <LeadListPage key={listView} view={listView} embedded />}
    </>
  );
}
