"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, ErrorText, Loading, Pagination } from "@/features/shell/components";
import { fetchContactsTimeline } from "./client";
import { timelineCell, timelineMonthLabel, type ContactsTimeline as Timeline } from "./model";

/**
 * Contacts → Timeline, after Pipedrive's contacts timeline (SPEC §10.17): one row per person, one column per month of
 * the last twelve, and in each cell how often the person was contacted (calls, emails, visits, notes on their deals
 * and on themselves). An empty stretch on the right is someone who has gone quiet.
 */
export default function ContactsTimeline() {
  const { openContact, dataVersion } = useApp();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  const fetcher = useCallback(() => fetchContactsTimeline(debouncedQ, page), [debouncedQ, page]);
  const { data, error, loading } = useAsyncData<Timeline>(fetcher, dataVersion);
  const search = (value: string) => { setQ(value); setPage(1); };

  return (
    <section className="panel leads-panel">
      <div className="lead-list-wrap">
        <div className="lead-toolbar">
          <div className="search-field lead-search">
            <Search size={16} />
            <input aria-label="Search the timeline" placeholder="Search name or organization..." value={q} onChange={(event) => search(event.target.value)} />
            {q && <button className="clear-search" aria-label="Clear search" onClick={() => search("")}><X size={13} /></button>}
          </div>
        </div>
        <ErrorText message={error} />
        {loading && !data ? <Loading text="Loading the timeline..." /> : data && (
          <div className="table-scroll">
            <table className="lead-table contacts-table timeline-table">
              <thead>
                <tr>
                  <th>PERSON</th>
                  {data.months.map((month, index) => <th key={month} className="tl-month">{timelineMonthLabel(month, index === 0).toUpperCase()}</th>)}
                  <th>LAST CONTACT</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button className="client-cell" onClick={() => openContact("person", row.id)}>
                        <Avatar name={row.name} seed={row.id} />
                        <span><strong>{row.name}</strong><small>{row.organization ?? "No organization"}</small></span>
                      </button>
                    </td>
                    {data.months.map((month) => {
                      const cell = timelineCell(row.months[month]);
                      return <td key={month} className="tl-cell">{cell.total > 0 && <span className={`tl-dot ${cell.total >= 5 ? "tl-many" : cell.total >= 2 ? "tl-some" : ""}`} title={cell.text} aria-label={`${timelineMonthLabel(month, true)}: ${cell.text}`}>{cell.total}</span>}</td>;
                    })}
                    <td><span className="muted-cell">{relativeTime(row.lastContactAt, "No contact in 12 months")}</span></td>
                  </tr>
                ))}
                {!data.rows.length && <tr><td colSpan={data.months.length + 2} className="empty-state">{debouncedQ ? "No people match this search." : "No people yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="table-footer">
            <span>Showing <strong>{data.rows.length}</strong> of <strong>{data.total}</strong> people · calls, emails, visits and notes per month{loading ? " · refreshing" : ""}</span>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </section>
  );
}
