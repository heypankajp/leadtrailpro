"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CalendarRange, Plus, Search, UserRound, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, ErrorText, Loading, Pagination } from "@/features/shell/components";
import { fetchOrganizations, fetchPeople } from "./client";
import { OrganizationFormDialog, PersonFormDialog } from "./ContactFormDialogs";
import ContactsTimeline from "./ContactsTimeline";
import { dealCountLabel, type ContactPage, type OrganizationRow, type PersonRow } from "./model";

export type ContactsTab = "people" | "organizations" | "timeline";

/**
 * Contacts, after Pipedrive's: People and Organizations as two lists (SPEC §10.13, §10.14). A contact can be added
 * here before any deal exists; its name opens its page, where deals are added to it.
 */
export default function ContactsPage({ tab }: { tab: ContactsTab }) {
  const { navigate, can, openContact, openLead, notify, dataVersion, bumpData } = useApp();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const fetcher = useCallback((): Promise<ContactPage<PersonRow> | ContactPage<OrganizationRow> | null> => (tab === "timeline" ? Promise.resolve(null) : tab === "people" ? fetchPeople(debouncedQ, page) : fetchOrganizations(debouncedQ, page)), [tab, debouncedQ, page]);
  const { data, error, loading } = useAsyncData(fetcher, dataVersion);
  const search = (value: string) => { setQ(value); setPage(1); };
  const noun = tab === "people" ? "people" : "organizations";
  const one = tab === "people" ? "person" : "organization";
  const deals = (row: { deals: number; openDeals: number; dealId: number | null; name: string }) => (
    row.dealId === null
      ? <span className="muted-cell">{dealCountLabel(row.deals, row.openDeals)}</span>
      : <button className="text-button contact-deals" onClick={() => (row.deals === 1 ? openLead(row.dealId!) : navigate("deals", "list", { q: row.name, scope: "everyone" }))}>{dealCountLabel(row.deals, row.openDeals)}</button>
  );

  return (
    <>
      <div className="deals-head">
        <h1 className="sr-only">Contacts</h1>
        <div className="scope-toggle" role="group" aria-label="Contacts list">
          <button className={tab === "people" ? "is-active" : ""} aria-pressed={tab === "people"} onClick={() => navigate("contacts", "people")}><UserRound size={14} /> People</button>
          <button className={tab === "organizations" ? "is-active" : ""} aria-pressed={tab === "organizations"} onClick={() => navigate("contacts", "organizations")}><Building2 size={14} /> Organizations</button>
          <button className={tab === "timeline" ? "is-active" : ""} aria-pressed={tab === "timeline"} onClick={() => navigate("contacts", "timeline")}><CalendarRange size={14} /> Timeline</button>
        </div>
        {can("create_leads") && tab !== "timeline" && <button className="button button-primary deal-add" onClick={() => setAdding(true)}><Plus size={16} /> {tab === "people" ? "Person" : "Organization"}</button>}
        <span className="deals-head-spacer" />
        <span className="board-total" role="status">{data ? `${data.total} ${data.total === 1 ? one : noun}` : ""}</span>
      </div>

      {tab === "timeline" && <ContactsTimeline />}
      {tab !== "timeline" && <section className="panel leads-panel">
        <div className="lead-list-wrap">
          <div className="lead-toolbar">
            <div className="search-field lead-search">
              <Search size={16} />
              <input aria-label={`Search ${noun}`} placeholder={tab === "people" ? "Search name, organization, email, phone..." : "Search organization, industry, city..."} value={q} onChange={(event) => search(event.target.value)} />
              {q && <button className="clear-search" aria-label="Clear search" onClick={() => search("")}><X size={13} /></button>}
            </div>
          </div>
          <ErrorText message={error} />
          {loading && !data ? <Loading text={`Loading ${noun}...`} /> : data && (
            <div className="table-scroll">
              <table className="lead-table contacts-table">
                <thead>
                  {tab === "people"
                    ? <tr><th>NAME</th><th>ORGANIZATION</th><th>EMAIL</th><th>PHONE</th><th>DEALS</th><th>OWNER</th><th>LAST ACTIVITY</th></tr>
                    : <tr><th>NAME</th><th>INDUSTRY</th><th>CITY</th><th>PEOPLE</th><th>DEALS</th><th>OWNER</th><th>LAST ACTIVITY</th></tr>}
                </thead>
                <tbody>
                  {tab === "people" && (data.rows as PersonRow[]).map((row) => (
                    <tr key={row.id}>
                      <td><button className="client-cell" onClick={() => openContact("person", row.id)}><Avatar name={row.name} seed={row.id} /><span><strong>{row.name}</strong></span></button></td>
                      <td>{row.organizationId ? <button className="link-button contact-link" onClick={() => openContact("organization", row.organizationId!)}>{row.organization}</button> : <span className="muted-cell">—</span>}</td>
                      <td>{row.email ? <a className="contact-link" href={`mailto:${row.email}`}>{row.email}</a> : <span className="muted-cell">—</span>}</td>
                      <td>{row.phone ? <a className="contact-link" href={`tel:${row.phone}`}>{row.phone}</a> : <span className="muted-cell">—</span>}</td>
                      <td>{deals(row)}</td>
                      <td><span className="muted-cell">{row.ownerName}</span></td>
                      <td><span className="muted-cell">{relativeTime(row.lastActivityAt)}</span></td>
                    </tr>
                  ))}
                  {tab === "organizations" && (data.rows as OrganizationRow[]).map((row) => (
                    <tr key={row.id}>
                      <td><button className="client-cell" onClick={() => openContact("organization", row.id)}><Avatar name={row.name} seed={row.id} /><span><strong>{row.name}</strong></span></button></td>
                      <td><span className="muted-cell">{row.industry ?? "—"}</span></td>
                      <td><span className="muted-cell">{row.city ?? "—"}</span></td>
                      <td><span className="muted-cell">{row.people}</span></td>
                      <td>{deals(row)}</td>
                      <td><span className="muted-cell">{row.ownerName}</span></td>
                      <td><span className="muted-cell">{relativeTime(row.lastActivityAt)}</span></td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={7} className="empty-state">{debouncedQ ? `No ${noun} match this search.` : `No ${noun} yet. Add one with the button above, or add a deal.`}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {data && (
            <div className="table-footer">
              <span>Showing <strong>{data.rows.length}</strong> of <strong>{data.total}</strong> {noun}{loading ? " · refreshing" : ""}</span>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          )}
        </div>
      </section>}

      {adding && tab === "people" && <PersonFormDialog onClose={() => setAdding(false)} onSaved={(person) => { setAdding(false); bumpData(); notify(`${person.name} added`); openContact("person", person.id); }} />}
      {adding && tab === "organizations" && <OrganizationFormDialog onClose={() => setAdding(false)} onSaved={(organization) => { setAdding(false); bumpData(); notify(`${organization.name} added`); openContact("organization", organization.id); }} />}
    </>
  );
}
