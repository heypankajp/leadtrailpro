import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { HttpError } from "@/lib/http";
import { createMapsMeter, mapsApiKey } from "@/features/maps/repository";
import { mapPlacesSearch, placesFieldMask } from "@/features/trips/providers/google";
import { cityInAddress, contactPageLinks, countryOfFormattedAddress, extractWebsiteDetails, normalizeWebsite, pickPlace, type WebsiteDetails } from "./websiteDetails";
import { isPrivateAddress, readWithin, ReadTimeout } from "./websiteGuards";

/**
 * Add company → Website → Fetch (request of November 19, 2026): the server visits the company's website and reads its
 * name, industry, city and address (`websiteDetails.ts`). When the home page gives no address, its contact (or location,
 * or about) page is read too.
 *
 * The visit is made from the server, so it is guarded: http(s) only, ports 80 and 443, and the address the name resolves
 * to must be a public one: checked at connection time (no private, loopback or link-local network, also after a
 * redirect). Pages are cut at 2 MB and 8 seconds; at most 4 redirects; each page is read within 2 seconds. The address and
 * time checks live in `websiteGuards.ts`.
 */

const maxBytes = 2 * 1024 * 1024;
const timeoutMs = 8000;
const maxRedirects = 4;
const userAgent = "Mozilla/5.0 (compatible; LeadTrailPro company lookup)";

/** DNS lookup that refuses names resolving to a private address, used by the connection itself (no rebinding gap). */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) { callback(error, "", 4); return; }
    const list = (addresses as unknown as LookupAddress[]) ?? [];
    const blocked = list.find((item) => isPrivateAddress(item.address));
    if (!list.length || blocked) { callback(Object.assign(new Error("private address"), { code: "EPRIVATE" }), "", 4); return; }
    if ((options as { all?: boolean }).all) (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, list);
    else callback(null, list[0].address, list[0].family);
  });
};

type Page = { url: string; html: string };

function getOnce(url: URL): Promise<{ status: number; location: string | null; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
      reject(new HttpError(400, "That address is not a public website.")); return;
    }
    if (url.port && url.port !== "80" && url.port !== "443") { reject(new HttpError(400, "Only websites on the usual ports can be read.")); return; }
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(url, {
      method: "GET", lookup: publicLookup, timeout: timeoutMs,
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-CA,en;q=0.9" },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = typeof response.headers.location === "string" ? response.headers.location : null;
      const contentType = String(response.headers["content-type"] ?? "");
      if (status >= 300 && status < 400) { response.resume(); resolve({ status, location, contentType, body: "" }); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes)))); response.destroy(); return; }
        chunks.push(chunk);
      });
      const finish = () => resolve({ status, location, contentType, body: Buffer.concat(chunks).toString("utf8") });
      response.on("end", finish);
      response.on("close", finish);
      response.on("error", reject);
    });
    const deadline = setTimeout(() => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), timeoutMs);
    request.on("close", () => clearTimeout(deadline));
    request.on("timeout", () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    request.on("error", reject);
    request.end();
  });
}

/** Reads one page, following redirects; throws an HttpError the dialog can show. */
async function fetchPage(start: URL): Promise<Page> {
  let url = start;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let response;
    try {
      response = await getOnce(url);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const code = (error as { code?: string }).code;
      if (code === "EPRIVATE") throw new HttpError(400, "That address is not a public website.");
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") throw new HttpError(400, `${url.hostname} could not be found. Check the website address.`);
      if (code === "ETIMEDOUT") throw new HttpError(504, `${url.hostname} did not answer in time.`);
      throw new HttpError(502, `${url.hostname} could not be reached.`);
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      const next = new URL(response.location, url);
      if (!/^https?:$/.test(next.protocol)) throw new HttpError(400, "The website sent us to an address that is not a web page.");
      url = next;
      continue;
    }
    if (response.status >= 400) throw new HttpError(502, `${url.hostname} answered with an error (${response.status}).`);
    if (response.contentType && !/html|xml/i.test(response.contentType)) throw new HttpError(400, "That address is not a web page.");
    return { url: url.href, html: response.body };
  }
  throw new HttpError(502, "The website redirected too many times.");
}

/** Visits the website and returns what it says about the company. */
export async function lookupCompanyWebsite(value: string): Promise<WebsiteDetails> {
  const start = normalizeWebsite(value);
  if (!start) throw new HttpError(400, "Enter the company's website, e.g. https://company.com.");
  const home = await fetchPage(start);
  // Each page is read within 2 seconds (websiteGuards.ts): a malformed page cannot hold up the server.
  let details: WebsiteDetails;
  let linked: string[];
  try {
    ({ details, linked } = readWithin(() => ({ details: extractWebsiteDetails(home.html, home.url), linked: contactPageLinks(home.html, home.url) })));
  } catch (error) {
    if (error instanceof ReadTimeout) throw new HttpError(422, `${new URL(home.url).hostname}'s page could not be read: it is too large or malformed. Fill in the details by hand.`);
    throw error;
  }
  if (details.address) details.addressSource = "website";
  // No address on the home page: its Contact us page, then its locations / offices and about pages (up to four pages),
  // and the usual /contact-us addresses when the home page links none. Stops at the first address, within 20 seconds.
  if (!details.address) {
    const base = new URL(home.url);
    const usual = linked.some((link) => /contact/i.test(link)) ? [] : ["/contact-us", "/contact", "/contactus"].map((path) => new URL(path, base).href);
    const candidates = [...new Set([...linked.slice(0, 3), ...usual])].slice(0, 4);
    const deadline = Date.now() + 20_000;
    for (const link of candidates) {
      if (Date.now() > deadline) break;
      try {
        const page = await fetchPage(new URL(link));
        const more = readWithin(() => extractWebsiteDetails(page.html, page.url));
        if (more.address) { details.address = more.address; details.city = more.city; details.country = more.country || details.country; details.addressSource = "website"; break; }
      } catch { /* the home page's details are kept */ }
    }
  }
  // Still no address: Google Maps, when a key is set (the trip planner's MAPS_API_KEY).
  if (!details.address) {
    const place = await googleAddress(details.name, details.website).catch((error: unknown) => {
      console.error("Company lookup: Google Maps search failed.", error instanceof Error ? error.message : error);
      return null;
    });
    if (place) {
      details.address = place.address;
      details.city = cityInAddress(place.address) || details.city;
      details.country = countryOfFormattedAddress(place.address) || details.country;
      details.addressSource = "google";
    }
  }
  return details;
}

/**
 * The company's address on Google Maps (Places Text Search, the name searched): the place whose website is the company's,
 * or one with the company's exact name. One call, counted against the "Places text search" budget of Settings → Google
 * Maps like the planner's own; nothing is called with TRIPS_PROVIDER=stub, without a key or when the budget is spent.
 */
async function googleAddress(name: string, website: string): Promise<{ address: string } | null> {
  const { key } = mapsApiKey();
  if (!key || !name || (process.env.TRIPS_PROVIDER || "").trim().toLowerCase() === "stub") return null;
  const meter = createMapsMeter();
  if ((await meter.remaining("places_text_search")).remaining < 1) return null;
  let failed = false;
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": placesFieldMask },
      body: JSON.stringify({ textQuery: name, pageSize: 5, languageCode: "en" }),
    });
    if (!response.ok) { failed = true; throw new Error(`Places search failed (${response.status}).`); }
    const { places } = mapPlacesSearch((await response.json()) as Record<string, unknown>);
    const place = pickPlace(places.map((item) => ({ name: item.name, address: item.address, website: item.website })), website, name);
    return place?.address ? { address: place.address } : null;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await meter.record("places_text_search", 1, failed).catch(() => undefined);
  }
}
