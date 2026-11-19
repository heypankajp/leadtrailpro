/**
 * Company details read from a website's HTML (request of November 19, 2026): Add company → Website → Fetch. Pure functions,
 * no network: `websiteLookup.ts` fetches the pages. What a page says about itself is read in this order:
 *  - schema.org JSON-LD (Organization, LocalBusiness and their kinds): name, address, the kind of business;
 *  - microdata (itemprop="streetAddress" ...) and the <address> element;
 *  - Open Graph / meta tags and the <title> for the name and the description;
 *  - a street address written in the text (a number, a street, a province or state and a postal or ZIP code).
 * The industry is the schema.org kind when it names one, otherwise the one whose words the title and description use most.
 */

export type WebsiteDetails = {
  website: string;
  name: string;
  industry: string;
  address: string;
  /** The city or town of the address, when the page names it apart (JSON-LD addressLocality) or it can be read from the address. */
  city: string;
  /** The country the company is in (full name, e.g. "Canada", "United States"); empty when the page does not tell. */
  country: string;
  description: string;
  /** Where the address came from: the website's pages, or Google Maps when the website gave none. */
  addressSource?: "website" | "google";
};

/** A company Google Maps knows (Places Text Search): its name, formatted address and website. */
export type MapsPlace = { name: string; address: string; website: string };

const bareHost = (value: string): string => {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
};

/** Whether two web addresses are the same site (one host the other's subdomain counts: careers.acme.ca and acme.ca). */
export function sameSite(a: string, b: string): boolean {
  const one = bareHost(a);
  const two = bareHost(b);
  return Boolean(one && two) && (one === two || one.endsWith(`.${two}`) || two.endsWith(`.${one}`));
}

/**
 * The Google Maps place that is the company: the one whose website is the company's site; otherwise, among the first
 * three, one whose name is the company's name (letters only compared). None when nothing fits, so a namesake is not taken.
 */
export function pickPlace(places: MapsPlace[], website: string, name: string): MapsPlace | null {
  const bySite = places.find((place) => place.website && sameSite(place.website, website));
  if (bySite) return bySite;
  const squash = (value: string) => value.toLowerCase().replace(/\b(inc|ltd|llc|llp|corp|corporation|limited|co|company)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  const wanted = squash(name);
  if (wanted.length < 3) return null;
  return places.slice(0, 3).find((place) => { const found = squash(place.name); return found === wanted || (found.startsWith(wanted) && wanted.length >= 5); }) ?? null;
}

/** The country at the end of a Google formatted address ("..., Toronto, ON M5H 4C7, Canada"). */
export function countryOfFormattedAddress(address: string): string {
  const last = address.split(",").pop()?.trim() ?? "";
  return last && !/\d/.test(last) ? countryName(last) : countryOfAddress(address);
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', middot: "·", bull: "•", copy: "©", reg: "®", trade: "™", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ocirc: "ô" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : whole;
    }
    return entities[code.toLowerCase()] ?? whole;
  });
}

const clean = (value: unknown, max = 300): string =>
  typeof value === "string" ? decodeEntities(value).replace(/\s+/g, " ").trim().slice(0, max) : "";

/** The text of an HTML fragment: no scripts, styles or tags, one space between words. */
export function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, ", ")
      .replace(/<\/(p|div|li|span|td|h\d)>/gi, " \n ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/[ \t\r\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** The attributes of one tag, keys lowercased. */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return result;
}

/** <meta name|property="..." content="...">, the first of the keys given that has a value. */
export function metaContent(html: string, ...keys: string[]): string {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  for (const key of keys) {
    const found = metas.find((meta) => (meta.property ?? meta.name ?? meta.itemprop ?? "").toLowerCase() === key.toLowerCase() && meta.content?.trim());
    if (found) return clean(found.content);
  }
  return "";
}

/** Every JSON-LD object of the page, @graph and arrays flattened. */
export function jsonLdObjects(html: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    result.push(object);
    if (object["@graph"]) visit(object["@graph"]);
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch { /* a broken block is skipped */ }
  }
  return result;
}

const typesOf = (object: Record<string, unknown>): string[] =>
  (Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]]).filter((item): item is string => typeof item === "string");

/** schema.org kinds of business and the industry each names. */
const schemaIndustries: [RegExp, string][] = [
  [/^(MedicalBusiness|MedicalOrganization|MedicalClinic|Hospital|Dentist|Physician|Pharmacy|Optician|DiagnosticLab|VeterinaryCare|HealthAndBeautyBusiness)$/, "Healthcare"],
  [/^(LegalService|Attorney|Notary)$/, "Legal Services"],
  [/^(FinancialService|BankOrCreditUnion|AccountingService|AutomatedTeller)$/, "Financial Services"],
  [/^InsuranceAgency$/, "Insurance"],
  [/^RealEstateAgent$/, "Real Estate"],
  [/^(FoodEstablishment|Restaurant|Bakery|BarOrPub|CafeOrCoffeeShop|FastFoodRestaurant|Brewery|Winery|Distillery|IceCreamShop)$/, "Food & Beverage"],
  [/^(LodgingBusiness|Hotel|Motel|Resort|BedAndBreakfast|Hostel)$/, "Hospitality"],
  [/^(EducationalOrganization|School|CollegeOrUniversity|HighSchool|ElementarySchool|Preschool|MiddleSchool)$/, "Education"],
  [/^(AutomotiveBusiness|AutoDealer|AutoRepair|AutoPartsStore|AutoBodyShop|AutoRental)$/, "Automotive"],
  [/^(HomeAndConstructionBusiness|GeneralContractor|Electrician|Plumber|HVACBusiness|RoofingContractor|HousePainter|Locksmith)$/, "Construction"],
  [/^(Store|ClothingStore|DepartmentStore|ElectronicsStore|FurnitureStore|GroceryStore|HardwareStore|HomeGoodsStore|ShoppingCenter|OnlineStore)$/, "Retail"],
  [/^(TravelAgency|TouristInformationCenter)$/, "Travel"],
  [/^(GovernmentOrganization|GovernmentOffice)$/, "Government"],
  [/^(NGO|NonprofitOrganization)$/, "Non-profit"],
  [/^EmploymentAgency$/, "Staffing & Recruiting"],
  [/^(SportsOrganization|SportsActivityLocation|ExerciseGym|HealthClub)$/, "Sports & Fitness"],
  [/^(EntertainmentBusiness|MovieTheater|PerformingArtsTheater)$/, "Entertainment"],
];

/** Industries and the words that point to them, for pages that do not say what kind of business they are. */
const keywordIndustries: [string, string[]][] = [
  ["Technology", ["software", "saas", "cloud", "it services", "managed services", "cybersecurity", "artificial intelligence", "machine learning", "platform", "app development", "web development", "digital transformation", "technology", "tech"]],
  ["Staffing & Recruiting", ["staffing", "recruitment", "recruiting", "recruiter", "talent acquisition", "placement agency", "temp agency", "workforce solutions", "executive search", "hiring"]],
  ["Healthcare", ["healthcare", "health care", "hospital", "clinic", "medical", "patients", "pharmaceutical", "pharmacy", "dental", "physiotherapy", "home care", "long-term care", "nursing"]],
  ["Manufacturing", ["manufacturing", "manufacturer", "fabrication", "machining", "production facility", "industrial", "assembly", "plastics", "metal", "packaging", "oem"]],
  ["Construction", ["construction", "contractor", "builder", "renovation", "roofing", "plumbing", "hvac", "electrical contractor", "excavation", "general contractor", "homes"]],
  ["Logistics & Transportation", ["logistics", "trucking", "freight", "transportation", "shipping", "warehousing", "warehouse", "distribution", "supply chain", "courier", "3pl"]],
  ["Financial Services", ["financial", "finance", "bank", "banking", "investment", "wealth management", "accounting", "bookkeeping", "tax", "mortgage", "credit union", "cpa"]],
  ["Insurance", ["insurance", "insurer", "broker", "underwriting", "claims"]],
  ["Real Estate", ["real estate", "realty", "realtor", "property management", "properties", "brokerage", "condos", "leasing"]],
  ["Legal Services", ["law firm", "lawyer", "lawyers", "legal", "attorney", "litigation", "barrister", "solicitor", "paralegal"]],
  ["Education", ["education", "school", "college", "university", "training", "learning", "courses", "academy", "tutoring", "students"]],
  ["Retail", ["retail", "store", "shop", "boutique", "e-commerce", "ecommerce", "online store", "outlet"]],
  ["Food & Beverage", ["restaurant", "food", "catering", "bakery", "brewery", "winery", "beverage", "cafe", "coffee", "kitchen", "dining"]],
  ["Hospitality", ["hotel", "resort", "hospitality", "inn", "lodging", "accommodation", "events venue"]],
  ["Marketing & Advertising", ["marketing", "advertising", "branding", "seo", "agency", "social media", "public relations", "creative agency", "media buying"]],
  ["Consulting", ["consulting", "consultants", "consultancy", "advisory", "management consulting", "strategy"]],
  ["Energy & Utilities", ["energy", "solar", "utilities", "oil and gas", "renewable", "power generation", "electricity", "wind"]],
  ["Automotive", ["automotive", "dealership", "auto repair", "car dealer", "collision", "vehicles", "auto parts"]],
  ["Telecommunications", ["telecommunications", "telecom", "internet service", "wireless", "fibre", "fiber", "broadband"]],
  ["Agriculture", ["agriculture", "farm", "farming", "agri", "greenhouse", "crops", "livestock"]],
  ["Non-profit", ["non-profit", "nonprofit", "charity", "foundation", "donate", "volunteer"]],
  ["Government", ["government", "municipality", "city of", "township", "ministry", "public service"]],
];

/** The industry the schema.org kinds name, or the one whose words the text uses most (none when no word appears). */
export function guessIndustry(types: string[], text: string): string {
  for (const type of types) {
    const found = schemaIndustries.find(([pattern]) => pattern.test(type));
    if (found) return found[1];
  }
  const lower = ` ${text.toLowerCase()} `;
  let best = "";
  let bestScore = 0;
  for (const [industry, words] of keywordIndustries) {
    let score = 0;
    for (const word of words) {
      const pattern = new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "g");
      // A word counts more when it is a phrase (two words) than a common single word.
      score += (lower.match(pattern)?.length ?? 0) * (word.includes(" ") ? 2 : 1);
    }
    if (score > bestScore) { best = industry; bestScore = score; }
  }
  return best;
}

type AddressParts = { street: string; locality: string; region: string; postalCode: string; country: string };

function addressFromJsonLd(value: unknown): AddressParts | string | null {
  if (!value) return null;
  if (Array.isArray(value)) return addressFromJsonLd(value[0]);
  if (typeof value === "string") return clean(value);
  if (typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const country = object.addressCountry && typeof object.addressCountry === "object" ? (object.addressCountry as Record<string, unknown>).name : object.addressCountry;
  const parts = { street: clean(object.streetAddress), locality: clean(object.addressLocality), region: clean(object.addressRegion), postalCode: clean(object.postalCode), country: clean(country) };
  return parts.street || parts.locality ? parts : null;
}

const joinAddress = (parts: AddressParts): string =>
  [parts.street, parts.locality, [parts.region, parts.postalCode].filter(Boolean).join(" "), parts.country].filter(Boolean).join(", ");

function addressFromMicrodata(html: string): AddressParts | null {
  const read = (prop: string) => {
    const match = html.match(new RegExp(`<[^>]*itemprop\\s*=\\s*["']${prop}["'][^>]*>([\\s\\S]*?)<\\/`, "i"));
    if (!match) return "";
    const content = attributes(match[0]).content;
    return clean(content ?? htmlText(match[1]));
  };
  const parts = { street: read("streetAddress"), locality: read("addressLocality"), region: read("addressRegion"), postalCode: read("postalCode"), country: read("addressCountry") };
  return parts.street ? parts : null;
}

const streetTypes = "Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Parkway|Pkwy|Court|Ct|Crescent|Cres|Place|Pl|Highway|Hwy|Line|Sideroad|Concession|Circle|Cir|Trail|Tr|Square|Sq|Terrace|Gate|Unit|Suite";
const regions = "ON|Ontario|QC|Quebec|Québec|BC|British Columbia|AB|Alberta|MB|Manitoba|SK|Saskatchewan|NS|Nova Scotia|NB|New Brunswick|NL|Newfoundland and Labrador|PE|PEI|Prince Edward Island|YT|NT|NU|[A-Z]{2}";
const postal = "[A-Z]\\d[A-Z][ -]?\\d[A-Z]\\d|\\d{5}(?:-\\d{4})?";

/**
 * A street address written in the text: a civic number, the street (with a word such as Street, Ave, Rd or Unit), then the
 * town, the province or state and the postal or ZIP code, e.g. "200 Bay Street, Suite 1200, Toronto, ON M5J 2J2".
 */
export function addressInText(text: string): string {
  const pattern = new RegExp(`\\b\\d{1,6}[A-Za-z]?(?:-\\d{1,6})?\\s+(?:[A-Za-zÀ-ÿ0-9.'#-]+\\s+){0,6}?(?:${streetTypes})\\b\\.?[^\\n]{0,90}?\\b(?:${regions})\\b\\.?,?\\s+(?:${postal})\\b`, "g");
  // Without a postal code: "32575 Simon Avenue, Abbotsford, British Columbia" (the town and the province after commas).
  const withoutPostal = new RegExp(`\\b\\d{1,6}[A-Za-z]?(?:-\\d{1,6})?\\s+(?:[A-Za-zÀ-ÿ0-9.'#-]+\\s+){0,6}?(?:${streetTypes})\\b\\.?(?:[ ,]+(?:Suite|Unit|Floor|PO Box|P\\.O\\. Box|#)\\s*[\\w-]+)?,\\s*[A-Za-zÀ-ÿ .'-]{2,40},\\s*(?:${namedRegions})\\b`, "g");
  // An address near "Head office" or "Headquarters" is the company's own; other addresses on the page may be branches.
  const head = text.search(/head\s*office|headquarter|corporate office|main office|siège social/i);
  const windows = head >= 0 ? [text.slice(head, head + 600), text] : [text];
  for (const candidate of [pattern, withoutPostal]) {
    for (const part of windows) {
      for (const match of part.matchAll(candidate)) {
        const found = match[0].replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
        if (found.length <= 200) return found;
      }
    }
  }
  return "";
}

/** Provinces and states written out or as their postal abbreviations, for addresses without a postal code. */
const namedRegions = "Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland and Labrador|Prince Edward Island|Yukon|Northwest Territories|Nunavut|ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

/** The text inside the page's scripts, JSON escapes undone (offices that a page keeps as data rather than HTML). */
export function scriptText(html: string): string {
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n");
  const unescaped = scripts
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&").replace(/\\u0027/gi, "'")
    .replace(/\\[rnt]/g, "\n").replace(/\\\//g, "/").replace(/\\"/g, '"');
  // Script data is not removed as a <script> here: its own text is what is read.
  return htmlText(unescaped.replace(/<(script|style)\b/gi, "<x-$1").replace(/["{}[\]]/g, "\n"));
}

/** An address given to a Google Maps link or embed (?q=, ?query=, ?daddr= or /maps/place/...), not bare coordinates. */
export function mapsAddress(html: string): string {
  for (const match of html.matchAll(/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps)[^"'\s<>]*/gi)) {
    const link = decodeEntities(match[0]);
    const value = link.match(/[?&](?:q|query|daddr|destination)=([^&#]+)/i)?.[1] ?? link.match(/\/maps\/place\/([^/@?]+)/i)?.[1] ?? "";
    let address = "";
    try { address = decodeURIComponent(value.replace(/\+/g, " ")).replace(/\s+/g, " ").trim(); } catch { continue; }
    if (address && /\d/.test(address) && /[a-z]{3}/i.test(address) && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(address) && address.length <= 200) return address;
  }
  return "";
}

const countryNames = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; }
})();

/** A country as written on a page (a code such as CA or USA, or a name) as its English name. */
export function countryName(value: string): string {
  const trimmed = value.trim().replace(/\.$/, "");
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase().replace(/\./g, "");
  if (upper === "USA" || upper === "US" || upper === "UNITED STATES OF AMERICA") return "United States";
  if (upper === "UK" || upper === "GB") return "United Kingdom";
  if (upper === "CAN") return "Canada";
  if (/^[A-Z]{2}$/.test(upper)) {
    try { const name = countryNames?.of(upper); if (name && name !== upper) return name; } catch { /* not a region code */ }
  }
  return trimmed.length <= 60 ? trimmed : "";
}

const canadianRegions = /\b(ON|Ontario|QC|Quebec|Québec|BC|British Columbia|AB|Alberta|MB|Manitoba|SK|Saskatchewan|NS|Nova Scotia|NB|New Brunswick|NL|Newfoundland and Labrador|PE|PEI|Prince Edward Island|YT|Yukon|NT|Northwest Territories|NU|Nunavut)\b/;

/** The country an address is in, from its last part, its postal or ZIP code, or its province. */
export function countryOfAddress(address: string): string {
  if (!address) return "";
  const last = address.split(",").pop()?.trim() ?? "";
  // A country written at the end ("..., USA", "..., United Kingdom"); two letters there are a state or province, not a country.
  if (/^(U\.?S\.?A\.?|United States( of America)?)$/i.test(last)) return "United States";
  if (/^(Canada|United Kingdom|England|Scotland|Wales|Ireland|Mexico|India|Australia|New Zealand|Germany|France|Netherlands|Spain|Italy|Philippines|Singapore|China|Japan|Brazil|South Africa|United Arab Emirates|Pakistan|Poland)$/i.test(last)) {
    return /^(England|Scotland|Wales)$/i.test(last) ? "United Kingdom" : last.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  if (/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/.test(address)) return "Canada";
  if (/\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(address)) return "United States";
  if (canadianRegions.test(address)) return "Canada";
  return "";
}

/** Domain endings that are country codes in name only, used by companies anywhere. */
const genericCountryDomains = new Set(["io", "co", "ai", "me", "tv", "cc", "ly", "fm", "gg", "to", "app", "dev", "ws", "so", "sh", "is", "la", "am", "vc", "gl", "xyz"]);

/** The country of a website's domain (.ca → Canada, .co.uk → United Kingdom); empty for .com and the like. */
export function countryOfDomain(hostname: string): string {
  const tld = hostname.toLowerCase().split(".").pop() ?? "";
  if (tld === "uk") return "United Kingdom";
  if (tld.length !== 2 || genericCountryDomains.has(tld)) return "";
  return countryName(tld.toUpperCase());
}

/** The town of an address of the form "..., Toronto, ON M5J 2J2" (the part before the province or state). */
export function cityInAddress(address: string): string {
  const match = address.match(new RegExp(`(?:^|,)\\s*([A-Za-zÀ-ÿ .'-]{2,40}?)\\s*,?\\s+(?:${regions})\\b\\.?,?\\s+(?:${postal})\\b`));
  return match ? match[1].trim() : "";
}

const genericTitle = /^(home|homepage|home page|welcome|official site|official website|index|main|accueil)$/i;

/** The name the page gives itself: JSON-LD, then og:site_name, then the part of the <title> that is not "Home". */
function pageName(html: string, url: URL, organizations: Record<string, unknown>[]): string {
  for (const object of organizations) {
    const name = clean(object.name, 200) || clean(object.legalName, 200);
    if (name) return name;
  }
  const site = metaContent(html, "og:site_name", "application-name", "apple-mobile-web-app-title");
  if (site) return site.slice(0, 200);
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 300);
  const host = url.hostname.replace(/^www\./, "");
  const root = host.split(".")[0];
  if (title) {
    const pieces = title.split(/\s+[|–—·:•-]\s+|\s*[|–—·•]\s*/).map((piece) => piece.trim()).filter((piece) => piece && !genericTitle.test(piece));
    const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchesDomain = (piece: string) => Boolean(squash(piece)) && (root.includes(squash(piece)) || squash(piece).includes(root));
    const byDomain = pieces.find(matchesDomain);
    if (byDomain) return byDomain.slice(0, 200);
    // A title that does not name the company and reads like a tagline ("Full-Time Jobs, Temp Jobs, Staffing..."): the
    // logo's alt text or an SVG title that does, else the domain.
    if (pieces[0] && (pieces[0].split(/\s+/).length > 4 || /,/.test(pieces[0]))) {
      const logos = [...html.matchAll(/<(?:img\b[^>]*\balt\s*=\s*["']([^"']{2,80})["']|title\b[^>]*>([^<]{2,80})<\/title)/gi)].map((match) => clean(match[1] ?? match[2]));
      const logo = logos.find((value) => value && !genericTitle.test(value) && matchesDomain(value.replace(/\s*(logo|home)\s*$/i, "")));
      if (logo) {
        const name = logo.replace(/\s*(logo|home)\s*$/i, "");
        return (name === name.toLowerCase() ? name[0].toUpperCase() + name.slice(1) : name).slice(0, 200);
      }
    } else if (pieces[0]) {
      return pieces[0].slice(0, 200);
    }
  }
  return root ? root[0].toUpperCase() + root.slice(1) : "";
}

const organizationType = /Organization|Corporation|Business|LocalBusiness|Company|Store|Service|Agency|Clinic|Hospital|Restaurant|Hotel|School|College|University|Dealer|Contractor|Attorney|Dentist|Physician|NGO/i;

/** Everything the page says about the company; empty strings for what it does not say. */
export function extractWebsiteDetails(html: string, pageUrl: string): WebsiteDetails {
  const url = new URL(pageUrl);
  const objects = jsonLdObjects(html);
  const organizations = objects.filter((object) => typesOf(object).some((type) => organizationType.test(type)) && type0IsNotPage(object));
  const types = organizations.flatMap(typesOf);

  let address = "";
  let city = "";
  let country = "";
  for (const object of [...organizations, ...objects]) {
    const found = addressFromJsonLd(object.address) ?? addressFromJsonLd((object.location as Record<string, unknown> | undefined)?.address);
    if (!found) continue;
    if (typeof found === "string") { address = found; } else { address = joinAddress(found); city = found.locality; country = countryName(found.country); }
    if (address) break;
  }
  if (!address) {
    const micro = addressFromMicrodata(html);
    if (micro) { address = joinAddress(micro); city = micro.locality; country = countryName(micro.country); }
  }
  const text = htmlText(html);
  if (!address) {
    const tag = html.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i);
    const fromTag = tag ? htmlText(tag[1]).replace(/\n/g, ", ").replace(/(,\s*)+/g, ", ").replace(/^,\s*|,\s*$/g, "") : "";
    address = (fromTag && addressInText(fromTag)) || addressInText(text) || (fromTag.length <= 200 && /\d/.test(fromTag) ? fromTag : "");
  }
  // Pages that keep their offices in script data (JSON in the page) or point to them on Google Maps.
  if (!address) address = addressInText(scriptText(html)) || mapsAddress(html);
  if (address && !city) city = cityInAddress(address);
  // The country: the address's own, else what the address shows (postal / ZIP code, province), else the domain's.
  if (!country) country = countryOfAddress(address) || countryOfDomain(url.hostname);

  const description = metaContent(html, "description", "og:description", "twitter:description")
    || clean(organizations.map((object) => object.description).find((value) => typeof value === "string"), 500);
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const keywords = metaContent(html, "keywords");
  const headings = [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) => htmlText(match[1])).join(" ");
  const industry = clean(organizations.map((object) => object.industry).find((value) => typeof value === "string"), 120)
    || guessIndustry(types, [title, description, keywords, headings].join(" "));

  return { website: `${url.protocol}//${url.host}`, name: pageName(html, url, organizations), industry, address: address.slice(0, 500), city, country, description: description.slice(0, 500) };
}

/** A WebPage / WebSite object is not the company even if its type list mentions one. */
function type0IsNotPage(object: Record<string, unknown>): boolean {
  return !typesOf(object).some((type) => /^(WebPage|WebSite|BreadcrumbList|ImageObject|SearchAction|AboutPage|ContactPage)$/.test(type));
}

/** Links on the page to its contact, about or location pages on the same site, best first. */
export function contactPageLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./, "");
  const scored: { href: string; score: number }[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attributes(`<a ${match[1]}>`).href;
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let target: URL;
    try { target = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(target.protocol) || target.hostname.replace(/^www\./, "") !== host) continue;
    const label = `${target.pathname} ${htmlText(match[2])}`.toLowerCase();
    const score = /contact/.test(label) ? 3 : /location|find us|visit us|office/.test(label) ? 2 : /about/.test(label) ? 1 : 0;
    target.hash = "";
    if (score && !scored.some((item) => item.href === target.href)) scored.push({ href: target.href, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((item) => item.href);
}

/** The URL typed, with https:// added when no scheme is given; null when it is not a web address. */
export function normalizeWebsite(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
