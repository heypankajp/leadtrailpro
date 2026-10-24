/**
 * Pure mapping rules for the legacy tracker import (SPEC §10.9). No database or file access here, so the
 * rules are unit-tested in tests/unit/tracker-mapping.test.mjs and the script stays a thin shell around them.
 */

const legalSuffixes = new Set(["inc", "incorporated", "ltd", "limited", "llc", "llp", "corp", "corporation", "co", "company", "plc", "gmbh", "sa", "srl", "pty", "group"]);

/** Same rules as the trip planner's matching (src/features/trips/matching.ts): one key per company. */
export function normalizeCompanyName(name) {
  const words = String(name ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && legalSuffixes.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join(" ");
}

export const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => clean(value).toLowerCase();

export const titleCase = (value) => clean(value).toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase());

/** Date cell → YYYY-MM-DD. Accepts Date objects (any time zone, within ±12 h of midnight), MMM/DD/YY, DD/MM/YYYY, YYYY-MM-DD. */
export function parseDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const date = new Date(value.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
    return date >= "2000-01-01" && date <= "2100-12-31" ? date : null;
  }
  const text = clean(value).replace(/^[`'"\s]+|[`'"\s]+$/g, "");
  if (!text) return null;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) return ymd(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^([A-Za-z]{3,9})[\/ -](\d{1,2})[\/ -](\d{2,4})$/.exec(text);
  if (match) {
    const month = monthIndex(match[1]);
    if (month) return ymd(fullYear(match[3]), month, Number(match[2]));
  }
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (match) {
    const [, first, second, year] = match;
    // The tracker declares month-first dates (MMM/DD/YY); a numeric date is read month-first unless only day-first fits.
    if (Number(first) > 12 && Number(second) <= 12) return ymd(fullYear(year), Number(second), Number(first));
    return ymd(fullYear(year), Number(first), Number(second));
  }
  return null;
}

const monthIndex = (name) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(name.slice(0, 3).toLowerCase()) + 1;
const fullYear = (year) => (year.length === 2 ? 2000 + Number(year) : Number(year));
function ymd(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

/** "3 .Followup Call" → { step: 3, name: "Followup Call" }; junk such as "Select Type" → null. */
export function parseBdAction(value) {
  const text = clean(value);
  if (!text || /^select type$/i.test(text) || text === ".") return null;
  const match = /^(\d{1,2})\s*[.)]\s*(.+)$/.exec(text);
  const step = match ? Number(match[1]) : null;
  const name = clean(match ? match[2] : text);
  return name ? { step, name } : null;
}

/** Tracker wording → the application's list value (BRD names); anything else is created as written. */
const bdActionTypos = {
  "contract clerification": "Contract Clarification",
  "waiting for profile": "Waiting For Profiles from Recruitment",
  "waiting for profiles": "Waiting For Profiles from Recruitment",
  "engagement / ans question": "Engagement / Ans Questions",
};
const bdActionRenames = { "cold call": "First Call", "cold email": "First Email" };
/** `keepNames` leaves the tracker's "Cold Call" / "Cold Email" as they are instead of the BRD's "First Call" / "First Email". */
export const canonicalBdAction = (name, keepNames = false) => bdActionTypos[lower(name)] ?? (keepNames ? null : bdActionRenames[lower(name)]) ?? clean(name);

/** A client response cell; stage text that leaked into the column ("1 .Cold Call") is not a response. */
export function parseClientResponse(value) {
  const text = clean(value);
  if (!text || /^\d{1,2}\s*[.)]/.test(text)) return null;
  return text;
}

const statusAliases = { cold: "cold", warm: "warm", hot: "hot", client: "client", won: "client", lost: "lost", "lost lead": "lost", disqualified: "disqualified" };
export const parseStatusCode = (value) => statusAliases[lower(value)] ?? null;

export function parseLeadType(value) {
  const text = lower(value).replace(/[_\s]+/g, " ");
  if (!text) return null;
  if (text === "road trip" || text === "roadtrip") return "Road Trip";
  if (text === "office") return "Office";
  return titleCase(text);
}

const emailPattern = /^[^\s@/,;<>()]+@[^\s@/,;<>()]+\.[a-z]{2,}$/i;
export const isEmail = (value) => emailPattern.test(clean(value));

/** Splits an email cell on spaces, slashes, commas, and semicolons; returns valid addresses and the leftover text. */
export function parseEmails(value) {
  const text = clean(value).replace(/\bmailto:/gi, "");
  if (!text) return { emails: [], leftover: "" };
  const emails = [];
  const leftover = [];
  for (const part of text.split(/[\s,;/]+/).filter(Boolean)) {
    const candidate = part.replace(/^[<(]+|[>).]+$/g, "").toLowerCase();
    if (emailPattern.test(candidate)) { if (!emails.includes(candidate)) emails.push(candidate); } else leftover.push(part);
  }
  return { emails, leftover: leftover.join(" ") };
}

const emptyPhone = new Set(["", "n/a", "na", "-", "none", "nil", "no", "x"]);

/** Phone cells hold numbers (5196203900), text, or several numbers separated by "/" or ","; "N/A" is empty. */
export function parsePhones(value) {
  const text = typeof value === "number" ? String(Math.round(value)) : clean(value);
  if (emptyPhone.has(text.toLowerCase())) return [];
  return text.split(/\s*(?:\/|,|;|\bor\b|\band\b)\s*/i).map((part) => part.trim()).filter((part) => part && /\d{3}/.test(part));
}

const streetWords = /\b(st|street|rd|road|ave|avenue|dr|drive|blvd|boulevard|way|crt|court|cres|crescent|lane|ln|pkwy|parkway|unit|suite|hwy|highway|trail|circle|cir|place|pl|sq|square|gate|line|concession|rr)\b/i;
const postalCode = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i;

/** The "Address / Comments" column mixes both: text with a street number and a street word, a postal code, or ", ON" is an address. */
export function looksLikeAddress(value) {
  const text = clean(value);
  if (!text) return false;
  if (postalCode.test(text)) return true;
  if (/\d/.test(text) && streetWords.test(text)) return true;
  return /,\s*(on|ontario)\b/i.test(text) && /\d/.test(text);
}

/** Rows of one company ordered by date then sheet order; the latest non-empty value wins for every field. */
export function latestNonEmpty(rows, pick) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = pick(rows[index]);
    if (value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) return value;
  }
  return null;
}

export const truncate = (value, max) => { const text = clean(value); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };

/** Case-insensitive lookup in a list of { id, value, code } with a normalised key. */
export function findValue(list, value) {
  const key = lower(value);
  if (!key) return null;
  return list.find((item) => lower(item.value) === key) ?? null;
}

const cityAliases = { "st catherines": "St Catharines", "st. catherines": "St Catharines", "st. catharines": "St Catharines", "scarboro": "Scarborough", "missisauga": "Mississauga", "mississuaga": "Mississauga" };

/** "Ottawa, ON" → "Ottawa"; known misspellings corrected; otherwise Title Case. */
export function parseCity(value) {
  const text = clean(value).replace(/(?:\s*,\s*|\s+)(on|ont|ontario|canada)\.?$/i, "").replace(/[.\s]+$/g, "");
  if (!text) return "";
  return cityAliases[text.toLowerCase()] ?? titleCase(text);
}

export const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "value";
