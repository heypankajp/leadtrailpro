"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Building2, CircleDollarSign, GitMerge, History, Info, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, Trash2, UserRound, UsersRound } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime, fromLocalInput, relativeTime, toLocalInput } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { SidePanel, SideRow } from "@/features/leads/DealPage";
import { activityLabels, type LeadActivity } from "@/features/leads/model";
import RichText from "@/features/shell/RichText";
import { useApp } from "@/features/shell/AppContext";
import RichTextArea from "@/features/shell/RichTextArea";
import { Avatar, Dialog, EmptyState, ErrorText, Field, Loading, StatusPill } from "@/features/shell/components";
import { fetchOrganization, fetchOrganizations, fetchPeople, fetchPerson, logOrganizationActivity, logPersonActivity, mergeOrganization, mergePerson, removeOrganization, removePerson } from "./client";
import { OrganizationFormDialog, PersonFormDialog } from "./ContactFormDialogs";
import type { ContactActivity, ContactActivityInput, ContactActivityType, ContactDeal, ContactPermissions, OrganizationDetail, PersonDetail } from "./model";

type Kind = "organization" | "person";
type Props = { kind: Kind; id: number; backLabel: string; onClose: () => void };
const missing = (text = "Not provided") => <span className="detail-missing">{text}</span>;

/**
 * An organization's or a person's page (#/organization/<id>, #/person/<id>), in the deal page's layout (SPEC §10.14):
 * details in panels on the left, the contact's deals and their combined history on the right. "+ Deal" starts a deal
 * from the contact, which is how work begins in Pipedrive.
 */
export default function ContactPage({ kind, id, backLabel, onClose }: Props) {
  return kind === "organization" ? <OrganizationPage id={id} backLabel={backLabel} onClose={onClose} /> : <PersonPage id={id} backLabel={backLabel} onClose={onClose} />;
}

function Shell({ kind, name, subtitle, ownerName, actions, side, deals, activities, back, addDeal, composer }: {
  kind: Kind; name: string; subtitle: string; ownerName: string; actions: ReactNode; side: ReactNode; deals: ContactDeal[]; activities: ContactActivity[]; back: ReactNode; addDeal: (() => void) | null; composer: ReactNode;
}) {
  const { openLead } = useApp();
  return (
    <div className="deal-page contact-page">
      <header className="deal-header">
        {back}
        <Avatar name={name} seed={name} />
        <div className="deal-heading">
          <span className="eyebrow">{kind === "organization" ? "ORGANIZATION" : "PERSON"}</span>
          <h1>{name}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="detail-owner"><small>OWNER</small><strong>{ownerName}</strong></div>
        <div className="detail-header-actions">{actions}</div>
      </header>
      <div className="deal-columns">
        <aside className="deal-side" aria-label={kind === "organization" ? "Organization details" : "Person details"}>{side}</aside>
        <div className="deal-main">
          {composer}
          <section className="deal-block" aria-label="Deals">
            <div className="deal-block-head">
              <h2>Deals <span className="block-count">{deals.length}</span></h2>
              {addDeal && <button className="button button-outline button-small" onClick={addDeal}><Plus size={14} /> Deal</button>}
            </div>
            <div className="contact-deals-list">
              {deals.map((deal) => (
                <button key={deal.id} className="contact-deal-row" onClick={() => openLead(deal.id)}>
                  <span className="contact-deal-title"><strong>{deal.clientName}</strong><small>{[kind === "organization" ? deal.clientExecutive : "", deal.positions].filter(Boolean).join(" · ") || "No contact or positions yet"}</small></span>
                  <StatusPill status={deal.status} code={deal.statusCode} />
                  <span className="contact-deal-meta">{deal.recordState === "archived" ? "Archived" : deal.recordState === "queued" ? "Queued for approval" : deal.stage ?? "No stage"}</span>
                  <span className="contact-deal-meta">{deal.ownerName}</span>
                  <span className="contact-deal-meta">{relativeTime(deal.lastActivityAt)}</span>
                </button>
              ))}
              {!deals.length && <EmptyState icon={<CircleDollarSign size={22} />} title="No deals yet" text={addDeal ? "Start one with + Deal: the form opens with this contact's details." : undefined} />}
            </div>
          </section>
          <section className="deal-block" aria-label="History">
            <div className="deal-block-head"><h2>History</h2></div>
            <div className="timeline-list">
              {activities.map((activity) => (
                <article className={`timeline-entry type-${activity.type}`} key={`${activity.source}-${activity.id}`}>
                  <span className="timeline-dot"><History size={13} /></span>
                  <div>
                    <div className="timeline-head"><strong>{activity.summary}</strong><span className="badge badge-muted">{activityLabels[activity.type as LeadActivity["type"]] ?? activity.type}</span></div>
                    {activity.body && <RichText text={activity.body} className="timeline-body" />}
                    <small>
                      {activity.userName ?? "System"} · {formatDateTime(activity.occurredAt)} ({relativeTime(activity.occurredAt)})
                      {activity.about ? ` · on ${activity.about}` : ""}
                      {activity.leadId !== null && deals.length > 1 ? <> · <button type="button" className="link-button" onClick={() => openLead(activity.leadId!)}>deal #{activity.leadId}</button></> : null}
                    </small>
                  </div>
                </article>
              ))}
              {!activities.length && <EmptyState icon={<History size={22} />} title="No history yet" text="Notes and calls written here, and everything on this contact's deals, appear in one list." />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Write a note, or log a call, an email or a visit, on the contact itself: no deal is needed (SPEC §10.16). */
function ContactComposer({ permissions, save }: { permissions: ContactPermissions; save: (input: ContactActivityInput) => Promise<void> }) {
  const [type, setType] = useState<ContactActivityType | null>(null);
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date().toISOString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!permissions.note && !permissions.log) return null;
  const open = (next: ContactActivityType) => { setType(type === next ? null : next); setSummary(""); setBody(""); setOccurredAt(toLocalInput(new Date().toISOString())); setError(""); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!type) return;
    setBusy(true);
    setError("");
    try { await save({ type, summary, body, occurredAt: fromLocalInput(occurredAt) }); setType(null); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  };
  const tab = (id: ContactActivityType, label: string, icon: ReactNode) => (
    <button type="button" className={type === id ? "is-active" : ""} aria-pressed={type === id} onClick={() => open(id)}>{icon} {label}</button>
  );
  return (
    <section className="deal-block composer" aria-label="Add to this contact">
      <div className="composer-tabs log-actions">
        {permissions.note && tab("note", "Add note", <MessageSquare size={14} />)}
        {permissions.log && tab("call", "Log call", <Phone size={14} />)}
        {permissions.log && tab("email", "Log email", <Mail size={14} />)}
        {permissions.log && tab("visit", "Log visit", <MapPin size={14} />)}
      </div>
      {!type && <p className="composer-hint">Write a note or log a call, an email or a visit with this contact. A deal is not needed.</p>}
      {type && (
        <form className="lead-form activity-form" onSubmit={submit}>
          {type !== "note" && <Field label="Summary" wide><input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} placeholder={type === "call" ? "Introduced our services" : type === "email" ? "Sent the company profile" : "Met at their office"} autoFocus /></Field>}
          <Field label={type === "note" ? "Note" : "Notes (optional)"} wide required={type === "note"}><RichTextArea value={body} onChange={setBody} rows={4} maxLength={10000} placeholder="What was discussed, what comes next..." autoFocus={type === "note"} required={type === "note"} /></Field>
          <Field label="When"><input type="datetime-local" value={occurredAt} max={toLocalInput(new Date().toISOString())} onChange={(event) => setOccurredAt(event.target.value)} required /></Field>
          <div className="field-wide"><ErrorText message={error} /></div>
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setType(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : type === "note" ? "Save note" : `Save ${type}`}</button></div>
        </form>
      )}
    </section>
  );
}

/** Merge duplicates (SPEC §10.16): find the other record of the same contact and fold it into this one. */
function MergeDialog({ kind, id, name, onClose, onMerged }: { kind: Kind; id: number; name: string; onClose: () => void; onMerged: (otherName: string) => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<{ id: number; name: string; detail: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const typed = q.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const found = kind === "organization"
        ? fetchOrganizations(typed, 1).then((page) => page.rows.map((row) => ({ id: row.id, name: row.name, detail: [row.city, `${row.deals} ${row.deals === 1 ? "deal" : "deals"}`].filter(Boolean).join(" · ") })))
        : fetchPeople(typed, 1).then((page) => page.rows.map((row) => ({ id: row.id, name: row.name, detail: [row.organization, row.email].filter(Boolean).join(" · ") || "No organization" })));
      found.then((rows) => { if (!cancelled) setMatches(rows.filter((row) => row.id !== id).slice(0, 8)); }).catch(() => { /* the list stays as it was */ });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typed, kind, id]);
  const merge = async () => {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "organization") await mergeOrganization(id, picked.id); else await mergePerson(id, picked.id);
      onMerged(picked.name);
    } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  };
  return (
    <Dialog title={`Merge a duplicate into ${name}`} eyebrow={kind === "organization" ? "ORGANIZATION" : "PERSON"} onClose={onClose}>
      <div className="stack-form">
        <p className="dialog-description">Find the other record of the same {kind}. Its deals{kind === "organization" ? ", people" : ""} and notes move to {name}, empty details are filled in from it, and it is removed. This cannot be undone.</p>
        <Field label={`The duplicate ${kind}`}><input value={q} onChange={(event) => { setQ(event.target.value); setPicked(null); }} placeholder="Type its name..." autoFocus /></Field>
        {typed.length >= 2 && !picked && (
          <div className="merge-matches" role="listbox" aria-label="Matching records">
            {matches.map((row) => <button type="button" role="option" aria-selected="false" key={row.id} onClick={() => setPicked({ id: row.id, name: row.name })}><strong>{row.name}</strong><small>{row.detail}</small></button>)}
            {!matches.length && <p className="side-empty">No other {kind} matches.</p>}
          </div>
        )}
        {picked && <p className="form-note"><GitMerge size={14} /> <span><strong>{picked.name}</strong> will be merged into <strong>{name}</strong>.</span></p>}
        <ErrorText message={error} />
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-primary" disabled={!picked || busy} onClick={() => void merge()}>{busy ? "Merging..." : "Merge"}</button>
        </div>
      </div>
    </Dialog>
  );
}

function useBack(backLabel: string, onClose: () => void) {
  return <button className="icon-button deal-back" aria-label={`Back to ${backLabel}`} title={`Back to ${backLabel}`} onClick={onClose}><ArrowLeft size={18} /></button>;
}

function Frame({ back, title, children }: { back: ReactNode; title: string; children: ReactNode }) {
  return <div className="deal-page contact-page"><header className="deal-header">{back}<div className="deal-heading"><h1>{title}</h1></div></header>{children}</div>;
}

function RemoveDialog({ name, kind, onClose, onConfirm }: { name: string; kind: Kind; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => { setBusy(true); setError(""); try { await onConfirm(); } catch (caught) { setError(errorMessage(caught)); setBusy(false); } };
  return (
    <Dialog title={`Remove ${name}?`} eyebrow={kind === "organization" ? "ORGANIZATION" : "PERSON"} size="narrow" onClose={onClose}>
      <p className="dialog-description">{kind === "organization" ? "The organization has no deals. Its people stay, without an organization." : "The person has no deals."} This cannot be undone.</p>
      <ErrorText message={error} />
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-danger" disabled={busy} onClick={() => void confirm()}>{busy ? "Removing..." : `Remove ${kind}`}</button>
      </div>
    </Dialog>
  );
}

function OrganizationPage({ id, backLabel, onClose }: Omit<Props, "kind">) {
  const { openContact, openNewLeadFor, notify, bumpData, dataVersion } = useApp();
  const fetcher = useCallback(() => fetchOrganization(id), [id]);
  const { data, error, reload } = useAsyncData<OrganizationDetail>(fetcher, dataVersion);
  const [dialog, setDialog] = useState<"edit" | "remove" | "person" | "merge" | null>(null);
  const back = useBack(backLabel, onClose);
  if (error && !data) return <Frame back={back} title="Organization"><ErrorText message={error} /></Frame>;
  if (!data) return <Frame back={back} title=""><Loading text="Loading organization..." /></Frame>;
  const { organization, people, deals, activities, permissions } = data;
  const addDeal = permissions.addDeal ? () => openNewLeadFor({
    organizationId: organization.id,
    prefill: { clientName: organization.name, companyUrl: organization.website, address: organization.address, cityId: organization.cityId, industry: organization.industry, companySizeId: organization.companySizeId },
  }) : null;

  return (
    <>
      <Shell
        kind="organization" name={organization.name} ownerName={organization.ownerName} back={back} deals={deals} activities={activities} addDeal={addDeal}
        composer={<ContactComposer permissions={permissions} save={async (input) => { await logOrganizationActivity(organization.id, input); reload(); bumpData(); notify(input.type === "note" ? "Note saved" : "Activity recorded"); }} />}
        subtitle={[organization.industry, organization.city].filter(Boolean).join(" · ") || "Organization"}
        actions={<>
          {addDeal && <button className="button button-primary button-small" onClick={addDeal}><Plus size={14} /> Deal</button>}
          {permissions.edit && <button className="button button-outline button-small" onClick={() => setDialog("edit")}><Pencil size={14} /> Edit</button>}
          {permissions.edit && <button className="button button-outline button-small" onClick={() => setDialog("merge")}><GitMerge size={14} /> Merge</button>}
          {permissions.remove && <button className="button button-outline button-small" onClick={() => setDialog("remove")}><Trash2 size={14} /> Remove</button>}
        </>}
        side={<>
          <SidePanel title="Details" icon={<Building2 size={14} />}>
            <SideRow label="Industry"><strong>{organization.industry || "Not set"}</strong></SideRow>
            <SideRow label="Company size"><strong>{organization.companySize ?? "Not set"}</strong></SideRow>
            <SideRow label="City"><strong>{organization.city ?? "Not set"}</strong></SideRow>
            <SideRow label="Address"><strong>{organization.address || "Not provided"}</strong></SideRow>
            <SideRow label="Website">{organization.website ? <a href={organization.website} target="_blank" rel="noopener noreferrer">{organization.website.replace(/^https?:\/\//, "")}</a> : missing()}</SideRow>
          </SidePanel>
          <SidePanel title={`People (${people.length})`} icon={<UsersRound size={14} />}>
            {people.map((person) => (
              <div className="side-person" key={person.id}>
                <button type="button" className="link-button contact-name" onClick={() => openContact("person", person.id)}>{person.name}</button>
                <small>{[person.email, person.phone].filter(Boolean).join(" · ") || "No email or phone yet"}</small>
              </div>
            ))}
            {!people.length && <p className="side-empty">No people yet.</p>}
            {permissions.addDeal && <div className="side-actions"><button className="text-button" onClick={() => setDialog("person")}><Plus size={13} /> Person</button></div>}
          </SidePanel>
          <SidePanel title="Overview" icon={<Info size={14} />}>
            <SideRow label="Created"><strong>{`${formatDateTime(organization.createdAt)} by ${organization.createdByName}`}</strong></SideRow>
          </SidePanel>
        </>}
      />
      {dialog === "edit" && <OrganizationFormDialog organization={organization} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); bumpData(); notify("Organization updated"); }} />}
      {dialog === "person" && <PersonFormDialog organizationName={organization.name} onClose={() => setDialog(null)} onSaved={(person) => { setDialog(null); reload(); bumpData(); notify(`${person.name} added`); }} />}
      {dialog === "merge" && <MergeDialog kind="organization" id={organization.id} name={organization.name} onClose={() => setDialog(null)} onMerged={(other) => { setDialog(null); reload(); bumpData(); notify(`${other} merged into ${organization.name}`); }} />}
      {dialog === "remove" && <RemoveDialog name={organization.name} kind="organization" onClose={() => setDialog(null)} onConfirm={async () => { await removeOrganization(organization.id); notify(`${organization.name} removed`); bumpData(); onClose(); }} />}
    </>
  );
}

function PersonPage({ id, backLabel, onClose }: Omit<Props, "kind">) {
  const { openContact, openNewLeadFor, notify, bumpData, dataVersion } = useApp();
  const fetcher = useCallback(() => fetchPerson(id), [id]);
  const { data, error, reload } = useAsyncData<PersonDetail>(fetcher, dataVersion);
  const [dialog, setDialog] = useState<"edit" | "remove" | "merge" | null>(null);
  const back = useBack(backLabel, onClose);
  if (error && !data) return <Frame back={back} title="Person"><ErrorText message={error} /></Frame>;
  if (!data) return <Frame back={back} title=""><Loading text="Loading person..." /></Frame>;
  const { person, deals, activities, permissions } = data;
  const addDeal = permissions.addDeal ? () => openNewLeadFor({
    organizationId: person.organizationId, personId: person.id,
    prefill: { clientName: person.organization ?? "", clientExecutive: person.name, clientEmails: person.emails, contactPhone: person.phone, contactAltPhone: person.altPhone, contactRemark: person.remark },
  }) : null;

  return (
    <>
      <Shell
        kind="person" name={person.name} ownerName={person.ownerName} back={back} deals={deals} activities={activities} addDeal={addDeal}
        composer={<ContactComposer permissions={permissions} save={async (input) => { await logPersonActivity(person.id, input); reload(); bumpData(); notify(input.type === "note" ? "Note saved" : "Activity recorded"); }} />}
        subtitle={person.organization ?? "No organization yet"}
        actions={<>
          {addDeal && <button className="button button-primary button-small" onClick={addDeal}><Plus size={14} /> Deal</button>}
          {permissions.edit && <button className="button button-outline button-small" onClick={() => setDialog("edit")}><Pencil size={14} /> Edit</button>}
          {permissions.edit && <button className="button button-outline button-small" onClick={() => setDialog("merge")}><GitMerge size={14} /> Merge</button>}
          {permissions.remove && <button className="button button-outline button-small" onClick={() => setDialog("remove")}><Trash2 size={14} /> Remove</button>}
        </>}
        side={<>
          <SidePanel title="Details" icon={<UserRound size={14} />}>
            <SideRow label="Email">{person.emails.length ? <span className="email-list">{person.emails.map((email) => <a key={email} href={`mailto:${email}`}>{email}</a>)}</span> : missing()}</SideRow>
            <SideRow label="Phone">{person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : missing()}</SideRow>
            <SideRow label="Ext. / alternate">{person.altPhone ? <a href={`tel:${person.altPhone}`}>{person.altPhone}</a> : missing()}</SideRow>
            <SideRow label="Remark"><strong>{person.remark || "—"}</strong></SideRow>
          </SidePanel>
          <SidePanel title="Organization" icon={<Building2 size={14} />}>
            <SideRow label="Name">{person.organizationId ? <button type="button" className="link-button contact-name" onClick={() => openContact("organization", person.organizationId!)}>{person.organization}</button> : missing("None yet: set it with Edit, or add a deal")}</SideRow>
          </SidePanel>
          <SidePanel title="Overview" icon={<Info size={14} />}>
            <SideRow label="Created"><strong>{`${formatDateTime(person.createdAt)} by ${person.createdByName}`}</strong></SideRow>
          </SidePanel>
        </>}
      />
      {dialog === "merge" && <MergeDialog kind="person" id={person.id} name={person.name} onClose={() => setDialog(null)} onMerged={(other) => { setDialog(null); reload(); bumpData(); notify(`${other} merged into ${person.name}`); }} />}
      {dialog === "edit" && <PersonFormDialog person={person} movable={deals.length === 0} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); bumpData(); notify("Person updated"); }} />}
      {dialog === "remove" && <RemoveDialog name={person.name} kind="person" onClose={() => setDialog(null)} onConfirm={async () => { await removePerson(person.id); notify(`${person.name} removed`); bumpData(); onClose(); }} />}
    </>
  );
}
