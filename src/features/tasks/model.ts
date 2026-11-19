import { parseMessageInput, type Mention, type MessageAttachment } from "@/features/messages/model";

export const taskPriorities = ["low", "normal", "medium", "high"] as const;
export type TaskPriority = (typeof taskPriorities)[number];
export const taskStatuses = ["open", "done"] as const;
/**
 * PD-29: what the activity is, as in Pipedrive's Schedule an activity. Since November 18, 2026 Pipedrive's six types,
 * in its order (Call, Meeting, Task, Deadline, Email, Lunch), and Visit, which the app had already (sales trips, visits).
 */
export const taskActivityTypes = ["call", "meeting", "task", "deadline", "email", "lunch", "visit"] as const;
export type TaskActivityType = (typeof taskActivityTypes)[number];
export const taskActivityLabels: Record<TaskActivityType, string> = {
  call: "Call", meeting: "Meeting", task: "Task", deadline: "Deadline", email: "Email", lunch: "Lunch", visit: "Visit",
};
/** How a title starts for each type in Schedule an activity ("Call Elena Vasquez", "Lunch with Elena Vasquez"). */
export const taskTitleWords: Record<TaskActivityType, string> = {
  call: "Call", meeting: "Meeting with", task: "Follow up with", deadline: "Deadline:", email: "Email", lunch: "Lunch with", visit: "Visit",
};
export type TaskStatus = (typeof taskStatuses)[number];

export type ChecklistItem = { text: string; done: boolean };

/** A comment on a task (TASK-04): rich text, @mentions, references to the lead's files (COLL-06), own edits, Admin removal. */
export type TaskComment = {
  id: number;
  taskId: number;
  authorId: number;
  authorName: string;
  authorRole: string;
  /** Empty once the comment is removed. */
  body: string;
  mentions: Mention[];
  attachments: MessageAttachment[];
  editedAt: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  createdAt: string;
};

export type TaskCommentInput = { body: string; attachmentIds: number[] };

export function parseTaskCommentInput(value: unknown): { input: TaskCommentInput; errors: string[] } {
  const { input, errors } = parseMessageInput(value);
  return { input: { body: input.body, attachmentIds: input.attachmentIds }, errors };
}

export type Task = {
  id: number;
  leadId: number | null;
  leadName: string | null;
  title: string;
  description: string;
  assigneeId: number;
  assigneeName: string;
  /** Everyone assigned, in order (the first is `assigneeId`); request of November 18, 2026. */
  assignees?: { id: number; name: string }[];
  creatorId: number;
  creatorName: string;
  dueAt: string | null;
  /** PD-29: the end of the activity's time slot, when one was given. */
  endsAt: string | null;
  activityType: TaskActivityType;
  priority: TaskPriority;
  status: TaskStatus;
  checklist: ChecklistItem[];
  completedAt: string | null;
  /** Live comments on the task (TASK-04). */
  commentCount: number;
  /** The organization and person the activity is linked to (with or without a deal), or null. */
  organizationId?: number | null;
  personId?: number | null;
  /** Everyone taking part, in order (the first is `personId`). */
  people?: { id: number; name: string }[];
  /** The contact and organization shown with the activity: its own, else its deal's (request of November 18, 2026). */
  contactName?: string | null;
  contactEmail?: string | null;
  /** The yellow note of Schedule an activity (the description is the longer text). */
  note?: string;
  /** Files uploaded on the activity. */
  attachmentCount?: number;
  /** What came of a done activity (List of Values → Activity Outcome), or null. */
  outcomeId?: number | null;
  outcome?: string | null;
  contactPhone?: string | null;
  organization?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  leadId: number | null;
  title: string;
  description: string;
  assigneeId: number | null;
  dueAt: string | null;
  priority: TaskPriority;
  checklist: ChecklistItem[];
  /** PD-29: optional; a task without them is a plain task with no end time. */
  activityType?: TaskActivityType;
  endsAt?: string | null;
  /** PD-29 "Mark as done": the activity is recorded as already done. */
  done?: boolean;
  /** The outcome of a done activity (an `activity_outcome` value), or null. */
  outcomeId?: number | null;
  note?: string;
  /** The organization and the person (a contact of that organization) the activity is linked to. */
  organizationId?: number | null;
  personId?: number | null;
  /** Several people, contacts of the organization, in order; replaces `personId` when given. */
  personIds?: number[];
  /** Several team members, in order; replaces `assigneeId` when given (the first becomes it). */
  assigneeIds?: number[];
};

/** A file uploaded on an activity (request of November 18, 2026). */
export type TaskAttachment = { id: number; taskId: number; fileName: string; mimeType: string; sizeBytes: number; uploadedByName: string | null; createdAt: string };

export const isTaskActivityType = (value: unknown): value is TaskActivityType => typeof value === "string" && taskActivityTypes.includes(value as TaskActivityType);
const isPriority = (value: unknown): value is TaskPriority => typeof value === "string" && taskPriorities.includes(value as TaskPriority);

const parseChecklist = (value: unknown, errors: string[]): ChecklistItem[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) { errors.push("Checklist must be a list."); return []; }
  const items: ChecklistItem[] = [];
  for (const entry of value.slice(0, 30)) {
    if (typeof entry === "string") { if (entry.trim()) items.push({ text: entry.trim().slice(0, 200), done: false }); continue; }
    if (entry && typeof entry === "object" && typeof (entry as ChecklistItem).text === "string") {
      const text = (entry as ChecklistItem).text.trim().slice(0, 200);
      if (text) items.push({ text, done: (entry as ChecklistItem).done === true });
    }
  }
  return items;
};

const parseDueAt = (value: unknown, errors: string[]): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") { errors.push("Due date must be text."); return null; }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) { errors.push("Due date is not a valid date and time."); return null; }
  return date.toISOString();
};

/** A list of ids without duplicates (at most 20), or undefined when none was sent. */
const parseIds = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20);
};

const optionalId = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export function parseTaskInput(value: unknown): { input: TaskInput; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { input: {} as TaskInput, errors: ["Invalid task data."] };
  const body = value as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) errors.push("Title is required.");
  if (title.length > 200) errors.push("Title must be 200 characters or fewer.");
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
  if (body.leadId !== undefined && body.leadId !== null && body.leadId !== "" && optionalId(body.leadId) === null) errors.push("Deal is not valid.");
  if (body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== "" && optionalId(body.assigneeId) === null) errors.push("Assignee is not valid.");
  const priority = isPriority(body.priority) ? body.priority : "normal";
  if (body.activityType !== undefined && !isTaskActivityType(body.activityType)) errors.push("Activity type is not valid.");
  const dueAt = parseDueAt(body.dueAt, errors);
  const endsAt = parseDueAt(body.endsAt, errors);
  if (endsAt && (!dueAt || endsAt <= dueAt)) errors.push("The end time must be after the start.");
  return {
    input: {
      leadId: optionalId(body.leadId), title, description, assigneeId: optionalId(body.assigneeId),
      dueAt, priority, checklist: parseChecklist(body.checklist, errors),
      activityType: isTaskActivityType(body.activityType) ? body.activityType : "task", endsAt, done: body.done === true,
      outcomeId: body.done === true ? optionalId(body.outcomeId) : null,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 5000) : "",
      organizationId: optionalId(body.organizationId), personId: optionalId(body.personId), personIds: parseIds(body.personIds), assigneeIds: parseIds(body.assigneeIds),
    },
    errors,
  };
}

export type TaskPatch = Partial<TaskInput> & { status?: TaskStatus };

export function parseTaskPatch(value: unknown): { changes: TaskPatch; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { changes: {}, errors: ["Invalid task data."] };
  const body = value as Record<string, unknown>;
  const changes: TaskPatch = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  if (has("title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 200) errors.push("Title must be between 1 and 200 characters."); else changes.title = title;
  }
  if (has("description")) changes.description = typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
  if (has("leadId")) changes.leadId = optionalId(body.leadId);
  if (has("assigneeId")) {
    const id = optionalId(body.assigneeId);
    if (!id) errors.push("Assignee is required."); else changes.assigneeId = id;
  }
  if (has("dueAt")) changes.dueAt = parseDueAt(body.dueAt, errors);
  if (has("endsAt")) changes.endsAt = parseDueAt(body.endsAt, errors);
  if (has("activityType")) { if (isTaskActivityType(body.activityType)) changes.activityType = body.activityType; else errors.push("Activity type is not valid."); }
  if (has("priority")) { if (isPriority(body.priority)) changes.priority = body.priority; else errors.push("Priority is not valid."); }
  if (has("checklist")) changes.checklist = parseChecklist(body.checklist, errors);
  if (has("status")) { if (body.status === "open" || body.status === "done") changes.status = body.status; else errors.push("Status is not valid."); }
  if (has("outcomeId")) changes.outcomeId = optionalId(body.outcomeId);
  if (has("organizationId")) changes.organizationId = optionalId(body.organizationId);
  if (has("personId")) changes.personId = optionalId(body.personId);
  if (has("personIds")) changes.personIds = parseIds(body.personIds) ?? [];
  if (has("assigneeIds")) { const ids = parseIds(body.assigneeIds) ?? []; if (!ids.length) errors.push("Assign the activity to someone."); else changes.assigneeIds = ids; }
  if (has("note")) changes.note = typeof body.note === "string" ? body.note.trim().slice(0, 5000) : "";
  return { changes, errors };
}
