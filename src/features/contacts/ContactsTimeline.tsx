"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, ErrorText, Loading, Pagination } from "@/features/shell/components";
import { fetchContactsTimeline } from "./client";
import { timelineCell, timelineMonthLabel, type ContactsTimeline as Timeline, type TimelineCounts } from "./model";

/** All of a person's contacts over the twelve months, by type. */
const yearCounts = (months: Record<string, TimelineCounts>): TimelineCounts => {
  const sum: TimelineCounts = {};
  for (const counts of Object.values(months)) for (const [type, count] of Object.entries(counts) as [keyof TimelineCounts, number][]) sum[type] = (sum[type] ?? 0) + count;
  return sum;
};

/**
 * Contacts → Timeline (SPEC §10.17): one row per person, one column per month of
 * the last twelve, and in each cell how often the person was contacted (calls, emails, visits, notes on their deals
 * and on themselves). An empty stretch on the right is someone who has gone quiet.
 */
export default function ContactsTimeline() {
  const { openContact, dataVersion } = useApp();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  // The month picked on the right-hand rail (request of November 20, 2026); null for the last twelve months.
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  const fetcher = useCallback(() => fetchContactsTimeline(debouncedQ, page, month), [debouncedQ, page, month]);
  const { data, error, loading } = useAsyncData<Timeline>(fetcher, dataVersion);
  const search = (value: string) => { setQ(value); setPage(1); };
  const pick = (value: string | null) => { setMonth(value); setPage(1); };
  const monthName = (value: string) => (value === "old" ? "over 12 months" : timelineMonthLabel(value, true));
  /** "Nov 26", "Dec 25": every month with its year, on one line. */
  const shortMonth = (value: string) => `${timelineMonthLabel(value).slice(0, 3)} ${value.slice(2, 4)}`;

  return (
    <div className="contacts-layout">
    <section className="panel leads-panel">
      <div className="lead-list-wrap">
        <div className="lead-toolbar">
          <div className="search-field lead-search">
            <Search size={16} />
            <input aria-label="Search the timeline" placeholder="Search name or company..." value={q} onChange={(event) => search(event.target.value)} />
            {q && <button className="clear-search" aria-label="Clear search" onClick={() => search("")}><X size={13} /></button>}
          </div>
        </div>
        <ErrorText message={error} />
        {loading && !data ? <Loading text="Loading the timeline..." /> : data && (
          <div className="contacts-az">
          <div className="table-scroll">
            <table className="lead-table contacts-table timeline-table">
              <thead>
                <tr>
                  <th>PERSON</th>
                  <th>{month && month !== "old" ? `CONTACTS IN ${monthName(month).toUpperCase()}` : "CONTACTS IN THE LAST 12 MONTHS"}</th>
                  <th>LAST CONTACT</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const cell = timelineCell(month && month !== "old" ? row.months[month] : yearCounts(row.months));
                  return (
                    <tr key={row.id}>
                      <td>
                        <button className="client-cell" onClick={() => openContact("person", row.id)}>
                          <Avatar name={row.name} seed={row.id} />
                          <span><strong>{row.name}</strong><small>{row.organization ?? "No company"}</small></span>
                        </button>
                      </td>
                      <td>{cell.total > 0
                        ? <span className="tl-summary"><span className={`tl-dot ${cell.total >= 5 ? "tl-many" : cell.total >= 2 ? "tl-some" : ""}`}>{cell.total}</span>{cell.text}</span>
                        : <span className="muted-cell">None</span>}</td>
                      <td><span className="muted-cell">{relativeTime(row.lastContactAt, "No contact in 12 months")}</span></td>
                    </tr>
                  );
                })}
                {!data.rows.length && <tr><td colSpan={3} className="empty-state">{month === "old" ? `Everyone${debouncedQ ? " matching this search" : ""} was contacted in the last 12 months.` : month ? `Nobody${debouncedQ ? " matching this search" : ""} was contacted in ${monthName(month)}.` : debouncedQ ? "No contacts match this search." : "No contacts yet."}</td></tr>}
              </tbody>
            </table>
          </div>
          </div>
        )}
        {data && (
          <div className="table-footer">
            <span>Showing <strong>{data.rows.length}</strong> of <strong>{data.total}</strong> contacts{month === "old" ? " with no contact in 12 months" : month ? ` contacted in ${monthName(month)}` : ""} · calls, emails, visits and notes{loading ? " · refreshing" : ""}</span>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>
    </section>
    {/* The last twelve months in place of A to Z, outside the white panel: a month shows the people contacted in it; All, everyone. */}
    {data && (
        <nav className="az-index month-index" aria-label="Show the people contacted in a month">
          <button type="button" className={month === null ? "is-active" : ""} aria-pressed={month === null} onClick={() => pick(null)} title="Everyone, last 12 months">All</button>
          {[...data.months].reverse().map((value) => {
            const people = data.monthPeople[value] ?? 0;
            return (
              <button key={value} type="button" className={month === value ? "is-active" : ""} aria-pressed={month === value} disabled={people === 0 && month !== value}
                title={`${monthName(value)}: ${people} ${people === 1 ? "person" : "people"} contacted`} onClick={() => pick(value)}>
                {shortMonth(value)}
              </button>
            );
          })}
          <button type="button" className={month === "old" ? "is-active" : ""} aria-pressed={month === "old"} disabled={(data.monthPeople.old ?? 0) === 0 && month !== "old"}
            title={`No contact in the last 12 months: ${data.monthPeople.old ?? 0} ${data.monthPeople.old === 1 ? "person" : "people"}`} onClick={() => pick("old")}>Old</button>
        </nav>
    )}
    </div>
  );
}
