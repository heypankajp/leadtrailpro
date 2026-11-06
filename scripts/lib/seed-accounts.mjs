/**
 * Parser for seed/accounts.csv, the accounts that may sign in (scripts/seed-users.mjs). Pure, so the unit tests load it.
 *   email,first_name,last_name,role[,stage]
 * Header row required (any column order); `#` starts a comment; blank lines are ignored; cells are split on commas.
 */
export const seedRoles = ["admin", "sales_manager", "recruiter"];
export const seedStages = ["onboarding", "training", "full_productive"];
export const defaultSeedStage = "full_productive";
const columns = ["email", "first_name", "last_name", "role", "stage"];
const required = columns.slice(0, 4);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleAliases = { admin: "admin", administrator: "admin", sales_manager: "sales_manager", salesmanager: "sales_manager", recruiter: "recruiter" };
const headerHint = "email,first_name,last_name,role[,stage]";

const key = (value) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Returns `{ accounts, errors }`; `errors` are "line N: reason" strings and mean nothing should be written. */
export function parseAccounts(text) {
  const accounts = [];
  const errors = [];
  const seen = new Set();
  let header = null;
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const number = index + 1;
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(",").map((cell) => cell.trim());
    if (!header) {
      const names = cells.map(key);
      const unknown = names.filter((name) => !columns.includes(name));
      const missing = required.filter((name) => !names.includes(name));
      if (unknown.length || missing.length) {
        const detail = [unknown.length ? `unknown column ${unknown.join(", ")}` : "", missing.length ? `missing ${missing.join(", ")}` : ""].filter(Boolean).join("; ");
        return { accounts: [], errors: [`line ${number}: the first line must be the header ${headerHint} (${detail})`] };
      }
      header = names;
      continue;
    }
    const row = Object.fromEntries(header.map((name, position) => [name, cells[position] ?? ""]));
    const email = row.email.toLowerCase();
    const firstName = row.first_name;
    const lastName = row.last_name;
    const role = roleAliases[key(row.role)];
    const stage = row.stage ? key(row.stage) : defaultSeedStage;
    const problems = [];
    if (!emailPattern.test(email) || email.length > 254) problems.push("email is not valid");
    if (!firstName) problems.push("first_name is empty");
    if (firstName.length > 80 || lastName.length > 80) problems.push("names are limited to 80 characters");
    if (!role) problems.push(`role must be one of ${seedRoles.join(", ")}`);
    if (!seedStages.includes(stage)) problems.push(`stage must be one of ${seedStages.join(", ")}`);
    if (seen.has(email)) problems.push("email appears more than once");
    if (problems.length) {
      errors.push(`line ${number}: ${problems.join("; ")}`);
      continue;
    }
    seen.add(email);
    accounts.push({ email, firstName, lastName, role, stage });
  }
  if (!header) errors.push(`the file has no header line (${headerHint})`);
  return { accounts, errors };
}
