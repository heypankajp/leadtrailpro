"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Flame,
  ExternalLink,
  LayoutDashboard,
  ListTodo,
  Mail,
  Map,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import mammoth from "mammoth";
import LeadTable from "@/features/leads/LeadTable";
import { createLeadRecord, deleteLeadRecord, fetchLeads, leadPayload, saveLeadRecord } from "@/features/leads/client";
import { leadStatuses, type LeadStatus, type StoredLead } from "@/features/leads/model";
import UserDirectoryDialog from "@/features/users/UserDirectoryDialog";
import type { UserAccount } from "@/features/users/model";

type Status = LeadStatus;
const leadActionOptions = [
  "Follow-up call",
  "Sent proposal",
  "On-site meeting",
  "Shared Profiles",
  "First contact",
  "Contract signed",
  "No response",
  "Email sent",
  "Meeting scheduled",
  "Call completed",
  "Others ( Please specify )",
];
const statusByView: Partial<Record<string, Status>> = {
  Cold: "Cold Lead",
  Warm: "Warm Lead",
  Hot: "Hot Lead",
  Client: "Client",
};

const statusClassName = (status: Status) => status.toLowerCase().replaceAll(" ", "-");
const isCompanyWebsiteUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

type Lead = StoredLead;

type LeadFollowUp = {
  id: number;
  leadId: number;
  leadName: string;
  dueDate: string;
  dueTime: string;
  notes: string;
};

type LeadNote = {
  id: number;
  leadId: number;
  content: string;
  author: string;
  createdAt: string;
};

type AttachmentCategory = "JD" | "Resume" | "Agreement" | "Other";

type LeadAttachment = {
  id: number;
  leadId: number;
  category: AttachmentCategory;
  specifiedName: string;
  file: File;
  version: number;
};

type AttachmentPreview = {
  attachmentId: number;
  url: string;
};

type DocxPreview = {
  attachmentId: number;
  text?: string;
  error?: string;
};

const initialLeadNotes: LeadNote[] = [
  { id: 1, leadId: 1, content: "Initial conversation with Elena. They are reviewing warehouse staffing needs for the upcoming season.", author: "Sarah Lee", createdAt: "2026-10-10T09:15:00" },
  { id: 2, leadId: 1, content: "Sent a follow-up email with an overview of our logistics recruitment services.", author: "Sarah Lee", createdAt: "2026-10-12T14:30:00" },
  { id: 3, leadId: 1, content: "Elena asked for a call to discuss timelines and the first group of candidates.", author: "Jordan Taylor", createdAt: "2026-10-13T11:00:00" },
  { id: 4, leadId: 2, content: "James is coordinating with the clinic managers and will confirm role requirements.", author: "Sarah Lee", createdAt: "2026-10-11T10:00:00" },
];

const navigation: { title: string; items: { id: string; label: string; icon: LucideIcon; count?: string; tone?: string; highlight?: boolean }[] }[] = [
  {
    title: "WORKSPACE",
    items: [
      { id: "home", label: "Action center", icon: LayoutDashboard },
      { id: "leads", label: "My leads", icon: UsersRound, count: "24" },
      { id: "all-leads", label: "All leads", icon: BriefcaseBusiness },
      { id: "Cold", label: "Cold leads", icon: CircleHelp, tone: "cold" },
      { id: "Warm", label: "Warm leads", icon: Activity, tone: "warm" },
      { id: "Hot", label: "Hot leads", icon: Flame, tone: "hot" },
      { id: "Client", label: "Clients", icon: CheckCheck, tone: "client" },
      { id: "queued", label: "Queued leads", icon: Clock3, count: "3" },
      { id: "archive", label: "Archive", icon: FileText },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { id: "opportunities", label: "Opportunities", icon: Sparkles, count: "12", highlight: true },
      { id: "lead-generation", label: "Lead generation", icon: Building2 },
      { id: "tasks", label: "Tasks & reminders", icon: ListTodo, count: "5" },
      { id: "planner", label: "Road visit planner", icon: Map },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { id: "reports", label: "Reports & targets", icon: TrendingUp },
      { id: "admin", label: "Administration", icon: Settings2 },
    ],
  },
];

const opportunities = [
  { company: "Cedarline Foods", title: "Warehouse Operations Manager", location: "Etobicoke, ON", source: "Indeed · 2 days ago", match: 94, color: "green" },
  { company: "Axiom Industrial", title: "Senior Millwright", location: "Vaughan, ON", source: "Company careers · 1 day ago", match: 89, color: "blue" },
  { company: "Everwell Living", title: "Director of Nursing", location: "Toronto, ON", source: "Indeed · 3 days ago", match: 82, color: "orange" },
];

const localDateISO = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatFollowUpDateTime = (date: string, time: string) => {
  if (!date || !time) return "Date and time not set";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`${date}T${time}`));
};

const formatLeadFollowUp = (followUp: string) => {
  const date = followUp === "Today"
    ? new Date(`${localDateISO()}T12:00:00`)
    : followUp === "Tomorrow"
      ? new Date(`${localDateISO(1)}T12:00:00`)
      : (() => {
          const monthAndDay = followUp.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
          return monthAndDay
            ? new Date(`${monthAndDay[1]} ${monthAndDay[2]}, ${new Date().getFullYear()}`)
            : null;
        })();
  if (!date || Number.isNaN(date.getTime())) return followUp;
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return `${followUp} · ${formattedDate}`;
};

const formatNoteDateTime = (dateTime: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateTime));

export default function Home() {
  const [activeView, setActiveView] = useState("home");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [queuedLeads, setQueuedLeads] = useState<Lead[]>([]);
  const [archivedLeads, setArchivedLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>(initialLeadNotes);
  const [attachments, setAttachments] = useState<LeadAttachment[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "All statuses">("All statuses");
  const [selected, setSelected] = useState<number[]>([]);
  const [dialog, setDialog] = useState<"new-lead" | "lead-detail" | null>(null);
  const [usersDialogMode, setUsersDialogMode] = useState<"manage" | "transfer" | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [isFollowUpComposerOpen, setIsFollowUpComposerOpen] = useState(false);
  const [leadActionSelection, setLeadActionSelection] = useState("");
  const [customLeadAction, setCustomLeadAction] = useState("");
  const [isCompanyUrlEditing, setIsCompanyUrlEditing] = useState(false);
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [docxPreview, setDocxPreview] = useState<DocxPreview | null>(null);
  const [attachmentCategory, setAttachmentCategory] = useState<AttachmentCategory>("JD");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [newOpportunities, setNewOpportunities] = useState(opportunities);
  const [generated, setGenerated] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [loginError, setLoginError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const previewAttachment = attachmentPreview
    ? attachments.find((attachment) => attachment.id === attachmentPreview.attachmentId) ?? null
    : null;

  useEffect(() => {
    if (!attachmentPreview) return;
    return () => URL.revokeObjectURL(attachmentPreview.url);
  }, [attachmentPreview]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const result = await response.json() as { user?: UserAccount | null; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not verify your session.");
        if (!cancelled) {
          setCurrentUser(result.user ?? null);
          setSessionStatus(result.user ? "signed-in" : "signed-out");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoginError(error instanceof Error ? error.message : "Could not verify your session.");
          setSessionStatus("signed-out");
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (sessionStatus !== "signed-in" || !currentUser) return;
    let cancelled = false;
    fetchLeads()
      .then((loadedLeads) => {
        if (cancelled) return;
        setLeads(loadedLeads.filter((lead) => lead.recordState === "active"));
        setQueuedLeads(loadedLeads.filter((lead) => lead.recordState === "queued"));
        setArchivedLeads(loadedLeads.filter((lead) => lead.recordState === "archived"));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setToast(error instanceof Error ? error.message : "Could not load leads from MySQL.");
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, sessionStatus]);

  useEffect(() => {
    if (!previewAttachment || !previewAttachment.file.name.toLowerCase().endsWith(".docx")) return;
    let cancelled = false;
    previewAttachment.file.arrayBuffer()
      .then((arrayBuffer) => mammoth.extractRawText({ arrayBuffer }))
      .then((result) => {
        if (!cancelled) setDocxPreview({ attachmentId: previewAttachment.id, text: result.value });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDocxPreview({
            attachmentId: previewAttachment.id,
            error: error instanceof Error ? error.message : "The document could not be read.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewAttachment]);

  const filteredLeads = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const source = activeView === "archive" ? archivedLeads : activeView === "queued" ? queuedLeads : leads;
    return source.filter((lead) => {
      const matchesSearch =
        !normalized ||
        [lead.name, lead.contact, lead.status, lead.action, lead.city, lead.industry, lead.owner]
          .some((value) => value.toLowerCase().includes(normalized));
      const status = statusByView[activeView] ?? statusFilter;
      const matchesStatus = status === "All statuses" || lead.status === status;
      const currentOwner = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : "";
      const matchesView = activeView !== "leads" || lead.owner === "You" || lead.owner === currentOwner;
      return matchesSearch && matchesStatus && matchesView;
    });
  }, [activeView, archivedLeads, currentUser, leads, queuedLeads, search, statusFilter]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const notifyPersistenceError = (error: unknown) => {
    notify(error instanceof Error ? error.message : "The lead could not be saved to MySQL.");
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSigningIn(true);
    setLoginError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json() as { user?: UserAccount; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "Could not sign in.");
      setCurrentUser(result.user);
      setSessionStatus("signed-in");
      setLoginError("");
      form.reset();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign out.");
      setCurrentUser(null);
      setLeads([]);
      setQueuedLeads([]);
      setArchivedLeads([]);
      setSessionStatus("signed-out");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not sign out.");
    }
  };

  const navigate = (id: string) => {
    setActiveView(id);
    setSearch("");
    setStatusFilter("All statuses");
    setSelected([]);
    setMobileNavOpen(false);
  };

  const syncLeadActionEditor = (action: string) => {
    const isStandardAction = leadActionOptions.includes(action);
    setLeadActionSelection(isStandardAction ? action : "Others ( Please specify )");
    setCustomLeadAction(isStandardAction ? "" : action);
  };

  const openLead = (lead: Lead) => {
    setAttachmentPreview(null);
    setDocxPreview(null);
    setActiveLead(lead);
    setIsFollowUpComposerOpen(false);
    syncLeadActionEditor(lead.action);
    setIsAttachmentsOpen(false);
    setIsNotesOpen(false);
    setIsCompanyUrlEditing(false);
    setAttachmentCategory("JD");
    setDialog("lead-detail");
  };

  const openAttachmentPreview = (attachment: LeadAttachment) => {
    setDocxPreview(null);
    setAttachmentPreview({
      attachmentId: attachment.id,
      url: URL.createObjectURL(attachment.file),
    });
  };

  const navigateAttachmentPreview = (direction: -1 | 1) => {
    if (!previewAttachment || !attachmentPreview) return;
    const leadAttachments = attachments.filter((attachment) => attachment.leadId === previewAttachment.leadId);
    const currentIndex = leadAttachments.findIndex((attachment) => attachment.id === previewAttachment.id);
    const nextAttachment = leadAttachments[currentIndex + direction];
    if (nextAttachment) openAttachmentPreview(nextAttachment);
  };

  const closeAttachmentPreview = () => {
    setAttachmentPreview(null);
    setDocxPreview(null);
  };

  const closeDialog = () => {
    closeAttachmentPreview();
    setDialog(null);
    setIsFollowUpComposerOpen(false);
    setIsAttachmentsOpen(false);
    setIsNotesOpen(false);
    setIsCompanyUrlEditing(false);
  };

  const addAttachment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLead) return;
    const data = new FormData(event.currentTarget);
    const file = data.get("attachmentFile");
    const specifiedName = String(data.get("specifiedName") || "").trim();
    if (!(file instanceof File) || file.size === 0) {
      notify("Choose a file to attach.");
      return;
    }
    if (attachmentCategory === "Other" && !specifiedName) {
      notify("Enter a name for this attachment.");
      return;
    }
    const previousVersions = attachments.filter((attachment) =>
      attachment.leadId === activeLead.id &&
      attachment.category === attachmentCategory &&
      attachment.file.name.toLowerCase() === file.name.toLowerCase()
    );
    const attachment: LeadAttachment = {
      id: Date.now(),
      leadId: activeLead.id,
      category: attachmentCategory,
      specifiedName: attachmentCategory === "Other" ? specifiedName : "",
      file,
      version: previousVersions.length + 1,
    };
    setAttachments((current) => [attachment, ...current]);
    event.currentTarget.reset();
    setAttachmentCategory("JD");
    notify(`${attachment.category === "Other" ? specifiedName : attachment.category} attached to ${activeLead.name}`);
  };

  const updateLeadStatus = async (status: Status) => {
    if (!activeLead || activeLead.status === status) return;
    const updatedLead = {
      ...activeLead,
      status,
      action: `Status changed to ${status}`,
      lastActivity: "Just now",
    };
    try {
      await saveLeadRecord(updatedLead.id, leadPayload(updatedLead, activeLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setQueuedLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setArchivedLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setActiveLead(updatedLead);
    syncLeadActionEditor(updatedLead.action);
    notify(`${activeLead.name} moved to ${status}`);
  };

  const updateLeadAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLead) return;
    const action = leadActionSelection === "Others ( Please specify )" ? customLeadAction.trim() : leadActionSelection;
    if (!action) {
      notify("Please specify the last action.");
      return;
    }
    const updatedLead = { ...activeLead, action, lastActivity: "Just now" };
    try {
      await saveLeadRecord(updatedLead.id, leadPayload(updatedLead, activeLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setQueuedLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setArchivedLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setActiveLead(updatedLead);
    syncLeadActionEditor(action);
    notify(`Last action updated for ${activeLead.name}`);
  };

  const updateCompanyUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLead) return;
    const data = new FormData(event.currentTarget);
    const companyUrl = String(data.get("companyUrl") || "").trim();
    if (!isCompanyWebsiteUrl(companyUrl)) {
      notify("Enter a company website beginning with http:// or https://");
      return;
    }
    const updatedLead = { ...activeLead, companyUrl };
    try {
      await saveLeadRecord(updatedLead.id, leadPayload(updatedLead, activeLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setQueuedLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setArchivedLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setActiveLead(updatedLead);
    setIsCompanyUrlEditing(false);
    notify(`Company link updated for ${activeLead.name}`);
  };

  const createFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLead) return;
    const data = new FormData(event.currentTarget);
    const dueDate = String(data.get("dueDate") || "");
    const dueTime = String(data.get("dueTime") || "");
    const notes = String(data.get("notes") || "").trim();
    const followUp: LeadFollowUp = {
      id: Date.now(),
      leadId: activeLead.id,
      leadName: activeLead.name,
      dueDate,
      dueTime,
      notes,
    };
    const updatedLead = {
      ...activeLead,
      followUp: formatFollowUpDateTime(dueDate, dueTime),
      action: "Follow-up scheduled",
      lastActivity: "Just now",
    };
    try {
      await saveLeadRecord(updatedLead.id, leadPayload(updatedLead, activeLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setFollowUps((current) => [followUp, ...current]);
    setLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setActiveLead(updatedLead);
    syncLeadActionEditor(updatedLead.action);
    setIsFollowUpComposerOpen(false);
    notify(`Follow-up scheduled for ${activeLead.name}`);
  };

  const createLeadNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLead) return;
    const data = new FormData(event.currentTarget);
    const content = String(data.get("note") || "").trim();
    if (!content) return;
    const createdAt = new Date().toISOString();
    const note: LeadNote = {
      id: Date.now(),
      leadId: activeLead.id,
      content,
      author: "Sarah Lee",
      createdAt,
    };
    const updatedLead = {
      ...activeLead,
      action: "Note added",
      lastActivity: "Just now",
    };
    try {
      await saveLeadRecord(updatedLead.id, leadPayload(updatedLead, activeLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setLeadNotes((current) => [...current, note]);
    setLeads((current) => current.map((lead) => lead.id === activeLead.id ? updatedLead : lead));
    setActiveLead(updatedLead);
    syncLeadActionEditor(updatedLead.action);
    event.currentTarget.reset();
    notify(`Note added to ${activeLead.name}`);
  };

  const createLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    const companyUrl = String(data.get("companyUrl") || "").trim();
    if (companyUrl && !isCompanyWebsiteUrl(companyUrl)) {
      notify("Enter a company website beginning with http:// or https://");
      return;
    }
    const firstContact = String(data.get("firstContact") || localDateISO());
    const newLead: Lead = {
      id: Date.now(),
      name,
      companyUrl: companyUrl || undefined,
      contact: String(data.get("contact") || "New contact"),
      contactEmail: String(data.get("contactEmail") || ""),
      contactPhone: String(data.get("contactPhone") || ""),
      initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      color: "blue",
      status: leadStatuses.find((status) => status === data.get("status")) ?? "Cold Lead",
      action: "New lead created",
      followUp: String(data.get("followUp") || "Not set"),
      owner: "You",
      city: String(data.get("city") || "Toronto"),
      industry: String(data.get("industry") || "Other"),
      lastActivity: "Just now",
      type: String(data.get("type") || "Cold Call"),
      firstContact,
      recordState: firstContact < localDateISO(-1) ? "queued" : "active",
    };
    let storedLead: Lead;
    try {
      storedLead = await createLeadRecord(leadPayload(newLead, newLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    if (firstContact < localDateISO(-1)) {
      setQueuedLeads((current) => [storedLead, ...current]);
      setDialog(null);
      navigate("queued");
      notify(`${name} saved as a queued lead for Admin approval`);
      return;
    }
    setLeads((current) => [storedLead, ...current]);
    setDialog(null);
    navigate("leads");
    notify(`${name} added to your leads`);
  };

  const archiveSelected = async () => {
    if (!selected.length) return;
    const count = selected.length;
    if (activeView === "archive") {
      const restored = archivedLeads.filter((lead) => selected.includes(lead.id));
      try {
        await Promise.all(restored.map((lead) => saveLeadRecord(lead.id, leadPayload(lead, "active"))));
      } catch (error) {
        notifyPersistenceError(error);
        return;
      }
      const restoredLeads: Lead[] = restored.map((lead) => ({ ...lead, recordState: "active" }));
      setArchivedLeads((current) => current.filter((lead) => !selected.includes(lead.id)));
      setLeads((current) => [...restoredLeads, ...current]);
      setSelected([]);
      notify(`${count} ${count === 1 ? "lead" : "leads"} restored to your pipeline`);
      return;
    }
    const toArchive = leads.filter((lead) => selected.includes(lead.id));
    const archived = toArchive.map((lead) => ({ ...lead, recordState: "archived" as const }));
    try {
      await Promise.all(archived.map((lead) => saveLeadRecord(lead.id, leadPayload(lead, "archived"))));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setArchivedLeads((current) => [...archived, ...current]);
    setLeads((current) => current.filter((lead) => !selected.includes(lead.id)));
    setSelected([]);
    notify(`${count} ${count === 1 ? "lead" : "leads"} moved to archive`);
  };

  const reviewQueuedLead = async (lead: Lead, approve: boolean) => {
    const reviewedLead = { ...lead, action: "Queued lead approved", lastActivity: "Just now", recordState: "active" as const };
    try {
      if (approve) await saveLeadRecord(reviewedLead.id, leadPayload(reviewedLead, "active"));
      else await deleteLeadRecord(lead.id);
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setQueuedLeads((current) => current.filter((item) => item.id !== lead.id));
    if (approve) setLeads((current) => [reviewedLead, ...current]);
    notify(approve ? `${lead.name} approved and added to the pipeline` : `${lead.name} rejected`);
  };

  const restoreArchivedLead = async (lead: Lead) => {
    const restoredLead: Lead = { ...lead, recordState: "active" };
    try {
      await saveLeadRecord(restoredLead.id, leadPayload(restoredLead, "active"));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setArchivedLeads((current) => current.filter((item) => item.id !== lead.id));
    setLeads((current) => [restoredLead, ...current]);
    notify(`${lead.name} restored to your pipeline`);
  };

  const transferLeadToUser = async (user: UserAccount) => {
    if (!activeLead) return;
    const owner = `${user.firstName} ${user.lastName}`;
    const transferredLead: Lead = { ...activeLead, owner };
    try {
      await saveLeadRecord(transferredLead.id, leadPayload(transferredLead, transferredLead.recordState));
    } catch (error) {
      notifyPersistenceError(error);
      return;
    }
    setLeads((current) => current.map((lead) => lead.id === activeLead.id ? transferredLead : lead));
    setQueuedLeads((current) => current.map((lead) => lead.id === activeLead.id ? transferredLead : lead));
    setArchivedLeads((current) => current.map((lead) => lead.id === activeLead.id ? transferredLead : lead));
    setActiveLead(transferredLead);
    setUsersDialogMode(null);
    notify(`${activeLead.name} transferred to ${owner}`);
  };

  const toggleSelected = (id: number) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const pageTitles: Record<string, string> = {
    home: "Action center",
    leads: "My leads",
    "all-leads": "All leads",
    Cold: "Cold leads",
    Warm: "Warm leads",
    Hot: "Hot leads",
    Client: "Clients",
    queued: "Queued leads",
    archive: "Archive",
    opportunities: "Opportunity recommendations",
    "lead-generation": "Lead generation",
    tasks: "Tasks & reminders",
    planner: "Road visit planner",
    reports: "Reports & targets",
    admin: "Administration",
  };

  const renderLeads = (mode: "table" | "follow-up" = "table") => (
    <LeadTable
      leads={filteredLeads}
      totalCount={activeView === "archive" ? archivedLeads.length : activeView === "queued" ? queuedLeads.length : leads.length}
      activeView={activeView}
      selected={selected}
      search={search}
      statusFilter={statusFilter}
      mode={mode}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
      onSelectionChange={setSelected}
      onToggleSelected={toggleSelected}
      onArchiveSelected={archiveSelected}
      onOpenLead={openLead}
      onReviewQueued={reviewQueuedLead}
      onRestoreLead={restoreArchivedLead}
      onNotify={notify}
    />
  );

  const renderDashboard = () => (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">YOUR DAY AT A GLANCE</div>
          <h1>Good morning, Sarah <span className="wave">✦</span></h1>
          <p>Here’s what’s happening with your pipeline today.</p>
        </div>
        <button className="button button-primary" onClick={() => setDialog("new-lead")}><Plus size={17} /> Add a lead</button>
      </div>

      <section className="performance-grid" aria-label="Weekly performance">
        <MetricCard icon={<Phone size={17} />} label="Calls made" value="24" change="+26%" comparison="vs. last week" series="M8 31 C20 28 23 18 34 23 S50 25 60 15 S77 21 87 10 S102 14 114 4" tone="blue" onClick={() => navigate("leads")} />
        <MetricCard icon={<Mail size={17} />} label="Emails sent" value="31" change="+12%" comparison="vs. last week" series="M8 27 C17 30 23 17 34 22 S49 13 61 18 S76 8 87 12 S102 8 114 4" tone="purple" onClick={() => navigate("leads")} />
        <MetricCard icon={<MapPin size={17} />} label="Visits made" value="12" change="+8%" comparison="vs. last week" series="M8 27 C18 23 24 29 34 18 S48 26 59 18 S76 20 86 9 S102 14 114 4" tone="orange" onClick={() => navigate("planner")} />
        <MetricCard icon={<Target size={17} />} label="Monthly target" value="78%" change="18 / 23 leads" comparison="5 leads to goal" series="M8 28 C18 25 24 19 34 22 S50 13 61 16 S74 9 86 12 S102 5 114 4" tone="green" progress={78} onClick={() => navigate("reports")} />
      </section>

      <div className="dashboard-grid">
        <section className="panel follow-up-panel">
          <div className="panel-heading">
            <div><h2>Follow-ups</h2><p>Stay on top of every conversation</p></div>
            <button className="text-button" onClick={() => navigate("tasks")}>View tasks <ArrowRight size={14} /></button>
          </div>
          <div className="followup-tabs">
            <button className="followup-tab is-active">Today <span>4</span></button>
            <button className="followup-tab" onClick={() => notify("No overdue follow-ups. Nice work!")}>Overdue <span className="tab-alert">2</span></button>
            <button className="followup-tab" onClick={() => notify("Showing tomorrow’s planned follow-ups.")}>Tomorrow <span>3</span></button>
          </div>
          <div className="followup-list">
            {leads.filter((lead) => lead.followUp === "Today").slice(0, 3).map((lead) => (
              <button className="followup-row" key={lead.id} onClick={() => openLead(lead)}>
                <span className={`avatar avatar-${lead.color}`}>{lead.initials}</span>
                <span className="followup-info"><strong>{lead.name}</strong><small>{lead.action} · {lead.contact}</small></span>
                <span className={`status-pill status-${statusClassName(lead.status)}`}><i />{lead.status}</span>
                <span className="followup-time"><Clock3 size={13} /> 10:30 AM</span>
                <ChevronRight className="followup-chevron" size={16} />
              </button>
            ))}
            {leads.filter((lead) => lead.followUp === "Today").length === 0 && <p className="empty-state">You’re all caught up for today.</p>}
          </div>
          <div className="panel-footnote"><span className="footnote-dot" /> 2 follow-ups are past due <button onClick={() => notify("Overdue follow-ups are highlighted in your task list.")}>Review <ArrowRight size={13} /></button></div>
        </section>

        <section className="panel target-panel">
          <div className="panel-heading">
            <div><h2>Your targets</h2><p>October · Training stage</p></div>
            <button className="icon-button subtle-icon" aria-label="Target settings" onClick={() => navigate("reports")}><MoreHorizontal size={18} /></button>
          </div>
          <div className="target-score">
            <div className="target-ring"><div><strong>78<span>%</span></strong><small>monthly goal</small></div></div>
            <div className="target-breakdown"><div><span>Leads created</span><strong>18 <small>/ 23</small></strong></div><div><span>Road visits</span><strong>12 <small>/ 15</small></strong></div><div><span>Conversions</span><strong>4 <small>/ 6</small></strong></div></div>
          </div>
          <div className="target-note"><Sparkles size={14} /><span>You’re <strong>2 leads ahead</strong> of your pace this month.</span></div>
          <button className="panel-link" onClick={() => navigate("reports")}>View target progress <ArrowRight size={14} /></button>
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-heading recent-heading">
          <div><h2>Recent leads</h2><p>Latest activity across your pipeline</p></div>
          <button className="text-button" onClick={() => navigate("leads")}>View all leads <ArrowRight size={14} /></button>
        </div>
        {renderLeads("follow-up")}
      </section>

      <section className="opportunity-banner">
        <div className="opportunity-banner-icon"><Sparkles size={19} /></div>
        <div className="opportunity-banner-copy"><strong>12 new opportunities found for you</strong><span>3 saved searches found relevant job postings overnight.</span></div>
        <button className="button button-light" onClick={() => navigate("opportunities")}>Review opportunities <ArrowRight size={15} /></button>
        <button className="banner-close" aria-label="Dismiss opportunities banner" onClick={(event) => event.currentTarget.parentElement?.remove()}><X size={16} /></button>
      </section>
    </>
  );

  const renderLeadPage = () => (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">YOUR PIPELINE <span className="eyebrow-dot">·</span> {filteredLeads.length} RECORDS</div><h1>{pageTitles[activeView]}</h1><p>Manage relationships and keep every opportunity moving forward.</p></div>
        <button className="button button-primary" onClick={() => setDialog("new-lead")}><Plus size={17} /> Add a lead</button>
      </div>
      <div className="lead-summary-strip">
        <span><i className="summary-dot dot-blue" /> <strong>24</strong> total leads</span><span><i className="summary-dot dot-orange" /> <strong>8</strong> need follow-up</span><span><i className="summary-dot dot-green" /> <strong>4</strong> converted this month</span>
      </div>
      <section className="panel leads-panel">
        <div className="panel-heading leads-panel-heading"><div><h2>All leads</h2><p>Sorted by most recent activity</p></div><button className="icon-button subtle-icon" aria-label="Lead list options" onClick={() => notify("List preferences opened.")}><MoreHorizontal size={18} /></button></div>
        {renderLeads()}
      </section>
    </>
  );

  const renderOpportunities = () => (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">OPPORTUNITY RECOMMENDATION <span className="eyebrow-dot">·</span> UPDATED TODAY</div><h1>Find your next opportunity</h1><p>Relevant hiring signals from your saved searches, all in one place.</p></div>
        <button className="button button-primary" onClick={() => notify("Search terms are ready to configure when a job source is connected.")}><Plus size={17} /> New search term</button>
      </div>
      <div className="opportunity-stats">
        <SmallStat label="New opportunities" value={newOpportunities.length.toString().padStart(2, "0")} note="Since your last visit" icon={<Sparkles size={17} />} />
        <SmallStat label="Found this week" value="38" note="+12% from last week" icon={<TrendingUp size={17} />} />
        <SmallStat label="Converted to leads" value="06" note="This month" icon={<ArrowRight size={17} />} />
        <SmallStat label="Active searches" value="04" note="Across 2 channels" icon={<Search size={17} />} />
      </div>
      <div className="panel opportunity-list-panel">
        <div className="panel-heading"><div><h2>Recommended for you</h2><p>Matched to your locations and staffing focus</p></div><button className="text-button" onClick={() => notify("Showing all active recommendations.")}>View history <ArrowRight size={14} /></button></div>
        <div className="opportunity-filters"><button className="filter-chip active-chip">All new <span>{newOpportunities.length}</span></button><button className="filter-chip" onClick={() => notify("Filtered to the Indeed channel.")}>Indeed</button><button className="filter-chip" onClick={() => notify("Filtered to company career pages.")}>Career pages</button><button className="filter-chip filter-date"><CalendarDays size={14} /> Last 7 days <ChevronDown size={13} /></button></div>
        <div className="recommendation-list">
          {newOpportunities.map((opportunity, index) => (
            <article className="recommendation-card" key={opportunity.company}>
              <div className={`recommendation-logo logo-${opportunity.color}`}>{opportunity.company.split(/\s+/).map((word) => word[0]).join("").slice(0, 2)}</div>
              <div className="recommendation-main"><div className="recommendation-title"><h3>{opportunity.company}</h3><span className="new-badge">NEW</span></div><strong>{opportunity.title}</strong><div className="recommendation-meta"><span><MapPin size={13} />{opportunity.location}</span><span><BriefcaseBusiness size={13} />Full-time</span><span>{opportunity.source}</span></div></div>
              <div className="match-score"><span>{opportunity.match}%</span><small>match</small></div>
              <div className="recommendation-actions"><button className="button button-primary button-small" onClick={() => { setNewOpportunities((current) => current.filter((item) => item.company !== opportunity.company)); notify(`${opportunity.company} converted to a lead`); }}>Convert to lead <ArrowRight size={14} /></button><button className="icon-button recommendation-more" aria-label={`More actions for ${opportunity.company}`} onClick={() => { setNewOpportunities((current) => current.filter((item) => item.company !== opportunity.company)); notify("Opportunity marked as irrelevant."); }}><MoreHorizontal size={18} /></button></div>
              {index < newOpportunities.length - 1 && <span className="recommendation-separator" />}
            </article>
          ))}
          {!newOpportunities.length && <div className="empty-opportunities"><Check size={22} /><strong>You’re all caught up</strong><span>New matching opportunities will show up here.</span></div>}
        </div>
        <div className="source-note"><ShieldCheck size={14} /> Job source connections are a demo preview. Connect approved sources to receive live listings.</div>
      </div>
      <div className="saved-search-row"><div className="saved-search-icon"><Search size={16} /></div><div><strong>Your saved searches</strong><span>Maintenance Hiring · GTA &nbsp; · &nbsp; Healthcare Leadership · Toronto</span></div><button className="text-button" onClick={() => notify("Saved search settings opened.")}>Manage searches <ArrowRight size={14} /></button></div>
    </>
  );

  const renderTasks = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">YOUR WORKDAY <span className="eyebrow-dot">·</span> 5 OPEN</div><h1>Tasks & reminders</h1><p>Every next step, organized so nothing slips through the cracks.</p></div><button className="button button-primary" onClick={() => notify("New task form opened.")}><Plus size={17} /> Create task</button></div>
      {followUps.length > 0 && <section className="panel scheduled-followups"><div className="panel-heading"><div><h2>Scheduled follow-ups</h2><p>Reminders you’ve created from lead overviews</p></div><span className="followup-scheduled-count">{followUps.length}</span></div><div className="scheduled-followup-list">{followUps.map((followUp) => <div className="scheduled-followup-row" key={followUp.id}><span className="timeline-dot"><CalendarCheck2 size={13} /></span><div><strong>{followUp.leadName}</strong><small>{formatFollowUpDateTime(followUp.dueDate, followUp.dueTime)}</small><p>{followUp.notes}</p></div><button className="text-button" onClick={() => { const lead = leads.find((item) => item.id === followUp.leadId); if (lead) openLead(lead); }}>View lead <ArrowRight size={13} /></button></div>)}</div></section>}
      <div className="task-columns">
        <TaskColumn title="Overdue" count="2" tone="red" tasks={[["Call back about the revised contract", "Northstar Logistics · Yesterday, 3:00 PM", "High"], ["Send shortlist of 3 candidates", "Meridian Health Group · Yesterday, 5:00 PM", "Medium"]]} onComplete={() => notify("Task marked complete.")} />
        <TaskColumn title="Today" count="3" tone="blue" tasks={[["Follow up on staffing proposal", "Northstar Logistics · 10:30 AM", "High"], ["Confirm Thursday site visit", "Fable & Stone · 1:00 PM", "Medium"], ["Share candidate profiles", "Vertex Manufacturing · 3:30 PM", "Normal"]]} onComplete={() => notify("Task marked complete.")} />
        <TaskColumn title="Upcoming" count="4" tone="green" tasks={[["Introductory call with HR", "Juniper Hospitality · Oct 17", "Normal"], ["Quarterly check-in", "Brightpath Education · Oct 21", "Low"]]} onComplete={() => notify("Task marked complete.")} />
      </div>
    </>
  );

  const renderPlanner = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">PLAN YOUR DAY <span className="eyebrow-dot">·</span> TORONTO, ON</div><h1>Road visit planner</h1><p>Make the most of every mile with a thoughtful route.</p></div><button className="button button-primary" onClick={() => notify("Add a stop to start planning your route.")}><Plus size={17} /> Add a stop</button></div>
      <div className="planner-toolbar panel"><div className="planner-date"><CalendarDays size={17} /><strong>Wednesday, October 14</strong><ChevronDown size={14} /></div><span className="planner-route-note"><MapPin size={14} /> 4 stops <span>·</span> 26 km total</span><button className="button button-outline" onClick={() => notify("Route optimized for travel time.")}><Sparkles size={15} /> Optimize route</button></div>
      <div className="planner-layout"><div className="panel route-panel"><div className="panel-heading"><div><h2>Today’s route</h2><p>Estimated drive time: 1 hr 12 min</p></div><button className="text-button" onClick={() => notify("Route shared with your team.")}>Share route <ArrowRight size={14} /></button></div><div className="route-stops"><RouteStop time="9:00 AM" company="Northstar Logistics" address="2300 Finch Ave W, Toronto" status="Visit planned" color="violet" /><RouteStop time="10:45 AM" company="Axiom Industrial" address="8000 Keele St, Vaughan" status="Visit planned" color="blue" /><RouteStop time="1:30 PM" company="Lunch break" address="30 minutes · near your route" status="30 min" color="orange" lunch /><RouteStop time="2:15 PM" company="Cedarline Foods" address="100 Carrier Dr, Etobicoke" status="Visit planned" color="green" /><RouteStop time="3:45 PM" company="Fable & Stone" address="180 Queen St W, Toronto" status="Visit planned" color="pink" /></div></div><div className="map-placeholder"><div className="map-grid" /><span className="map-water" /><span className="map-label label-one">NORTH YORK</span><span className="map-label label-two">ETOBICOKE</span><span className="map-label label-three">TORONTO</span><div className="map-route-line" /><span className="map-pin pin-one">1</span><span className="map-pin pin-two">2</span><span className="map-pin pin-three">3</span><span className="map-pin pin-four">4</span><div className="map-controls"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div><span className="map-attribution">Map preview</span></div></div>
    </>
  );

  const renderLeadGeneration = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">DISCOVER YOUR NEXT CLIENT</div><h1>Lead generation</h1><p>Explore a company and find a thoughtful way to start a conversation.</p></div></div>
      <div className="panel generation-panel"><div className="generation-intro"><div className="generation-icon"><Sparkles size={20} /></div><div><h2>Research a company</h2><p>Get a quick brief, hiring signals, and a tailored introduction.</p></div></div><form className="generation-form" onSubmit={(event) => { event.preventDefault(); setGenerated(true); notify("Company brief generated from sample preview data."); }}><label>Company name<input required placeholder="e.g. Acme Industries" /></label><label>Company website<input type="url" placeholder="https://company.com" /></label><label>Search radius<span className="input-with-suffix"><input type="number" defaultValue="25" min="1" /><span>km</span></span></label><button className="button button-primary" type="submit"><Sparkles size={16} /> Generate company brief</button></form>{generated && <div className="generated-brief"><div className="brief-heading"><div><span className="eyebrow">COMPANY BRIEF · PREVIEW</span><h2>Acme Industries</h2></div><span className="match-score"><span>86%</span><small>fit score</small></span></div><p>Growing regional manufacturer with a strong footprint across the Greater Toronto Area. Recent hiring activity suggests expansion in operations and skilled trades.</p><div className="brief-pills"><span><BriefcaseBusiness size={13} /> 4 open roles</span><span><MapPin size={13} /> Within 25 km</span><span><Building2 size={13} /> Manufacturing</span></div><div className="brief-actions"><button className="button button-outline" onClick={() => notify("Acme Industries added to your lead generation list.")}>Save to my list</button><button className="button button-primary" onClick={() => { setDialog("new-lead"); }}>Create a lead <ArrowRight size={14} /></button></div></div>}</div>
      <div className="integration-note"><ShieldCheck size={16} /><span><strong>Source transparency matters.</strong> Company research, reviews, and job sources require connected, approved integrations. This preview uses sample content only.</span></div>
    </>
  );

  const renderReports = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">YOUR PERFORMANCE</div><h1>Reports & targets</h1><p>See your momentum and keep your goals in focus.</p></div><button className="button button-outline" onClick={() => notify("Your report export is being prepared.")}><FileText size={16} /> Export report</button></div>
      <div className="report-periods"><button className="active-period">This week</button><button onClick={() => notify("Showing last week’s report.")}>Last week</button><button onClick={() => notify("Showing month-to-date report.")}>This month</button><button onClick={() => notify("Choose a custom date range.")}>Custom range <ChevronDown size={13} /></button></div>
      <div className="opportunity-stats"><SmallStat label="Leads created" value="18" note="Target: 23 this month" icon={<UsersRound size={17} />} /><SmallStat label="Calls made" value="24" note="+26% vs. last week" icon={<Phone size={17} />} /><SmallStat label="Emails sent" value="31" note="+12% vs. last week" icon={<Mail size={17} />} /><SmallStat label="Road visits" value="12" note="Target: 15 this month" icon={<MapPin size={17} />} /></div>
      <div className="panel report-chart-panel"><div className="panel-heading"><div><h2>Activity over time</h2><p>Your weekly interactions by day</p></div><button className="select-filter" onClick={() => notify("Activity chart is showing all interactions.")}>All activity <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-blue" /> Calls</span><span><i className="legend-purple" /> Emails</span><span><i className="legend-orange" /> Visits</span></div><div className="bar-chart"><div className="chart-y-axis"><span>30</span><span>20</span><span>10</span><span>0</span></div><div className="chart-bars">{[["Mon", 44, 58, 26], ["Tue", 69, 46, 34], ["Wed", 85, 73, 53], ["Thu", 57, 67, 30], ["Fri", 72, 83, 45], ["Sat", 24, 18, 12], ["Sun", 16, 25, 9]].map(([day, a, b, c]) => <div className="bar-day" key={day}><div className="bar-stack"><i style={{ height: `${a}%` }} /><i style={{ height: `${b}%` }} /><i style={{ height: `${c}%` }} /></div><small>{day}</small></div>)}</div></div></div>
    </>
  );

  const renderAdmin = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION <span className="eyebrow-dot">·</span> TEAM OVERVIEW</div><h1>Manage your team</h1><p>People, permissions, and the health of your sales pipeline.</p></div><button className="button button-primary" onClick={() => setUsersDialogMode("manage")}><Plus size={17} /> Add a user</button></div>
      <div className="opportunity-stats"><SmallStat label="Team members" value="12" note="10 active today" icon={<UsersRound size={17} />} /><SmallStat label="Active leads" value="186" note="Across your team" icon={<BriefcaseBusiness size={17} />} /><SmallStat label="Conversions" value="24" note="This month" icon={<TrendingUp size={17} />} /><SmallStat label="Pending approval" value="03" note="Queued leads" icon={<Clock3 size={17} />} /></div>
      <section className="panel team-panel"><div className="panel-heading"><div><h2>Sales manager performance</h2><p>This month · sorted by leads created</p></div><button className="text-button" onClick={() => notify("Team performance report opened.")}>Full report <ArrowRight size={14} /></button></div><div className="table-scroll"><table className="lead-table team-table"><thead><tr><th>TEAM MEMBER</th><th>LEADS</th><th>CALLS</th><th>VISITS</th><th>CONVERSION</th><th>TARGET</th><th /></tr></thead><tbody>{[["SL", "Sarah Lee", "18", "24", "12", "4", "78%"], ["MP", "Michael Patel", "16", "29", "9", "3", "71%"], ["JT", "Jordan Taylor", "14", "21", "11", "5", "84%"], ["AC", "Alex Chen", "11", "18", "8", "2", "63%"]].map((row) => <tr key={row[1]}><td><span className="owner-cell"><span className="mini-avatar">{row[0]}</span><strong>{row[1]}</strong></span></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td>{row[5]}</td><td><span className="target-progress"><i style={{ width: row[6] }} />{row[6]}</span></td><td><button className="row-more" aria-label={`View ${row[1]}`} onClick={() => notify(`${row[1]}'s performance details opened.`)}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div></section>
      <div className="admin-shortcuts"><button className="panel shortcut-card" onClick={() => setUsersDialogMode("manage")}><UsersRound size={18} /><span><strong>User management</strong><small>Roles, access and account settings</small></span><ChevronRight size={16} /></button><button className="panel shortcut-card" onClick={() => notify("List-of-values settings opened.")}><Settings2 size={18} /><span><strong>List of values</strong><small>Manage statuses and dropdowns</small></span><ChevronRight size={16} /></button><button className="panel shortcut-card" onClick={() => notify("Device authorization settings opened.")}><ShieldCheck size={18} /><span><strong>Device authorization</strong><small>Manage trusted company devices</small></span><ChevronRight size={16} /></button></div>
    </>
  );

  const renderQueuedOrArchive = () => (
    <>
      <div className="page-heading"><div><div className="eyebrow">{activeView === "queued" ? "ADMIN REVIEW" : "LEAD HISTORY"}</div><h1>{pageTitles[activeView]}</h1><p>{activeView === "queued" ? "Review historical lead dates before they enter the active pipeline." : "Archived leads are kept for your records and can be restored at any time."}</p></div>{activeView === "queued" && <span className="review-count"><Clock3 size={15} /> 3 awaiting review</span>}</div>
      <section className="panel leads-panel"><div className="panel-heading leads-panel-heading"><div><h2>{activeView === "queued" ? "Awaiting approval" : "Archived leads"}</h2><p>Search across client, contact and lead activity</p></div></div>{renderLeads()}</section>
    </>
  );

  if (sessionStatus !== "signed-in") {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand"><span className="brand-mark"><span /><span /><span /></span><span className="brand-name">salestrack<span>pro</span></span></div>
          <span className="eyebrow">SALES WORKSPACE</span>
          <h1>{sessionStatus === "checking" ? "Checking your session" : "Welcome back"}</h1>
          <p>{sessionStatus === "checking" ? "Connecting securely to your SalesTrackPro workspace." : "Sign in to access your leads and team workspace."}</p>
          {sessionStatus === "checking" ? <div className="login-loading">Verifying session...</div> : (
            <>
              <form className="login-form" onSubmit={signIn}>
                <label>Email address<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
                <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
                {loginError && <p className="user-form-error" role="alert">{loginError}</p>}
                <button className="button button-primary" type="submit" disabled={isSigningIn}>{isSigningIn ? "Signing in..." : "Sign in"}</button>
              </form>
              <button className="login-bootstrap-link" onClick={() => { setLoginError(""); setUsersDialogMode("manage"); }}>First time setup? Create the initial administrator account</button>
            </>
          )}
        </section>
        {usersDialogMode && (
          <UserDirectoryDialog
            mode="manage"
            initialAccount
            onClose={() => setUsersDialogMode(null)}
            onNotify={(message) => setLoginError(message)}
          />
        )}
      </main>
    );
  }

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <button className="brand-lockup" onClick={() => navigate("home")} aria-label="SalesTrackPro home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="brand-name">salestrack<span>pro</span></span>
        </button>
        <div className="workspace-switcher" title={isSidebarCollapsed ? "Northstar Talent · Sales workspace" : undefined}><span className="workspace-icon">N</span><span><strong>Northstar Talent</strong><small>Sales workspace</small></span><ChevronDown size={14} /></div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <span className="nav-label">{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (item.id === "leads" && activeView === "all-leads");
                return (
                  <button key={item.id} title={isSidebarCollapsed ? item.label : undefined} aria-label={isSidebarCollapsed ? item.label : undefined} onClick={() => navigate(item.id)} className={`nav-item ${isActive ? "nav-active" : ""} ${item.highlight ? "nav-highlight" : ""} ${item.tone ? `nav-${item.tone}` : ""}`}>
                    <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} /><span>{item.label}</span>{item.count && <span className={`nav-count ${item.highlight ? "count-highlight" : ""}`}>{item.count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div><Sparkles size={15} /><span>QUICK TIP</span></div><p>Keep your leads warm with a timely follow-up.</p><button onClick={() => navigate("tasks")}>See your tasks <ArrowRight size={13} /></button></div>
          <button className="profile-button" onClick={signOut} title="Sign out"><span className="profile-avatar">{currentUser?.firstName[0]}{currentUser?.lastName[0]}</span><span><strong>{currentUser?.firstName} {currentUser?.lastName}</strong><small>{currentUser?.role} · Sign out</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><button className="sidebar-toggle" aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}><span className="sidebar-toggle-expanded"><PanelLeftClose size={18} /></span><span className="sidebar-toggle-collapsed"><PanelLeftOpen size={18} /></span></button><span className="breadcrumb-root">Workspace</span><ChevronRight size={14} /><span className="breadcrumb-current">{pageTitles[activeView]}</span></div>
          <div className="topbar-right">
            <button className="global-search" onClick={() => document.querySelector<HTMLInputElement>(".global-search-input")?.focus()}><Search size={16} /><input className="global-search-input" placeholder="Search anything..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></button>
            <button className="topbar-icon" aria-label="Help center" onClick={() => notify("Help center opened.")}><CircleHelp size={18} /></button>
            <button className="topbar-icon notification-button" aria-label="Notifications" onClick={() => notify("You’re all caught up on notifications.")}><Bell size={18} /><i /></button>
            <span className="topbar-divider" />
            <button className="topbar-user" onClick={signOut} title="Sign out"><span className="profile-avatar">{currentUser?.firstName[0]}{currentUser?.lastName[0]}</span><ChevronDown size={14} /></button>
          </div>
        </header>
        <div className="main-content">
          {activeView === "home" && renderDashboard()}
          {["leads", "all-leads", "Cold", "Warm", "Hot", "Client"].includes(activeView) && renderLeadPage()}
          {activeView === "opportunities" && renderOpportunities()}
          {activeView === "tasks" && renderTasks()}
          {activeView === "planner" && renderPlanner()}
          {activeView === "lead-generation" && renderLeadGeneration()}
          {activeView === "reports" && renderReports()}
          {activeView === "admin" && renderAdmin()}
          {["queued", "archive"].includes(activeView) && renderQueuedOrArchive()}
          <footer className="app-footer"><span>© 2026 SalesTrackPro</span><span><ShieldCheck size={13} /> Your workspace is secure</span><button onClick={() => notify("Help center opened.")}>Need help?</button></footer>
        </div>
      </main>

      {dialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className={`modal ${dialog === "lead-detail" ? "detail-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header"><div className="modal-title-content"><span className="eyebrow">{dialog === "new-lead" ? "YOUR PIPELINE" : isFollowUpComposerOpen ? "LEAD FOLLOW-UP" : isNotesOpen ? "LEAD NOTES" : attachmentPreview ? "ATTACHMENT PREVIEW" : isAttachmentsOpen ? "LEAD ATTACHMENTS" : "LEAD OVERVIEW"}</span>{dialog === "lead-detail" && activeLead && !isFollowUpComposerOpen && !isNotesOpen && !isAttachmentsOpen && !attachmentPreview ? <><div className="company-name-heading"><h2 id="modal-title">{activeLead.companyUrl ? <a className="company-link-icon" href={activeLead.companyUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${activeLead.name} website`} title="Open company website"><ExternalLink size={14} /></a> : <button type="button" className="company-link-icon" onClick={() => setIsCompanyUrlEditing(true)} aria-label="Add company website" title="Add company website"><ExternalLink size={14} /></button>}{activeLead.name}</h2>{activeLead.companyUrl && <button type="button" className="company-link-edit" onClick={() => setIsCompanyUrlEditing(true)}>Edit link</button>}</div>{isCompanyUrlEditing && <form className="company-url-editor" onSubmit={updateCompanyUrl}><input name="companyUrl" type="url" pattern="https?://.+" title="Enter a URL beginning with http:// or https://" required defaultValue={activeLead.companyUrl ?? ""} placeholder="https://company.com" aria-label="Company website URL" autoFocus /><button className="button button-primary button-small" type="submit">Save link</button><button className="button button-outline button-small" type="button" onClick={() => setIsCompanyUrlEditing(false)}>Cancel</button></form>}</> : <h2 id="modal-title">{dialog === "new-lead" ? "Add a new lead" : isFollowUpComposerOpen ? "Schedule a follow-up" : isNotesOpen ? `Notes · ${activeLead?.name}` : attachmentPreview && previewAttachment ? previewAttachment.file.name : isAttachmentsOpen ? `Attachments · ${activeLead?.name}` : activeLead?.name}</h2>}</div><button className="icon-button" aria-label="Close dialog" onClick={closeDialog}><X size={18} /></button></div>
            {dialog === "new-lead" ? (
              <form className="lead-form" onSubmit={createLead}>
                <label className="field-wide">Client name <input name="name" required placeholder="Company or client name" autoFocus /></label>
                <label className="field-wide">Company website <input name="companyUrl" type="url" pattern="https?://.+" title="Enter a URL beginning with http:// or https://" placeholder="https://company.com" /></label>
                <label>Client executive <input name="contact" placeholder="Contact person" /></label>
                <label>Executive email <input name="contactEmail" type="email" placeholder="name@company.com" /></label>
                <label>Executive phone <input name="contactPhone" type="tel" placeholder="+1 (555) 123-4567" /></label>
                <label>Lead status <select name="status" defaultValue="Cold Lead">{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>Lead type <select name="type" defaultValue="Cold Call"><option>Cold Call</option><option>Cold Email</option><option>Road Trip</option></select></label>
                <label>City <input name="city" placeholder="Toronto" /></label>
                <label>Industry <input name="industry" placeholder="e.g. Healthcare" /></label>
                <label>First contact date <input name="firstContact" type="date" /></label>
                <label>Follow-up date <input name="followUp" type="date" /></label>
                <div className="form-note"><ShieldCheck size={14} /> You’ll be set as the lead owner. Historical first-contact dates may need Admin approval.</div>
                <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="button button-primary"><Plus size={15} /> Save lead</button></div>
              </form>
            ) : activeLead && isAttachmentsOpen ? (
              <div className="attachment-dialog-content">
                {attachmentPreview && previewAttachment ? (
                  <section className="attachment-preview">
                    <div className="attachment-preview-toolbar">
                      <button className="button button-outline button-small" onClick={closeAttachmentPreview}><ArrowLeft size={14} /> All attachments</button>
                      <span>{previewAttachment.category === "Other" ? previewAttachment.specifiedName : previewAttachment.category}{previewAttachment.category === "Agreement" ? ` · v${previewAttachment.version}` : ""}</span>
                      <div className="attachment-preview-navigation">
                        <button className="icon-button" aria-label="Previous attachment" disabled={attachments.filter((attachment) => attachment.leadId === activeLead.id).findIndex((attachment) => attachment.id === previewAttachment.id) === 0} onClick={() => navigateAttachmentPreview(-1)}><ArrowLeft size={15} /></button>
                        <span>{attachments.filter((attachment) => attachment.leadId === activeLead.id).findIndex((attachment) => attachment.id === previewAttachment.id) + 1} of {attachments.filter((attachment) => attachment.leadId === activeLead.id).length}</span>
                        <button className="icon-button" aria-label="Next attachment" disabled={attachments.filter((attachment) => attachment.leadId === activeLead.id).findIndex((attachment) => attachment.id === previewAttachment.id) === attachments.filter((attachment) => attachment.leadId === activeLead.id).length - 1} onClick={() => navigateAttachmentPreview(1)}><ArrowRight size={15} /></button>
                      </div>
                    </div>
                    <div className="attachment-preview-canvas">
                      {previewAttachment.file.type.startsWith("image/") || previewAttachment.file.type === "application/pdf" || previewAttachment.file.type === "text/plain" ? (
                        <iframe className="attachment-preview-frame" src={attachmentPreview.url} title={`Preview of ${previewAttachment.file.name}`} />
                      ) : previewAttachment.file.name.toLowerCase().endsWith(".docx") ? (
                        docxPreview?.attachmentId === previewAttachment.id ? (
                          docxPreview.error ? <p className="attachment-preview-message">Preview failed: {docxPreview.error}</p> :
                            <pre className="docx-preview-text">{docxPreview.text || "This document contains no readable text."}</pre>
                        ) : <p className="attachment-preview-message">Loading document preview…</p>
                      ) : (
                        <div className="attachment-preview-message"><FileText size={30} /><strong>Preview isn’t available for this file type.</strong><span>Download the attachment to view it.</span><a className="button button-primary button-small" href={attachmentPreview.url} download={previewAttachment.file.name}>Download {previewAttachment.file.name}</a></div>
                      )}
                    </div>
                  </section>
                ) : (
                  <section className="lead-attachments">
                  <div className="attachments-heading"><div><h3>Attachments</h3><p>Add a JD, resume, agreement, or another document.</p></div><span>{attachments.filter((attachment) => attachment.leadId === activeLead.id).length}</span></div>
                  <form className="attachment-form" onSubmit={addAttachment}>
                    <label>Attachment name
                      <select name="attachmentCategory" value={attachmentCategory} onChange={(event) => {
                        const category = event.target.value;
                        if (category === "JD" || category === "Resume" || category === "Agreement" || category === "Other") setAttachmentCategory(category);
                      }}>
                        <option value="JD">JD</option>
                        <option value="Resume">Resume</option>
                        <option value="Agreement">Agreement (with revisions / versions)</option>
                        <option value="Other">Other — please specify</option>
                      </select>
                    </label>
                    {attachmentCategory === "Other" && <label>Specify attachment name<input name="specifiedName" required placeholder="Enter attachment name" /></label>}
                    <label className="attachment-file-field">Choose file<input name="attachmentFile" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.txt" /></label>
                    <button className="button button-outline" type="submit"><Paperclip size={14} /> Add attachment</button>
                  </form>
                  <div className="attachment-list">
                    {attachments.filter((attachment) => attachment.leadId === activeLead.id).map((attachment) => (
                      <div className="attachment-row" key={attachment.id}>
                        <span className="attachment-file-icon"><FileText size={15} /></span>
                        <button type="button" className="attachment-file-info attachment-preview-trigger" onClick={() => openAttachmentPreview(attachment)} aria-label={`Preview ${attachment.file.name}`}><strong>{attachment.file.name}</strong><small>{attachment.category === "Other" ? attachment.specifiedName : attachment.category}</small></button>
                        {attachment.category === "Agreement" && <span className="attachment-version">v{attachment.version}</span>}
                      </div>
                    ))}
                    {attachments.every((attachment) => attachment.leadId !== activeLead.id) && <p className="no-attachments">No attachments yet.</p>}
                  </div>
                  </section>
                )}
                {!attachmentPreview && <div className="modal-actions attachment-dialog-actions"><button className="button button-outline" onClick={() => setIsAttachmentsOpen(false)}><ArrowLeft size={14} /> Back to lead overview</button></div>}
              </div>
            ) : activeLead && isNotesOpen ? (
              <div className="lead-notes-dialog">
                <section className="lead-notes-history" aria-label="Previous notes">
                  <div className="notes-section-heading"><h3>Previous notes</h3><span>{leadNotes.filter((note) => note.leadId === activeLead.id).length}</span></div>
                  {[...leadNotes.filter((note) => note.leadId === activeLead.id)]
                    .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
                    .map((note) => (
                      <article className="lead-note-entry" key={note.id}>
                        <span className="note-author-avatar">{note.author.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
                        <div className="lead-note-body">
                          <div className="lead-note-meta"><strong>{note.author}</strong><time dateTime={note.createdAt}>{formatNoteDateTime(note.createdAt)}</time></div>
                          <p>{note.content}</p>
                        </div>
                      </article>
                    ))}
                  {leadNotes.every((note) => note.leadId !== activeLead.id) && <p className="empty-notes">No notes yet. Add the first note below.</p>}
                </section>
                <form className="add-note-form" onSubmit={createLeadNote}>
                  <label htmlFor="new-lead-note">Add a new note</label>
                  <textarea id="new-lead-note" name="note" rows={4} required placeholder="Write an interaction note..." />
                  <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setIsNotesOpen(false)}>Back to lead overview</button><button type="submit" className="button button-primary"><Plus size={15} /> Add note</button></div>
                </form>
              </div>
            ) : activeLead && isFollowUpComposerOpen ? (
              <form className="lead-form follow-up-form" onSubmit={createFollowUp}>
                <p className="follow-up-intro">Set the next step for <strong>{activeLead.name}</strong>. You’ll find this reminder in Tasks &amp; reminders.</p>
                <label>Follow-up date <input name="dueDate" type="date" min={localDateISO()} defaultValue={localDateISO(1)} required autoFocus /></label>
                <label>Follow-up time <input name="dueTime" type="time" defaultValue="09:00" required /></label>
                <label className="field-wide">Follow-up notes <textarea name="notes" rows={4} required placeholder="What needs to happen during this follow-up?" /></label>
                <div className="form-note"><CalendarCheck2 size={14} /> The date and time will be added to the lead and your task reminders.</div>
                <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setIsFollowUpComposerOpen(false)}>Cancel</button><button type="submit" className="button button-primary"><CalendarCheck2 size={15} /> Schedule follow-up</button></div>
              </form>
            ) : activeLead && (
              <div className="lead-detail-content">
                <div className="detail-summary"><span className={`avatar avatar-${activeLead.color}`}>{activeLead.initials}</span><div><label className={`status-pill status-${statusClassName(activeLead.status)} status-select-pill`}><i /><select aria-label="Update lead status" value={activeLead.status} onChange={(event) => { const status = leadStatuses.find((option) => option === event.target.value); if (status) updateLeadStatus(status); }}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={12} /></label><p>{activeLead.industry} <span>·</span> {activeLead.city}</p></div><button className="button button-outline button-small" onClick={() => setUsersDialogMode("transfer")}><UserRound size={14} /> Transfer</button></div>
                <div className="detail-grid"><div><small>CLIENT EXECUTIVE</small><strong className="client-executive-name">{activeLead.contact}</strong></div><div><small>EXECUTIVE EMAIL</small>{activeLead.contactEmail ? <a href={`mailto:${activeLead.contactEmail}`}>{activeLead.contactEmail}</a> : <strong className="detail-missing">Not provided</strong>}</div><div><small>EXECUTIVE PHONE</small>{activeLead.contactPhone ? <a href={`tel:${activeLead.contactPhone}`}>{activeLead.contactPhone}</a> : <strong className="detail-missing">Not provided</strong>}</div><div><small>LEAD OWNER</small><strong>{activeLead.owner === "You" ? `${currentUser?.firstName} ${currentUser?.lastName}` : activeLead.owner}</strong></div><form className="detail-action-editor" onSubmit={updateLeadAction}><label htmlFor="lead-last-action">LAST ACTION</label><select id="lead-last-action" name="action" value={leadActionSelection} onChange={(event) => setLeadActionSelection(event.target.value)}>{leadActionOptions.map((action) => <option key={action} value={action}>{action}</option>)}</select>{leadActionSelection === "Others ( Please specify )" && <input name="customAction" value={customLeadAction} onChange={(event) => setCustomLeadAction(event.target.value)} required aria-label="Specify last action" placeholder="Please specify" /> }<button className="button button-outline button-small" type="submit">Save action</button></form><div><small>NEXT FOLLOW-UP</small><strong>{formatLeadFollowUp(activeLead.followUp)}</strong></div></div>
                <div className="detail-ai"><Sparkles size={16} /><div><strong>Interaction summary</strong><p>Recent {activeLead.action.toLowerCase()} with {activeLead.contact}. Keep the conversation moving with a timely follow-up.</p></div></div>
                <div className="detail-timeline"><h3>Recent activity</h3>{followUps.filter((followUp) => followUp.leadId === activeLead.id).map((followUp) => <div className="timeline-item" key={followUp.id}><span className="timeline-dot"><CalendarCheck2 size={13} /></span><div><strong>Follow-up scheduled · {formatFollowUpDateTime(followUp.dueDate, followUp.dueTime)}</strong><small>Sarah Lee · {followUp.notes}</small></div></div>)}<div className="timeline-item"><span className="timeline-dot"><Phone size={13} /></span><div><strong>{activeLead.action}</strong><small>Sarah Lee · {activeLead.lastActivity}</small></div></div><div className="timeline-item"><span className="timeline-dot timeline-purple"><MessageSquare size={13} /></span><div><strong>Lead added to pipeline</strong><small>Sarah Lee · Oct 10, 2026</small></div></div></div>
                <div className="modal-actions lead-overview-actions"><button className="button button-outline attachments-open-button" onClick={() => setIsAttachmentsOpen(true)}><Paperclip size={14} /> Attachments <span>{attachments.filter((attachment) => attachment.leadId === activeLead.id).length}</span></button><div><button className="button button-outline" onClick={() => setIsNotesOpen(true)}><MessageSquare size={15} /> Add Notes</button><button className="button button-primary" onClick={() => setIsFollowUpComposerOpen(true)}><CalendarCheck2 size={15} /> Create follow-up</button></div></div>
              </div>
            )}
          </section>
        </div>
      )}
      {usersDialogMode && (
        <UserDirectoryDialog
          mode={usersDialogMode}
          onClose={() => setUsersDialogMode(null)}
          onTransfer={transferLeadToUser}
          onNotify={notify}
        />
      )}
      {toast && <div className="toast-message"><Check size={16} />{toast}</div>}
    </div>
  );
}

function MetricCard({ icon, label, value, change, comparison, series, tone, progress, onClick }: { icon: ReactNode; label: string; value: string; change: string; comparison: string; series: string; tone: string; progress?: number; onClick: () => void }) {
  return (
    <button className={`metric-card metric-${tone}`} onClick={onClick} aria-label={`View ${label} activity`}>
      <div className="metric-top"><span className={`metric-icon icon-${tone}`}>{icon}</span><span className="metric-change"><ArrowUpRight size={13} />{change}</span></div>
      <span className="metric-label">{label}</span><div className="metric-value-row"><strong>{value}</strong>{progress !== undefined && <span className="metric-progress-label">{comparison}</span>}</div>
      {progress !== undefined ? <div className="progress-track"><i style={{ width: `${progress}%` }} /></div> : <span className="metric-comparison">{comparison}</span>}
      {progress === undefined && <svg className="metric-sparkline" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><path d={series} /></svg>}
    </button>
  );
}

function SmallStat({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return <div className="small-stat"><div className="small-stat-top"><span>{label}</span><span className="small-stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>;
}

function TaskColumn({ title, count, tone, tasks, onComplete }: { title: string; count: string; tone: string; tasks: string[][]; onComplete: () => void }) {
  return <section className="panel task-column"><div className="task-column-heading"><h2><i className={`task-dot task-${tone}`} />{title}</h2><span>{count}</span></div>{tasks.map(([titleText, details, priority]) => <article className="task-card" key={titleText}><button className="task-checkbox" aria-label={`Complete ${titleText}`} onClick={onComplete}><Check size={13} /></button><div className="task-card-content"><strong>{titleText}</strong><small>{details}</small><span className={`priority priority-${priority.toLowerCase()}`}>{priority} priority</span></div><button className="row-more" aria-label="Task actions" onClick={() => onComplete()}><MoreHorizontal size={17} /></button></article>)}</section>;
}

function RouteStop({ time, company, address, status, color, lunch }: { time: string; company: string; address: string; status: string; color: string; lunch?: boolean }) {
  return <div className={`route-stop ${lunch ? "lunch-stop" : ""}`}><div className="route-time">{time}</div><div className={`route-point point-${color}`}>{lunch ? <span>☕</span> : <MapPin size={14} />}</div><div className="route-stop-info"><strong>{company}</strong><small>{address}</small></div><span className="route-status">{status}</span><button className="row-more" aria-label={`Options for ${company}`}><MoreHorizontal size={17} /></button></div>;
}
