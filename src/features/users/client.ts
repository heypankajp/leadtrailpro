import type { CreateUserInput, UserAccount } from "./model";

type UserResponse = { error?: string; user?: UserAccount; users?: UserAccount[] };

export async function fetchUsers(managementKey: string, mode: "manage" | "transfer"): Promise<UserAccount[]> {
  const response = await fetch(`/api/users?mode=${mode}`, {
    cache: "no-store",
    headers: managementKey ? { "X-User-Management-Key": managementKey } : undefined,
    credentials: "same-origin",
  });
  const result = await response.json() as UserResponse;
  if (!response.ok) throw new Error(result.error || "Could not load users.");
  if (!Array.isArray(result.users)) throw new Error("The users API returned an invalid response.");
  return result.users;
}

export async function createUserAccount(input: CreateUserInput, managementKey: string): Promise<UserAccount> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(managementKey ? { "X-User-Management-Key": managementKey } : {}),
    },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const result = await response.json() as UserResponse;
  if (!response.ok || !result.user) throw new Error(result.error || "Could not create user.");
  return result.user;
}
