/**
 * TRIP-07: match a discovered company against existing leads and clients on website domain, phone number,
 * company name, and address. Pure functions, shared by the server and the unit tests.
 */

const legalSuffixes = new Set(["inc", "incorporated", "ltd", "limited", "llc", "llp", "corp", "corporation", "co", "company", "plc", "gmbh"]);

/** "The Acme Packaging Co., Inc." → "acme packaging" */
export function normalizeCompanyName(name: string): string {
  const words = name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && legalSuffixes.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join(" ");
}

const secondLevelDomains = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.in", "com.br", "co.jp", "co.za", "com.mx", "com.sg"]);

/** "https://www.Example.co.uk/about" → "example.co.uk"; "" when the value is not a URL or host. */
export function registrableDomain(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return "";
  }
  host = host.replace(/^www\./, "");
  if (!host.includes(".")) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  return secondLevelDomains.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** The last ten digits of a phone number, or "" when there are fewer than ten. */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

const streetWords: Record<string, string> = {
  street: "st", road: "rd", avenue: "ave", drive: "dr", boulevard: "blvd", crescent: "cres", court: "ct", lane: "ln", parkway: "pkwy",
  highway: "hwy", place: "pl", square: "sq", trail: "trl", circle: "cir", terrace: "ter", east: "e", west: "w", north: "n", south: "s",
};
const unitWords = new Set(["unit", "suite", "ste", "apt", "apartment", "floor", "fl", "no"]);

/** "225 Rexdale Blvd Unit 3, Etobicoke, ON M9W 1P7" → "225 rexdale blvd": the street number and the two words that follow it. */
export function addressKey(address: string): string {
  const words = address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).map((word) => streetWords[word] ?? word);
  for (let index = 0; index < words.length - 1; index += 1) {
    const previous = words[index - 1] ?? "";
    if (/^\d+[a-z]?$/.test(words[index]) && /^[a-z]/.test(words[index + 1]) && !unitWords.has(previous) && !unitWords.has(words[index + 1])) {
      const rest = words.slice(index + 1, index + 3).filter((word) => !unitWords.has(word));
      return [words[index], ...rest].join(" ");
    }
  }
  return "";
}

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches += 1; break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export type MatchableLead = {
  id: number; clientName: string; companyUrl: string; contactPhone: string; contactAltPhone: string; address: string; city: string | null;
  statusCode: string; status: string; statusLabel: string; recordState: "active" | "queued" | "archived"; lastActivityAt: string;
};
export type CompanyFacts = { name: string; website: string; phone: string; address: string };
export type MatchedOn = "domain" | "phone" | "name_address" | "name" | "similar_name_address";
export type LeadMatch = { lead: MatchableLead; matchedOn: MatchedOn };

const rank: Record<MatchedOn, number> = { domain: 0, phone: 1, name_address: 2, name: 3, similar_name_address: 4 };

/**
 * Precedence: website domain, then phone, then exact name with the same address, then exact name (same city when the
 * lead has one), then a very similar name at the same address. Archived leads count only when nothing else matches;
 * ties go to the most recently active lead.
 */
export function matchLead(company: CompanyFacts, leads: readonly MatchableLead[]): LeadMatch | null {
  const domain = registrableDomain(company.website);
  const phone = phoneKey(company.phone);
  const name = normalizeCompanyName(company.name);
  const address = addressKey(company.address);
  const companyText = company.address.toLowerCase();
  let best: LeadMatch | null = null;
  const better = (candidate: LeadMatch, current: LeadMatch | null) => {
    if (!current) return true;
    const archivedA = candidate.lead.recordState === "archived" ? 1 : 0;
    const archivedB = current.lead.recordState === "archived" ? 1 : 0;
    if (archivedA !== archivedB) return archivedA < archivedB;
    if (rank[candidate.matchedOn] !== rank[current.matchedOn]) return rank[candidate.matchedOn] < rank[current.matchedOn];
    return candidate.lead.lastActivityAt > current.lead.lastActivityAt;
  };
  for (const lead of leads) {
    let matchedOn: MatchedOn | null = null;
    if (domain && registrableDomain(lead.companyUrl) === domain) matchedOn = "domain";
    else if (phone && [lead.contactPhone, lead.contactAltPhone].some((value) => phoneKey(value) === phone)) matchedOn = "phone";
    else if (name) {
      const leadName = normalizeCompanyName(lead.clientName);
      const leadAddress = addressKey(lead.address);
      const sameAddress = Boolean(address && leadAddress && leadAddress === address);
      const cityOk = !lead.city || companyText.includes(lead.city.toLowerCase());
      if (leadName === name && sameAddress) matchedOn = "name_address";
      else if (leadName === name && cityOk) matchedOn = "name";
      else if (sameAddress && leadName && jaroWinkler(name, leadName) >= 0.9) matchedOn = "similar_name_address";
    }
    if (matchedOn) {
      const candidate = { lead, matchedOn };
      if (better(candidate, best)) best = candidate;
    }
  }
  return best;
}

/** The Action column (TRIP-07): the matched lead's status in the change note's wording, or "New / Not in CRM". */
export function actionFor(match: LeadMatch | null): { code: string; label: string } {
  if (!match) return { code: "new", label: "New / Not in CRM" };
  const { lead } = match;
  if (lead.statusCode === "cold" || lead.statusCode === "warm" || lead.statusCode === "hot") return { code: lead.statusCode, label: `${lead.status} Lead` };
  return { code: lead.statusCode, label: lead.statusLabel };
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
