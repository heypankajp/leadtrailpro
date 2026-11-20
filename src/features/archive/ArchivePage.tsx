"use client";

import { useCallback, useState } from "react";
import { ArchiveRestore, Archive as ArchiveIcon, Search, UserRound } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import LeadListPage from "@/features/leads/LeadListPage";
import { fetchOpportunities, unarchiveOpportunity } from "@/features/opportunities/client";
import type { Opportunity, OpportunityOrigin } from "@/features/opportunities/model";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState, ErrorText, Loading, Pagination } from "@/features/shell/components";

type Tab = "leads" | "deals";
const pageSize = 50;

/**
 * Archive (request of November 20, 2026), last under Tools: archived leads and archived deals, each in its own tab, restored
 * from here. Leads come from Leads (added by hand) or Lead Generation (found by the job searches); a lead marked not relevant
 * moves here by itself after the days set in List of Values (90 to start), or anyone moves one here with Archive.
 */
export default function ArchivePage({ tab }: { tab: Tab }) {
  const { navigate } = useApp();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TOOLS</div>
          <h1>Archive</h1>
          <p>Archived leads and deals. Restore one to bring it back.</p>
        </div>
      </div>
      <div className="opp-tabs">
        <div className="followup-tabs tab-strip" role="tablist">
          {(["leads", "deals"] as const).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`followup-tab ${tab === id ? "is-active" : ""}`} onClick={() => navigate("archives", id === "leads" ? undefined : id)}>
              {id === "leads" ? "Leads" : "Deals"}
            </button>
          ))}
        </div>
      </div>
      {tab === "leads" ? <ArchivedLeads /> : <div className="archive-deals"><LeadListPage view="archive" embedded /></div>}
    </>
  );
}

const origins: { id: OpportunityOrigin | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "manual", label: "Manual" },
  { id: "found", label: "Generated" },
];

function ArchivedLeads() {
  const { can, notify, dataVersion, bumpData } = useApp();
  const [origin, setOrigin] = useState<OpportunityOrigin | "all">("all");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | null>(null);
  const fetcher = useCallback(() => fetchOpportunities({ status: "new", archived: "1", page, pageSize, search: filter.trim(), origin: origin === "all" ? undefined : origin }), [origin, filter, page]);
  const { data, error, reload } = useAsyncData(fetcher, dataVersion);

  const restore = async (item: Opportunity) => {
    setBusy(item.id);
    try {
      await unarchiveOpportunity(item.id);
      notify(`${item.companyName} is back in the inbox of ${item.addedByName || item.tracker || item.listingsCount === 0 ? "Leads" : "Lead Generation"}`);
      bumpData();
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel">
      <div className="opp-toolbar">
        <div className="opp-toolbar-left">
          <div className="scope-toggle" role="group" aria-label="Kind of lead">
            {origins.map((item) => (
              <button key={item.id} type="button" className={origin === item.id ? "is-active" : ""} aria-pressed={origin === item.id} onClick={() => { setOrigin(item.id); setPage(1); }}>{item.label}</button>
            ))}
          </div>
          <label className="opp-search"><Search size={13} /><input placeholder="Filter by company, role, or location" aria-label="Filter archived leads" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} /></label>
        </div>
        {data && <small className="field-hint">{data.total} {data.total === 1 ? "lead" : "leads"}</small>}
      </div>
      {error && <ErrorText message={error} />}
      {!data && !error ? <Loading /> : data && data.opportunities.length === 0 ? (
        <EmptyState icon={<ArchiveIcon size={22} />} title="No archived leads" text="Leads you archive, and leads not relevant for longer than the days set in List of Values, appear here." />
      ) : data && (
        <table className="opp-table">
          <thead><tr><th>Company</th><th>Kind</th><th>Was</th><th>Archived</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {data.opportunities.map((item) => {
              const manual = Boolean(item.addedByName || item.tracker || item.listingsCount === 0);
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.companyName}</strong>
                    <small className="muted-cell">{[item.location, item.addedByName ? `Added by ${item.addedByName}` : "", item.latestTitle].filter(Boolean).join(" · ")}</small>
                    {item.contacts.length > 0 && <small className="opp-contacts"><UserRound size={11} /> {item.contacts.map((contact) => contact.name).join(", ")}</small>}
                  </td>
                  <td>{manual ? "Manual" : "Generated"}<small className="muted-cell">{manual ? "Leads" : "Lead Generation"}</small></td>
                  <td>
                    {item.status === "not_relevant" ? "Not Relevant" : "In the Inbox"}
                    {item.status === "not_relevant" && item.reason && <small className="muted-cell">{item.reason}{item.decidedAt ? ` · ${formatDate(item.decidedAt.slice(0, 10))}` : ""}</small>}
                  </td>
                  <td>
                    <span title={item.archivedAt ? formatDateTime(item.archivedAt) : undefined}>{item.archivedAt ? formatDate(item.archivedAt.slice(0, 10)) : "—"}</span>
                    <small className="muted-cell">{item.archiveKind === "auto" ? "Automatically, not relevant too long" : item.archivedByName ? `By ${item.archivedByName}` : "By hand"}</small>
                  </td>
                  <td>
                    <div className="opp-actions">
                      {can("create_leads") && <button type="button" className="button button-outline button-small" disabled={busy === item.id} onClick={() => void restore(item)} aria-label={`Restore ${item.companyName}`}><ArchiveRestore size={13} /> Restore</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data && data.total > pageSize && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
