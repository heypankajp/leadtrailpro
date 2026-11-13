"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Archive, Clock3, List, Plus, SquareKanban } from "lucide-react";
import { useAsyncData } from "@/lib/useAsyncData";
import PipelinePage from "@/features/pipeline/PipelinePage";
import { useApp } from "@/features/shell/AppContext";
import { fetchLeads } from "./client";
import LeadListPage, { type LeadListView } from "./LeadListPage";

const statusModes = ["cold", "warm", "hot", "client"] as const;
type Tab = "board" | "list" | "queued" | "archive";

/**
 * The Deals page, after Pipedrive's: one heading, a view switch (board, list, archive, and the approval queue for
 * people who review it) and the "+ Deal" button. The address carries the view: #/deals (board), #/deals/list,
 * #/deals/archive, #/deals/queued, and #/deals/cold|warm|hot|client for the list of one status.
 */
export default function DealsPage({ mode }: { mode: string | null }) {
  const { user, can, route, navigate, openNewLead, dataVersion } = useApp();
  // Recruiters work from the list: the board is for the people who own deals.
  const boardAllowed = user.role !== "recruiter";
  const statusMode = statusModes.find((item) => item === mode) ?? null;
  const tab: Tab = mode === "archive" ? "archive" : mode === "queued" && can("review_queued") ? "queued" : statusMode || mode === "list" || !boardAllowed ? "list" : "board";
  const [scope, setScope] = useState<"mine" | "everyone">(() => {
    const asked = route.query.get("scope");
    if (asked === "mine" || asked === "everyone") return boardAllowed ? asked : "everyone";
    // A search from the top bar looks through everyone's deals.
    return !boardAllowed || user.role === "admin" || route.query.get("q") ? "everyone" : "mine";
  });
  const listView: LeadListView = tab === "archive" ? "archive" : tab === "queued" ? "queued" : statusMode ?? (scope === "mine" ? "leads" : "all-leads");

  const canReview = can("review_queued");
  const queuedFetcher = useCallback(() => (canReview ? fetchLeads({ state: "queued", pageSize: 1 }).then((page) => page.total).catch(() => 0) : Promise.resolve(0)), [canReview]);
  const queued = useAsyncData(queuedFetcher, dataVersion).data ?? 0;

  const viewButton = (id: Tab, label: string, icon: ReactNode, count = 0) => (
    <button className={tab === id ? "is-active" : ""} aria-pressed={tab === id} aria-label={label} title={label} onClick={() => navigate("deals", id)}>
      {icon}{count > 0 && <span className="view-count">{count}</span>}
    </button>
  );

  return (
    <>
      <div className="deals-head">
        <h1 className="sr-only">Deals</h1>
        <div className="view-switch" role="group" aria-label="Deals view">
          {boardAllowed && viewButton("board", "Board", <SquareKanban size={16} />)}
          {viewButton("list", "List", <List size={16} />)}
          {viewButton("archive", "Archive", <Archive size={16} />)}
          {canReview && viewButton("queued", "Queued for approval", <Clock3 size={16} />, queued)}
        </div>
        {can("create_leads") && tab !== "archive" && tab !== "queued" && <button className="button button-primary deal-add" onClick={openNewLead}><Plus size={16} /> Deal</button>}
        <span className="deals-head-spacer" />
        {tab === "list" && !statusMode && boardAllowed && (
          <div className="scope-toggle" role="group" aria-label="Whose deals">
            <button className={scope === "mine" ? "is-active" : ""} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>My deals</button>
            <button className={scope === "everyone" ? "is-active" : ""} aria-pressed={scope === "everyone"} onClick={() => setScope("everyone")}>Everyone</button>
          </div>
        )}
      </div>
      {tab === "board" ? <PipelinePage /> : <LeadListPage key={listView} view={listView} embedded />}
    </>
  );
}
