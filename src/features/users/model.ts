export const userRoles = ["Administrator", "Sales Manager", "Sales Representative"] as const;

export const userPrivileges = [
  { id: "view_leads", label: "View leads" },
  { id: "create_leads", label: "Create leads" },
  { id: "edit_leads", label: "Edit leads" },
  { id: "transfer_leads", label: "Transfer leads" },
  { id: "archive_leads", label: "Archive and restore leads" },
  { id: "manage_users", label: "Manage users" },
  { id: "view_reports", label: "View reports" },
  { id: "manage_settings", label: "Manage settings" },
] as const;

export type UserRole = (typeof userRoles)[number];
export type UserPrivilege = (typeof userPrivileges)[number]["id"];

export type UserAccount = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  privileges: UserPrivilege[];
  active: boolean;
};

export type CreateUserInput = Omit<UserAccount, "id" | "active"> & { password: string };

export function parseCreateUser(value: unknown): CreateUserInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.firstName !== "string" || !body.firstName.trim() || body.firstName.length > 80) return null;
  if (typeof body.lastName !== "string" || !body.lastName.trim() || body.lastName.length > 80) return null;
  if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254) return null;
  if (typeof body.phone !== "string" || body.phone.length > 40) return null;
  if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 200) return null;
  if (typeof body.role !== "string" || !userRoles.includes(body.role as UserRole)) return null;
  if (!Array.isArray(body.privileges) || !body.privileges.every((privilege) =>
    typeof privilege === "string" && userPrivileges.some((option) => option.id === privilege)
  )) return null;

  return {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone.trim(),
    role: body.role as UserRole,
    privileges: [...new Set(body.privileges)] as UserPrivilege[],
    password: body.password,
  };
}
