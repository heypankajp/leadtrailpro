import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { getDatabasePool } from "@/lib/db";
import { userPrivileges } from "./model";
import type { CreateUserInput, UserAccount, UserPrivilege } from "./model";

const scrypt = promisify(scryptCallback);

export async function listUsers(): Promise<UserAccount[]> {
  const [rows] = await getDatabasePool().query(
    `SELECT id, first_name AS firstName, last_name AS lastName, email, phone, role, privileges, is_active AS active
     FROM users ORDER BY first_name, last_name`,
  );
  return (rows as (Omit<UserAccount, "privileges" | "active"> & {
    privileges: string[] | string;
    active: number | boolean;
  })[]).map((row) => {
    const parsedPrivileges: unknown = typeof row.privileges === "string" ? JSON.parse(row.privileges) : row.privileges;
    const privileges = Array.isArray(parsedPrivileges)
      ? parsedPrivileges.filter((value): value is UserPrivilege =>
          typeof value === "string" && userPrivileges.some((privilege) => privilege.id === value)
        )
      : [];
    return { ...row, privileges, active: Boolean(row.active) };
  });
}

export async function createUser(input: CreateUserInput): Promise<UserAccount> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(input.password, salt, 64) as Buffer;
  const passwordHash = `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
  const [result] = await getDatabasePool().execute(
    `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, privileges)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      passwordHash,
      input.role,
      JSON.stringify(input.privileges),
    ],
  );
  const id = Number((result as { insertId: number | bigint }).insertId);
  return {
    id,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    privileges: input.privileges,
    active: true,
  };
}
