"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Sparkles, Check, ChevronDown, ChevronsDown, ChevronsUp, Circle, CircleDollarSign, Clock3, FileText, Flag, Link2, ListChecks, MoreHorizontal, Paperclip, Plus, Search, StickyNote, Target, UserRound, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAsyncData } from "@/lib/useAsyncData";
import { fetchLead, fetchLeads, updateLead } from "@/features/leads/client";
import { createOrganization, createPerson, fetchOrganization, fetchOrganizations } from "@/features/contacts/client";
import { contactKey, type OrganizationRow, type PersonRow } from "@/features/contacts/model";
import { OrganizationFormDialog, PersonFormDialog } from "@/features/contacts/ContactFormDialogs";
import SuggestInput from "@/features/shell/SuggestInput";
import type { LeadSummary } from "@/features/leads/model";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText } from "@/features/shell/components";
import { createTask, fetchTaskAttachments, removeTaskAttachment, taskAttachmentUrl, updateTask, uploadTaskAttachment } from "./client";
import DayAgenda from "./DayAgenda";
import NaturalDateField from "./NaturalDateField";
import { taskActivityLabels, taskActivityTypes, taskTitleWords, type ChecklistItem, type Task, type TaskActivityType, type TaskAttachment, type TaskPriority } from "./model";
import { ymdOf } from "./periods";
import { activityIcons } from "./ScheduleActivity";
import TaskComments from "./TaskComments";

/** `defaults`: starting values for a new activity, from a slot of the Activity Calendar (Details...). */
type Props = {
  task?: Task; leadId?: number | null; leadName?: string | null; defaultAssigneeId?: number;
  defaults?: { title?: string; activityType?: TaskActivityType; dueAt?: string | null; endsAt?: string | null };
  /** From a deal (its page, its board card): a new open activity also becomes the deal's next follow-up date. */
  setFollowUp?: boolean;
  /** `message` says what was saved ("Visit scheduled for 2026-11-23", "Call recorded as done", "Activity updated"). */
  onClose: () => void; onSaved: (task: Task, message: string) => void;
};

/** The deal an activity is linked to (optional). */
type LinkedDeal = { id: number; name: string };
/** An organization or person picked (`id`), or added as new from the list (`isNew`), or only typed (neither). */
type LinkedRecord = { id: number | null; isNew: boolean };

/** The file types an activity accepts, as for a deal's documents (the server checks them again). */
const acceptedFiles = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt";
const pad = (value: number) => String(value).padStart(2, "0");
const timeOf = (iso: string | null | undefined) => { if (!iso) return ""; const date = new Date(iso); return date.getHours() || date.getMinutes() ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : ""; };
const priorityIcons: Record<TaskPriority, ReactNode> = { high: <ChevronsUp size={13} />, medium: <Circle size={11} />, low: <ChevronsDown size={13} />, normal: null };
const priorities: { value: TaskPriority; label: string }[] = [{ value: "normal", label: "None" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];

/**
 * Priority as coloured chips: None, HIGH (red), MEDIUM (yellow), LOW (blue); the button shows the chip
 * chosen. The stored values stay normal / high / medium / low.
 */
function PriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "mousedown" && anchor.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const chip = (item: TaskPriority) => (item === "normal" ? <span className="priority-none">None</span> : <span className={`priority-chip priority-chip-${item}`}>{priorityIcons[item]} {item}</span>);
  return (
    <div className="priority-picker" ref={anchor}>
      <button type="button" className="priority-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label="Priority" onClick={() => setOpen((current) => !current)}>
        {value === "normal" ? <span>Priority</span> : chip(value)} <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="priority-menu" role="listbox" aria-label="Priority">
          {priorities.map((item) => (
            <li key={item.value} role="option" aria-selected={value === item.value}>
              <button type="button" onClick={() => { onChange(item.value); setOpen(false); }}>{chip(item.value)}{value === item.value && <Check size={15} className="priority-check" />}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One row of the form: its icon on the left, its fields on the right. */
function Row({ icon, label, children, onIcon }: { icon: ReactNode; label: string; children: ReactNode; onIcon?: () => void }) {
  return (
    <div className="activity-row">
      {onIcon
        ? <button type="button" className="activity-row-icon is-button" title={label} aria-label={label} onClick={onIcon}>{icon}</button>
        : <span className="activity-row-icon" title={label} aria-hidden="true">{icon}</span>}
      <div className="activity-row-body">{children}</div>
    </div>
  );
}

/**
 * Schedule an activity (request of November 18, 2026), for every activity: new ones (Activities,
 * the top bar's "+ Activity", a calendar slot's Details..., a deal page, a board card's Add follow-up) and edits. The subject and its type; the date
 * with a start and an end time; priority; Add Description, Checklist and files; the yellow note; who does it; the deal
 * it is linked to, with its contact and organization; Mark as done with its outcome. On the right, the assignee's day.
 */
export default function TaskFormDialog({ task, leadId, leadName, defaultAssigneeId, defaults, setFollowUp, onClose, onSaved }: Props) {
  const { reference, user, can } = useApp();
  const initialDue = task?.dueAt ?? defaults?.dueAt ?? null;
  const [type, setType] = useState<TaskActivityType>(task?.activityType ?? defaults?.activityType ?? "call");
  const [title, setTitle] = useState(task?.title ?? defaults?.title ?? "");
  const [date, setDate] = useState(initialDue ? ymdOf(new Date(initialDue)) : reference.today);
  const [start, setStart] = useState(timeOf(initialDue));
  const [end, setEnd] = useState(timeOf(task?.endsAt ?? defaults?.endsAt));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [description, setDescription] = useState(task?.description ?? "");
  // Which of Description, Checklist, Note and Files is open in the details row (none to start with).
  const [section, setSection] = useState<"description" | "checklist" | "note" | "files" | null>(null);
  const [note, setNote] = useState(task?.note ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const owners = reference.users.filter((item) => item.role !== "recruiter" || item.id === (task?.assigneeId ?? user.id));
  // Several team members (request of November 18, 2026): chips; the first one's day is shown on the right.
  const [assigneeIds, setAssigneeIds] = useState<number[]>(task?.assignees?.length ? task.assignees.map((item) => item.id) : [task?.assigneeId ?? defaultAssigneeId ?? user.id]);
  const assigneeId = String(assigneeIds[0] ?? user.id);
  const nameOf = (id: number) => { const found = reference.users.find((item) => item.id === id); return found ? (found.id === user.id ? `${found.name} (You)` : found.name) : task?.assignees?.find((item) => item.id === id)?.name ?? `User ${id}`; };
  const [deal, setDeal] = useState<LinkedDeal | null>(task?.leadId ? { id: task.leadId, name: task.leadName ?? `Deal ${task.leadId}` } : leadId ? { id: leadId, name: leadName ?? `Deal ${leadId}` } : null);
  // The organization and the person (request of November 18, 2026): picked from the list, or added as new (NEW badge).
  // The person is looked up only among the organization's contacts, and a new person is added inside the organization.
  const [orgName, setOrgName] = useState(task?.organizationId ? task.organization ?? "" : "");
  const [org, setOrg] = useState<LinkedRecord>({ id: task?.organizationId ?? null, isNew: false });
  // Several people (request of November 18, 2026): chips, each picked from the organization's contacts or added as new.
  const [chosen, setChosen] = useState<{ id: number | null; name: string }[]>(
    task?.people?.length ? task.people : task?.personId ? [{ id: task.personId, name: task.contactName ?? "" }] : [],
  );
  const [personName, setPersonName] = useState("");
  const [orgRows, setOrgRows] = useState<{ q: string; rows: OrganizationRow[] } | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [dealSearch, setDealSearch] = useState("");
  const [dealResults, setDealResults] = useState<LeadSummary[]>([]);
  const [done, setDone] = useState(task?.status === "done");
  const [outcomeId, setOutcomeId] = useState(task?.outcomeId ? String(task.outcomeId) : "");
  const outcomes = reference.listValues.activity_outcome.filter((item) => item.active || item.id === task?.outcomeId);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A new activity started from a deal page takes the deal's organization and contact.
  useEffect(() => {
    if (task || !leadId) return;
    let cancelled = false;
    fetchLead(leadId).then(({ lead }) => { if (!cancelled) linkDeal(lead); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the deal the page gave
  }, []);
  // The organizations that match what is typed.
  const typedOrg = org.id || org.isNew ? "" : orgName.trim();
  useEffect(() => {
    if (typedOrg.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { fetchOrganizations(typedOrg, 1).then((page) => { if (!cancelled) setOrgRows({ q: typedOrg, rows: page.rows.slice(0, 8) }); }).catch(() => undefined); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typedOrg]);
  // The contacts of the organization picked.
  useEffect(() => {
    if (!org.id) return;
    let cancelled = false;
    fetchOrganization(org.id).then((detail) => { if (!cancelled) setPeople(detail.people); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [org.id]);
  useEffect(() => {
    const term = dealSearch.trim();
    if (!term) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { fetchLeads({ q: term, pageSize: 6 }).then((page) => { if (!cancelled) setDealResults(page.leads); }).catch(() => undefined); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [dealSearch]);
  const attachmentsFetcher = useCallback(() => (task ? fetchTaskAttachments(task.id).then((result) => result.attachments) : Promise.resolve([] as TaskAttachment[])), [task]);
  const { data: attachments, reload: reloadAttachments } = useAsyncData<TaskAttachment[]>(attachmentsFetcher);

  const fileCount = (attachments?.length ?? 0) + files.length;
  const detailTabs: { id: "description" | "checklist" | "note" | "files"; label: string; icon: ReactNode; filled: boolean; count?: number }[] = [
    { id: "description", label: "Description", icon: <FileText size={14} />, filled: Boolean(description.trim()) },
    { id: "checklist", label: "Checklist", icon: <ListChecks size={14} />, filled: checklist.length > 0, count: checklist.length },
    { id: "note", label: "Note", icon: <StickyNote size={14} />, filled: Boolean(note.trim()) },
    { id: "files", label: "Files", icon: <Paperclip size={14} />, filled: fileCount > 0, count: fileCount },
  ];
  // The title follows the type until the person writes their own.
  // The subject an activity gets when none is typed: "Call Adam Brooks" once a person is linked, or the type alone.
  const autoTitle = (of: TaskActivityType) => (chosen[0]?.name ? `${taskTitleWords[of]} ${chosen[0].name}` : taskActivityLabels[of]);
  const changeType = (next: TaskActivityType) => {
    if (!title.trim() || title === autoTitle(type) || title === taskActivityLabels[type]) setTitle(autoTitle(next));
    setType(next);
  };
  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setChecklist((current) => [...current, { text, done: false }]);
    setNewItem("");
  };
  /** A deal picked (or given): its organization and contact become the activity's. */
  function linkDeal(lead: LeadSummary) {
    setDeal({ id: lead.id, name: lead.clientName });
    if (lead.organizationId) { setOrg({ id: lead.organizationId, isNew: false }); setOrgName(lead.clientName); }
    setChosen(lead.personId ? [{ id: lead.personId, name: lead.clientExecutive }] : []);
    setPersonName("");
  }
  const changeOrgName = (value: string) => { setOrgName(value); setOrg({ id: null, isNew: false }); setPeople([]); setChosen([]); setPersonName(""); };
  const clearOrg = () => changeOrgName("");
  const orgPeople = org.id ? people : [];
  const orgExact = orgRows && orgRows.q === typedOrg ? orgRows.rows.find((row) => contactKey(row.name) === contactKey(typedOrg)) ?? null : null;
  // "+ Add 'Acme' as new company" opens Add company with the name (request of November 19, 2026); the company saved there is linked.
  const [addingOrg, setAddingOrg] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState<string | null>(null);
  const linkOrg = (id: number, name: string) => { setOrgName(name); setOrg({ id, isNew: false }); setChosen([]); setPersonName(""); };
  const orgCreate = typedOrg.length >= 2 && orgRows?.q === typedOrg && !orgExact ? { label: `Add '${typedOrg}' as new company`, onCreate: () => setAddingOrg(typedOrg) } : null;
  const orgChosen = Boolean(org.id || org.isNew || orgName.trim());
  const typedPerson = personName.trim();
  const isChosen = (name: string) => chosen.some((item) => contactKey(item.name) === contactKey(name));
  const personExact = orgPeople.find((item) => contactKey(item.name) === contactKey(typedPerson)) ?? null;
  const addPerson = (item: { id: number | null; name: string }) => { if (!isChosen(item.name)) setChosen((current) => [...current, item]); setPersonName(""); };
  // A new person opens Add contact with the name, inside the company; the contact saved there is added (and listed from then on).
  const linkPerson = (id: number, name: string) => {
    addPerson({ id, name });
    if (org.id) fetchOrganization(org.id).then((detail) => setPeople(detail.people)).catch(() => undefined);
  };
  const personCreate = typedPerson.length >= 2 && !personExact && !isChosen(typedPerson) ? { label: `Add '${typedPerson}' as new person`, onCreate: () => setAddingPerson(typedPerson) } : null;
  /** A comma after a name adds it, so the next one can be typed: a contact of the company, or a new one through Add contact. */
  const typePerson = (value: string) => {
    if (!value.includes(",")) { setPersonName(value); return; }
    const [name, ...rest] = value.split(",");
    const typed = name.trim();
    setPersonName(rest.join(",").trimStart());
    if (!typed || isChosen(typed)) return;
    const known = orgPeople.find((item) => contactKey(item.name) === contactKey(typed));
    if (known) addPerson({ id: known.id, name: known.name });
    else if (orgChosen) setAddingPerson(typed);
  };

  /**
   * The organization and person ids to save: what was picked, an exact name typed, or records created now (the
   * organization first, then the person inside it). A name that is neither picked nor added as new is refused.
   */
  const resolveLinks = async (): Promise<{ organizationId: number | null; personIds: number[] }> => {
    let organizationId = org.id ?? orgExact?.id ?? null;
    const typedOrgName = orgName.trim();
    if (!organizationId && typedOrgName) {
      if (!org.isNew) throw new Error(`Pick “${typedOrgName}” from the list, or add it as a new company.`);
      organizationId = (await createOrganization({ name: typedOrgName, website: "", address: "", cityId: null, industry: "", companySizeId: null })).organization.id;
    }
    if (typedPerson) throw new Error(`Pick “${typedPerson}” from the list, or add them as a new person.`);
    const personIds: number[] = [];
    for (const item of chosen) {
      if (item.id) { personIds.push(item.id); continue; }
      if (!organizationId) throw new Error("Choose the company first: people are added inside it.");
      personIds.push((await createPerson({ name: item.name, organizationName: typedOrgName || orgName, emails: [], phone: "", altPhone: "", remark: "" })).person.id);
    }
    return { organizationId, personIds };
  };

  const removeSaved = async (attachment: TaskAttachment) => {
    try { await removeTaskAttachment(attachment.id); reloadAttachments(); } catch (caught) { setError(errorMessage(caught, "Could not remove the file.")); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!date) { setError("Choose the date."); return; }
    if (end && !start) { setError("Give a start time with the end time."); return; }
    if (start && end && end <= start) { setError("The end time must be after the start."); return; }
    setBusy(true);
    setError("");
    // No start time: the activity is due that day (an all-day item on the calendar).
    const dueAt = new Date(`${date}T${start || "00:00"}`).toISOString();
    const endsAt = start && end ? new Date(`${date}T${end}`).toISOString() : null;
    try {
      const links = await resolveLinks();
      const common = {
        leadId: deal?.id ?? null, title: title.trim() || autoTitle(type), description: description.trim(), note: note.trim(), assigneeId: Number(assigneeId), assigneeIds,
        dueAt, endsAt, activityType: type, priority, checklist, organizationId: links.organizationId, personIds: links.personIds,
      };
      const saved = task
        ? (await updateTask(task.id, { ...common, ...(done !== (task.status === "done") ? { status: done ? "done" : "open" } : {}), outcomeId: done && outcomeId ? Number(outcomeId) : null })).task
        : (await createTask({ ...common, done, outcomeId: done && outcomeId ? Number(outcomeId) : null })).task;
      // Files chosen in the form are uploaded once the activity exists.
      for (const file of files) await uploadTaskAttachment(saved.id, file);
      // An open activity scheduled from a deal is the deal's next step: its date becomes the follow-up date.
      if (!task && !done && setFollowUp && deal) await updateLead(deal.id, { followUpDate: date }).catch(() => undefined);
      onSaved(saved, task ? "Activity updated" : `${taskActivityLabels[type]} ${done ? "recorded as done" : `scheduled for ${date}`}`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the activity."));
      setBusy(false);
    }
  };

  const visibleResults = dealSearch.trim() ? dealResults : [];
  return (
    <Dialog title={task ? "Edit Activity" : "Schedule an Activity"} onClose={onClose} size="wide">
      <form className="activity-dialog" onSubmit={submit}>
        <div className="activity-dialog-main">
          <input className="activity-subject-input" aria-label="Subject" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder={autoTitle(type)} autoFocus />
          <div className="activity-type-buttons" role="group" aria-label="Activity type">
            {taskActivityTypes.map((item) => (
              <button key={item} type="button" className={`activity-type-${item} ${type === item ? "is-active" : ""}`} aria-pressed={type === item} aria-label={taskActivityLabels[item]} title={taskActivityLabels[item]} onClick={() => changeType(item)}>{activityIcons[item]}</button>
            ))}
          </div>

          <Row icon={<Clock3 size={20} />} label="When">
            <div className="activity-when-row">
              <input type="date" aria-label="Date" value={date} onChange={(event) => setDate(event.target.value)} required />
              <input type="time" aria-label="Start time" value={start} onChange={(event) => setStart(event.target.value)} />
              <span aria-hidden="true">–</span>
              <input type="time" aria-label="End time" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} />
            </div>
          </Row>

          {/* TASK-03: a date typed in words ("next Monday at 10am") fills the date and the start time; its name shows on hover. */}
          <Row icon={<Sparkles size={20} />} label="Type a due date">
            <NaturalDateField compact onResolve={(result, time) => { setDate(result.date); setStart(time); }} />
          </Row>

          <Row icon={<Flag size={20} />} label="Priority">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Row>

          <Row icon={<UserRound size={20} />} label="Assigned to">
            <div className="activity-assignees">
              <ul className="activity-people" aria-label="Assigned to">
                {assigneeIds.map((id, index) => (
                  <li key={id} className={index === 0 ? "is-first" : undefined} title={index === 0 ? "Their day is shown on the right" : undefined}>
                    <UserRound size={13} /> <span>{nameOf(id)}</span>
                    {assigneeIds.length > 1 && <button type="button" aria-label={`Remove ${nameOf(id)}`} title="Remove" onClick={() => setAssigneeIds((current) => current.filter((other) => other !== id))}><X size={12} /></button>}
                  </li>
                ))}
              </ul>
              {owners.some((item) => !assigneeIds.includes(item.id)) && (
                <select className="activity-assignee-add" aria-label="Add a team member" value="" onChange={(event) => { const id = Number(event.target.value); if (id) setAssigneeIds((current) => [...current, id]); }}>
                  <option value="">+ Add a team member</option>
                  {owners.filter((item) => !assigneeIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.id === user.id ? `${item.name} (You)` : item.name}</option>)}
                </select>
              )}
            </div>
          </Row>

          {/* Linked to (request of November 18, 2026): the organization, a person inside it, and optionally a deal. */}
          <Row icon={<Link2 size={20} />} label="Linked to">
            <div className="activity-links-fields">
              <SuggestInput
                aria-label="Company" value={orgName} onChange={changeOrgName}
                suggestions={orgRows && orgRows.q === typedOrg ? orgRows.rows.map((row) => ({ key: String(row.id), label: row.name, detail: [row.city, row.people ? `${row.people} ${row.people === 1 ? "contact" : "contacts"}` : null].filter(Boolean).join(" · ") || undefined, icon: <Building2 size={14} /> })) : []}
                onPick={(suggestion) => { setOrgName(suggestion.label); setOrg({ id: Number(suggestion.key), isNew: false }); setChosen([]); setPersonName(""); }}
                loading={typedOrg.length >= 2 && orgRows?.q !== typedOrg}
                icon={<Building2 size={16} />} create={orgCreate} isNew={org.isNew} onClear={clearOrg}
                maxLength={200} placeholder="Company"
              />
              {chosen.length > 0 && (
                <ul className="activity-people" aria-label="People">
                  {chosen.map((item) => (
                    <li key={`${item.id ?? "new"}-${item.name}`}>
                      <UserRound size={13} /> <span>{item.name}</span>{!item.id && <span className="suggest-new-badge">NEW</span>}
                      <button type="button" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => setChosen((current) => current.filter((other) => other !== item))}><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <SuggestInput
                aria-label="Person" value={personName} onChange={typePerson}
                suggestions={orgPeople.filter((item) => !isChosen(item.name) && (!typedPerson || contactKey(item.name).includes(contactKey(typedPerson)))).map((item) => ({ key: String(item.id), label: item.name, detail: item.email ?? undefined, icon: <UserRound size={14} /> }))}
                onPick={(suggestion) => addPerson({ id: Number(suggestion.key), name: suggestion.label })}
                minChars={0} disabled={!orgChosen}
                icon={<UserRound size={16} />} create={orgChosen ? personCreate : null}
                maxLength={160} placeholder={!orgChosen ? "People (choose the company first)" : chosen.length ? "Add another person" : "People"}
              />
              {deal ? (
                <div className="activity-link-field is-set"><CircleDollarSign size={16} /> <span>{deal.name}</span>{!leadId && <button type="button" className="suggest-clear" aria-label="Remove the deal" title="Remove" onClick={() => setDeal(null)}><X size={15} /></button>}</div>
              ) : (
                <div className="activity-link-search">
                  <div className="activity-link-field"><CircleDollarSign size={16} /><input aria-label="Deal" value={dealSearch} onChange={(event) => setDealSearch(event.target.value)} placeholder="Deal (optional)" /><Search size={14} /></div>
                  {visibleResults.length > 0 && (
                    <ul className="suggest-list">
                      {visibleResults.map((result) => (
                        <li key={result.id} onMouseDown={(event) => { event.preventDefault(); linkDeal(result); setDealSearch(""); setDealResults([]); }}>
                          <CircleDollarSign size={14} /><span className="suggest-text"><strong>{result.clientName}</strong><small>{[result.clientExecutive, result.ownerName].filter(Boolean).join(" · ")}</small></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </Row>

          {/* Description, Checklist, Note and Files (request of November 18, 2026): one row of links before the outcome;
              a click opens that section here, one at a time, and a second click folds it. A link with content is marked. */}
          <Row icon={<MoreHorizontal size={20} />} label={section ? "Close the section" : "Details"} onIcon={section ? () => setSection(null) : undefined}>
            <div className="activity-details">
              <div className="activity-detail-tabs" role="tablist" aria-label="Details">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.id} type="button" role="tab" aria-selected={section === tab.id} aria-controls="activity-detail-panel"
                    className={`${section === tab.id ? "is-active" : ""} ${tab.filled ? "is-filled" : ""}`}
                    onClick={() => setSection((current) => (current === tab.id ? null : tab.id))}
                  >
                    {tab.icon} {tab.label}{tab.count ? ` (${tab.count})` : ""}
                  </button>
                ))}
              </div>
              <input ref={fileInput} type="file" multiple hidden accept={acceptedFiles} onChange={(event) => { const chosen = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...chosen]); event.target.value = ""; setSection("files"); }} />
              {section && (
                <div className={`activity-detail-panel is-${section}`} id="activity-detail-panel" role="tabpanel">
                  {section === "description" && (
              <textarea aria-label="Description" rows={4} autoFocus value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} placeholder="Description" />
                  )}
                  {section === "checklist" && (
              <div className="checklist-editor">
                {checklist.map((item, index) => (
                  <label key={`${item.text}-${index}`} className="checklist-item">
                    <input type="checkbox" checked={item.done} onChange={(event) => setChecklist((current) => current.map((entry, position) => (position === index ? { ...entry, done: event.target.checked } : entry)))} />
                    <span className={item.done ? "is-done" : ""}>{item.text}</span>
                    <button type="button" aria-label={`Remove ${item.text}`} onClick={() => setChecklist((current) => current.filter((_, position) => position !== index))}><X size={12} /></button>
                  </label>
                ))}
                <span className="checklist-add">
                  <input value={newItem} onChange={(event) => setNewItem(event.target.value)} maxLength={200} placeholder="Add a checklist item" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} />
                  <button type="button" className="button button-outline button-small" onClick={addItem}><Plus size={13} /> Add</button>
                </span>
              </div>
                  )}
                  {section === "note" && (
                    <textarea className="activity-note" aria-label="Note" rows={4} autoFocus value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} placeholder="Notes are visible within LeadTrailPro" />
                  )}
                  {section === "files" && (
                    <div className="activity-files-panel">
              <ul className="activity-files">
                {(attachments ?? []).map((attachment) => (
                  <li key={attachment.id}>
                    <a href={taskAttachmentUrl(attachment.id)} target="_blank" rel="noreferrer">{attachment.fileName}</a>
                    <small>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</small>
                    {can("manage_tasks") && <button type="button" className="icon-button" aria-label={`Remove ${attachment.fileName}`} title="Remove" onClick={() => void removeSaved(attachment)}><X size={13} /></button>}
                  </li>
                ))}
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="is-pending">
                    <span>{file.name}</span>
                    <small>{Math.max(1, Math.round(file.size / 1024))} KB · uploaded on save</small>
                    <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} title="Remove" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}><X size={13} /></button>
                  </li>
                ))}
              </ul>
                      <button type="button" className="button button-outline button-small" onClick={() => fileInput.current?.click()}><Paperclip size={13} /> Choose files</button>
                      <small className="field-hint">PDF, Word, Excel, PowerPoint, images or text, up to 15 MB each.</small>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Row>

          {done && (
            <Row icon={<Target size={20} />} label="Outcome">
              <select className="activity-outcome-select" aria-label="Outcome" value={outcomeId} onChange={(event) => setOutcomeId(event.target.value)}>
                <option value="">Outcome: None</option>
                {outcomes.map((item) => <option key={item.id} value={item.id}>{item.value}</option>)}
              </select>
            </Row>
          )}

          <ErrorText message={error} />
          <div className="activity-dialog-footer">
            <label className="checklist-item activity-done"><input type="checkbox" checked={done} onChange={(event) => setDone(event.target.checked)} /> Mark as done</label>
            <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary activity-save" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          </div>
          {task && <TaskComments task={task} />}
        </div>
        <DayAgenda
          date={date} onDate={setDate} assigneeId={Number(assigneeId)} skipTaskId={task?.id}
          ownerLabel={Number(assigneeId) === user.id ? undefined : `${owners.find((item) => item.id === Number(assigneeId))?.name ?? "Their"}'s day`}
          draft={{ title: title || autoTitle(type), icon: activityIcons[type], start, end }}
        />
      </form>
      {addingOrg !== null && (
        <OrganizationFormDialog
          initialName={addingOrg}
          onUseExisting={(found) => { setAddingOrg(null); linkOrg(found.id, found.name); }}
          onClose={() => setAddingOrg(null)}
          onSaved={(saved) => { setAddingOrg(null); linkOrg(saved.id, saved.name); }}
        />
      )}
      {addingPerson !== null && (
        <PersonFormDialog
          organizationName={orgName.trim()}
          initialName={addingPerson}
          onUseExisting={(found) => { setAddingPerson(null); linkPerson(found.id, found.name); }}
          onClose={() => setAddingPerson(null)}
          onSaved={(saved) => { setAddingPerson(null); linkPerson(saved.id, saved.name); }}
        />
      )}
    </Dialog>
  );
}

