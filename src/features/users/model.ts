import { isValidTimeOfDay } from "@/lib/dates";

export const systemRoles = ["admin", "sales_manager", "recruiter"] as const;
export type SystemRole = (typeof systemRoles)[number];

export const defaultRoleLabels: Record<SystemRole, string> = {
  admin: "Admin",
  sales_manager: "Sales Manager",
  recruiter: "Recruiter",
};

export const userStages = ["onboarding", "training", "full_productive"] as const;
export type UserStage = (typeof userStages)[number];
export const stageLabels: Record<UserStage, string> = {
  onboarding: "Onboarding",
  training: "Training",
  full_productive: "Full Productive",
};

export const userPrivileges = [
  { id: "view_leads", label: "View leads" },
  { id: "create_leads", label: "Create leads" },
  { id: "edit_leads", label: "Edit own leads" },
  { id: "edit_any_lead", label: "Edit any lead" },
  { id: "transfer_leads", label: "Transfer own leads" },
  { id: "reassign_leads", label: "Reassign any lead" },
  { id: "archive_leads", label: "Archive and restore leads" },
  { id: "review_queued", label: "Approve or reject queued leads" },
  { id: "add_notes", label: "Add interaction notes" },
  { id: "log_activities", label: "Log calls, emails and visits" },
  { id: "manage_tasks", label: "Create and update tasks" },
  { id: "upload_files", label: "Upload documents and profiles" },
  { id: "delete_files", label: "Remove files" },
  { id: "view_reports", label: "View own reports" },
  { id: "view_team_reports", label: "View team reports" },
  { id: "manage_users", label: "Manage users" },
  { id: "manage_values", label: "Manage list of values" },
  { id: "manage_targets", label: "Manage targets and templates" },
  { id: "manage_settings", label: "Manage settings" },
  { id: "view_audit", label: "View audit history" },
] as const;

export type UserPrivilege = (typeof userPrivileges)[number]["id"];
export const allPrivileges = userPrivileges.map((privilege) => privilege.id) as UserPrivilege[];

export const rolePrivileges: Record<SystemRole, UserPrivilege[]> = {
  admin: allPrivileges,
  sales_manager: [
    "view_leads", "create_leads", "edit_leads", "transfer_leads", "add_notes", "log_activities",
    "manage_tasks", "upload_files", "view_reports",
  ],
  recruiter: ["view_leads", "add_notes"],
};

export function isPrivilege(value: unknown): value is UserPrivilege {
  return typeof value === "string" && allPrivileges.includes(value as UserPrivilege);
}

export function isSystemRole(value: unknown): value is SystemRole {
  return typeof value === "string" && systemRoles.includes(value as SystemRole);
}

export function isUserStage(value: unknown): value is UserStage {
  return typeof value === "string" && userStages.includes(value as UserStage);
}

export function hasPrivilege(user: { privileges: UserPrivilege[] }, privilege: UserPrivilege): boolean {
  return user.privileges.includes(privilege);
}

export function effectivePrivileges(role: SystemRole, extras: UserPrivilege[]): UserPrivilege[] {
  return [...new Set([...rolePrivileges[role], ...extras])];
}

export type UserAccount = {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  role: SystemRole;
  stage: UserStage;
  /** Grants beyond the role defaults (for example a recruiter allowed to create leads). */
  extraPrivileges: UserPrivilege[];
  /** Effective privileges: role defaults plus extras. */
  privileges: UserPrivilege[];
  active: boolean;
  terminatedAt: string | null;
  twoFactorEnabled: boolean;
  autoLogoutEnabled: boolean;
  /** Daily sign-out time (`HH:MM` in the business timezone) applied when autoLogoutEnabled is on. */
  autoLogoutTime: string;
  targetTemplateId: number | null;
  createdAt: string;
};

export const defaultAutoLogoutTime = "23:00";

/** Compact user for owner and assignee selectors. */
export type UserSummary = { id: number; name: string; role: SystemRole; active: boolean };

export type CreateUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: SystemRole;
  stage: UserStage;
  extraPrivileges: UserPrivilege[];
  twoFactorEnabled: boolean;
  autoLogoutEnabled: boolean;
  autoLogoutTime: string;
  targetTemplateId: number | null;
};

export type UpdateUserInput = Partial<Omit<CreateUserInput, "password">> & { active?: boolean };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && emailPattern.test(value) && value.length <= 254;
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 200;
}

const optionalId = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

export function parseCreateUser(value: unknown): CreateUserInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.firstName !== "string" || !body.firstName.trim() || body.firstName.length > 80) return null;
  if (typeof body.lastName !== "string" || !body.lastName.trim() || body.lastName.length > 80) return null;
  if (!isValidEmail(body.email)) return null;
  if (body.phone !== undefined && (typeof body.phone !== "string" || body.phone.length > 40)) return null;
  if (!isValidPassword(body.password)) return null;
  if (!isSystemRole(body.role)) return null;
  if (body.stage !== undefined && !isUserStage(body.stage)) return null;
  if (body.autoLogoutTime !== undefined && !isValidTimeOfDay(body.autoLogoutTime)) return null;
  const extras = body.extraPrivileges ?? body.privileges ?? [];
  if (!Array.isArray(extras) || !extras.every(isPrivilege)) return null;
  const targetTemplateId = optionalId(body.targetTemplateId);
  if (targetTemplateId === undefined && body.targetTemplateId !== undefined) return null;

  return {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    email: body.email.trim().toLowerCase(),
    phone: typeof body.phone === "string" ? body.phone.trim() : "",
    password: body.password,
    role: body.role,
    stage: isUserStage(body.stage) ? body.stage : "onboarding",
    extraPrivileges: [...new Set(extras as UserPrivilege[])],
    twoFactorEnabled: body.twoFactorEnabled === true,
    autoLogoutEnabled: body.autoLogoutEnabled === true,
    autoLogoutTime: isValidTimeOfDay(body.autoLogoutTime) ? body.autoLogoutTime : defaultAutoLogoutTime,
    targetTemplateId: targetTemplateId ?? null,
  };
}

export function parseUpdateUser(value: unknown): UpdateUserInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const input: UpdateUserInput = {};
  if (body.firstName !== undefined) {
    if (typeof body.firstName !== "string" || !body.firstName.trim() || body.firstName.length > 80) return null;
    input.firstName = body.firstName.trim();
  }
  if (body.lastName !== undefined) {
    if (typeof body.lastName !== "string" || !body.lastName.trim() || body.lastName.length > 80) return null;
    input.lastName = body.lastName.trim();
  }
  if (body.email !== undefined) {
    if (!isValidEmail(body.email)) return null;
    input.email = body.email.trim().toLowerCase();
  }
  if (body.phone !== undefined) {
    if (typeof body.phone !== "string" || body.phone.length > 40) return null;
    input.phone = body.phone.trim();
  }
  if (body.role !== undefined) {
    if (!isSystemRole(body.role)) return null;
    input.role = body.role;
  }
  if (body.stage !== undefined) {
    if (!isUserStage(body.stage)) return null;
    input.stage = body.stage;
  }
  if (body.extraPrivileges !== undefined) {
    if (!Array.isArray(body.extraPrivileges) || !body.extraPrivileges.every(isPrivilege)) return null;
    input.extraPrivileges = [...new Set(body.extraPrivileges as UserPrivilege[])];
  }
  if (body.twoFactorEnabled !== undefined) {
    if (typeof body.twoFactorEnabled !== "boolean") return null;
    input.twoFactorEnabled = body.twoFactorEnabled;
  }
  if (body.autoLogoutEnabled !== undefined) {
    if (typeof body.autoLogoutEnabled !== "boolean") return null;
    input.autoLogoutEnabled = body.autoLogoutEnabled;
  }
  if (body.autoLogoutTime !== undefined) {
    if (!isValidTimeOfDay(body.autoLogoutTime)) return null;
    input.autoLogoutTime = body.autoLogoutTime;
  }
  if (body.targetTemplateId !== undefined) {
    const id = optionalId(body.targetTemplateId);
    if (id === undefined) return null;
    input.targetTemplateId = id;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return null;
    input.active = body.active;
  }
  return input;
}
