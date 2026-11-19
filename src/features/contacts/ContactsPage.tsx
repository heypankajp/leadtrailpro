"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Building2, CalendarRange, Plus, Search, UserRound, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Avatar, ErrorText, Loading, Pagination } from "@/features/shell/components";
import { fetchOrganizations, fetchPeople } from "./client";
import { OrganizationFormDialog, PersonFormDialog } from "./ContactFormDialogs";
import ContactsTimeline from "./ContactsTimeline";
import { dealCountLabel, indexLetter, indexLetters, type ContactPage, type OrganizationRow, type PersonRow } from "./model";

export type ContactsTab = "people" | "organizations" | "timeline";

/**
 * Contacts: contacts and organizations as two lists (SPEC §10.13, §10.14; "Contact" since §10.19). A contact can be added
 * here before any deal exists; its name opens its page, where deals are added to it.
 */
export default function ContactsPage({ tab }: { tab: ContactsTab }) {
  const { navigate, can, openContact, openLead, notify, dataVersion, bumpData } = useApp();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  // The A–Z index (request of November 18, 2026): the letter to scroll to once its page has loaded.
  const jumpTo = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const fetcher = useCallback((): Promise<ContactPage<PersonRow> | ContactPage<OrganizationRow> | null> => (tab === "timeline" ? Promise.resolve(null) : tab === "people" ? fetchPeople(debouncedQ, page) : fetchOrganizations(debouncedQ, page)), [tab, debouncedQ, page]);
  const { data, error, loading } = useAsyncData(fetcher, dataVersion);
  const search = (value: string) => { setQ(value); setPage(1); };
  const letterPages = data?.letterPages ?? {};
  const scrollToLetter = (letter: string) => document.getElementById(`contacts-letter-${letter === "#" ? "other" : letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const jump = (letter: string) => {
    const target = letterPages[letter];
    if (!target) return;
    if (target === page) { scrollToLetter(letter); return; }
    jumpTo.current = letter;
    setPage(target);
  };
  // After the index opened another page, scrolls to the letter's heading once that page is on screen.
  useEffect(() => {
    if (!jumpTo.current || !data || data.page !== page) return;
    scrollToLetter(jumpTo.current);
    jumpTo.current = null;
  }, [data, page]);
  /** A heading row ("U") before the first name of each letter on the page. */
  const letterRow = (name: string, index: number, rows: { name: string }[]) => {
    const letter = indexLetter(name);
    if (index > 0 && indexLetter(rows[index - 1].name) === letter) return null;
    return <tr className="contacts-letter-row" id={`contacts-letter-${letter === "#" ? "other" : letter}`}><td colSpan={7}>{letter}</td></tr>;
  };
  const noun = tab === "people" ? "contacts" : "companies";
  const one = tab === "people" ? "contact" : "company";
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
          <button className={tab === "people" ? "is-active" : ""} aria-pressed={tab === "people"} onClick={() => navigate("contacts", "people")}><UserRound size={14} /> Contacts</button>
          <button className={tab === "organizations" ? "is-active" : ""} aria-pressed={tab === "organizations"} onClick={() => navigate("contacts", "companies")}><Building2 size={14} /> Companies</button>
          <button className={tab === "timeline" ? "is-active" : ""} aria-pressed={tab === "timeline"} onClick={() => navigate("contacts", "timeline")}><CalendarRange size={14} /> Timeline</button>
        </div>
        {can("create_leads") && tab !== "timeline" && <button className="button button-primary deal-add" onClick={() => setAdding(true)}><Plus size={16} /> {tab === "people" ? "Contact" : "Company"}</button>}
        <span className="deals-head-spacer" />
        <span className="board-total" role="status">{data ? `${data.total} ${data.total === 1 ? one : noun}` : ""}</span>
      </div>

      {tab === "timeline" && <ContactsTimeline />}
      {tab !== "timeline" && <section className="panel leads-panel">
        <div className="lead-list-wrap">
          <div className="lead-toolbar">
            <div className="search-field lead-search">
              <Search size={16} />
              <input aria-label={`Search ${noun}`} placeholder={tab === "people" ? "Search name, company, email, phone..." : "Search company, industry, city..."} value={q} onChange={(event) => search(event.target.value)} />
              {q && <button className="clear-search" aria-label="Clear search" onClick={() => search("")}><X size={13} /></button>}
            </div>
          </div>
          <ErrorText message={error} />
          {loading && !data ? <Loading text={`Loading ${noun}...`} /> : data && (
            <div className="contacts-az">
            <div className="table-scroll">
              <table className="lead-table contacts-table">
                <thead>
                  {tab === "people"
                    ? <tr><th>NAME</th><th>COMPANY</th><th>EMAIL</th><th>PHONE</th><th>DEALS</th><th>OWNER</th><th>LAST ACTIVITY</th></tr>
                    : <tr><th>NAME</th><th>INDUSTRY</th><th>CITY</th><th>CONTACTS</th><th>DEALS</th><th>OWNER</th><th>LAST ACTIVITY</th></tr>}
                </thead>
                <tbody>
                  {tab === "people" && (data.rows as PersonRow[]).map((row, index, rows) => (
                    <Fragment key={row.id}>
                    {letterRow(row.name, index, rows)}
                    <tr>
                      <td><button className="client-cell" onClick={() => openContact("person", row.id)}><Avatar name={row.name} seed={row.id} /><span><strong>{row.name}</strong></span></button></td>
                      <td>{row.organizationId ? <button className="link-button contact-link" onClick={() => openContact("organization", row.organizationId!)}>{row.organization}</button> : <span className="muted-cell">—</span>}</td>
                      <td>{row.email ? <a className="contact-link" href={`mailto:${row.email}`}>{row.email}</a> : <span className="muted-cell">—</span>}</td>
                      <td>{row.phone ? <a className="contact-link" href={`tel:${row.phone}`}>{row.phone}</a> : <span className="muted-cell">—</span>}</td>
                      <td>{deals(row)}</td>
                      <td><span className="muted-cell">{row.ownerName}</span></td>
                      <td><span className="muted-cell">{relativeTime(row.lastActivityAt)}</span></td>
                    </tr>
                    </Fragment>
                  ))}
                  {tab === "organizations" && (data.rows as OrganizationRow[]).map((row, index, rows) => (
                    <Fragment key={row.id}>
                    {letterRow(row.name, index, rows)}
                    <tr>
                      <td><button className="client-cell" onClick={() => openContact("organization", row.id)}><Avatar name={row.name} seed={row.id} /><span><strong>{row.name}</strong></span></button></td>
                      <td><span className="muted-cell">{row.industry ?? "—"}</span></td>
                      <td><span className="muted-cell">{row.city ?? "—"}</span></td>
                      <td><span className="muted-cell">{row.people}</span></td>
                      <td>{deals(row)}</td>
                      <td><span className="muted-cell">{row.ownerName}</span></td>
                      <td><span className="muted-cell">{relativeTime(row.lastActivityAt)}</span></td>
                    </tr>
                    </Fragment>
                  ))}
                  {!data.rows.length && <tr><td colSpan={7} className="empty-state">{debouncedQ ? `No ${noun} match this search.` : `No ${noun} yet. Add one with the button above, or add a deal.`}</td></tr>}
                </tbody>
              </table>
            </div>
            {/* A to Z and #: a letter with names opens their page and scrolls to them; the others are greyed out. */}
            <nav className="az-index" aria-label={`Jump to ${noun} by first letter`}>
              {indexLetters.map((letter) => (
                <button key={letter} type="button" disabled={!letterPages[letter]} aria-label={letter === "#" ? "Names starting with another character" : `Names starting with ${letter}`} onClick={() => jump(letter)}>{letter}</button>
              ))}
            </nav>
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
