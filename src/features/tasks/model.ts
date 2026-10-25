import { parseMessageInput, type Mention, type MessageAttachment } from "@/features/messages/model";

export const taskPriorities = ["low", "normal", "medium", "high"] as const;
export type TaskPriority = (typeof taskPriorities)[number];
export const taskStatuses = ["open", "done"] as const;
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
  creatorId: number;
  creatorName: string;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  checklist: ChecklistItem[];
  completedAt: string | null;
  /** Live comments on the task (TASK-04). */
  commentCount: number;
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
};

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
  if (body.leadId !== undefined && body.leadId !== null && body.leadId !== "" && optionalId(body.leadId) === null) errors.push("Lead is not valid.");
  if (body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== "" && optionalId(body.assigneeId) === null) errors.push("Assignee is not valid.");
  const priority = isPriority(body.priority) ? body.priority : "normal";
  return {
    input: {
      leadId: optionalId(body.leadId), title, description, assigneeId: optionalId(body.assigneeId),
      dueAt: parseDueAt(body.dueAt, errors), priority, checklist: parseChecklist(body.checklist, errors),
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
  if (has("priority")) { if (isPriority(body.priority)) changes.priority = body.priority; else errors.push("Priority is not valid."); }
  if (has("checklist")) changes.checklist = parseChecklist(body.checklist, errors);
  if (has("status")) { if (body.status === "open" || body.status === "done") changes.status = body.status; else errors.push("Status is not valid."); }
  return { changes, errors };
}
