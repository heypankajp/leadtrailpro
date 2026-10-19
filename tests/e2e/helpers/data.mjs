// Test data and API shortcuts shared by the end-to-end suite.
import { baseUrl } from "./ui.mjs";

/** Short unique suffix so names stay distinct when the suite runs against a reused database. */
export const runId = Date.now().toString(36).slice(-5);

export const managementKey = process.env.E2E_USER_MANAGEMENT_KEY || "e2e-user-management-key";

/** The first administrator. Fixed credentials: every suite signs in with them. */
export const admin = {
  firstName: "Ada", lastName: "Admin", name: "Ada Admin", email: "ada.admin@example.com", phone: "+1 416 555 0100",
  password: "AdminPassw0rd!2026", altPassword: "AdminPassw0rd!2027",
};

export const manager = {
  firstName: "Sam", lastName: "Seller", name: "Sam Seller", email: `sam.seller.${runId}@example.com`, phone: "+1 416 555 0101",
  password: "ManagerPassw0rd!2026",
};

/** YYYY-MM-DD for today plus an offset in days (UTC). */
export function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/** Value for a datetime-local input. */
export const localDateTime = (offsetDays, hhmm) => `${isoDate(offsetDays)}T${hhmm}`;

/** Creates the first administrator through the bootstrap API when the database is still empty. */
export async function ensureAdmin() {
  const session = await fetch(`${baseUrl}/api/auth/session`).then((response) => response.json());
  if (!session.needsSetup) return;
  const response = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl, "X-User-Management-Key": managementKey },
    body: JSON.stringify({
      firstName: admin.firstName, lastName: admin.lastName, email: admin.email, phone: admin.phone, password: admin.password,
      role: "admin", stage: "full_productive", extraPrivileges: [], twoFactorEnabled: false, autoLogoutEnabled: false, targetTemplateId: null,
    }),
  });
  // 403 means another suite created the account in the meantime.
  if (!response.ok && response.status !== 403) throw new Error(`Could not create the first administrator: ${response.status} ${await response.text()}`);
}
