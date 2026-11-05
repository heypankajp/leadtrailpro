/**
 * Checks MAPS_API_KEY with the trip planner's own Google adapter: geocodes an address, searches companies around it,
 * and asks for driving minutes. Three Google calls (Geocoding, Places API (New) text search, Routes API route matrix).
 *
 *   npm run maps:test -- "1 Dundas St W, Toronto"                 # geocode, then search within 20 driving minutes
 *   npm run maps:test -- "1 Dundas St W, Toronto" --km 10         # straight-line radius instead (no Routes call)
 *   npm run maps:test -- --at 43.656,-79.380                      # skip geocoding, search from coordinates
 *
 * The project behind the key must have the Geocoding API, Places API (New), and Routes API enabled; a refusal names
 * the missing one. Needs the source tree (dev container or laptop), not the production image.
 */
import { createGoogleProvider } from "../src/features/trips/providers/google.ts";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index === -1 ? null : args[index + 1] ?? ""; };
const address = args.filter((arg, index) => !arg.startsWith("--") && !["--at", "--km", "--minutes"].includes(args[index - 1]))[0] ?? null;
const at = option("--at");
const km = option("--km");
const minutes = option("--minutes");
const key = process.env.MAPS_API_KEY?.trim();

if (!key) {
  console.error("MAPS_API_KEY is empty in .env.local. Create a key in Google Cloud (APIs & Services → Credentials) with the Geocoding API, Places API (New), and Routes API enabled, paste it, and run again.");
  process.exit(1);
}
if (!address && !at) {
  console.error('Usage: npm run maps:test -- "<address>" [--km 10 | --minutes 20]   or   npm run maps:test -- --at <lat>,<lng>');
  process.exit(1);
}

const provider = createGoogleProvider({ mapsKey: key });
let origin;
try {
  if (at) {
    const [latitude, longitude] = at.split(",").map(Number);
    origin = { latitude, longitude };
    console.log(`Origin: ${latitude}, ${longitude} (given)`);
  } else {
    console.log(`Geocoding "${address}"…`);
    origin = await provider.geocode(address);
    if (!origin) { console.error("Geocoding returned no result for that address."); process.exit(1); }
    console.log(`Origin: ${origin.latitude}, ${origin.longitude}`);
  }
  const radiusType = km ? "km" : "minutes";
  const radius = km ? Number(km) : Number(minutes || 20);
  console.log(`Searching companies within ${radius} ${radiusType === "km" ? "km" : "driving minutes"} (one Places text search page, ${radiusType === "minutes" ? "then one route matrix call" : "no Routes call"})…`);
  const companies = await provider.searchCompanies({ origin, radiusType, radius, businessType: null, limit: 5 });
  console.log(`${companies.length} compan${companies.length === 1 ? "y" : "ies"} kept:`);
  for (const company of companies) {
    console.log(`  ${company.name} · ${company.address || "no address"} · ${company.distanceKm} km${company.driveMinutes !== null ? ` · ${company.driveMinutes} min` : ""}${company.website ? ` · ${company.website}` : ""}${company.phone ? ` · ${company.phone}` : ""}`);
  }
  console.log("Maps check passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  if (/has not been used in project|is not enabled|SERVICE_DISABLED|PERMISSION_DENIED/i.test(message)) console.error("Enable the named API on the Cloud project (APIs & Services → Library) and wait a minute.");
  else if (/API key not valid|provided API key is invalid|REQUEST_DENIED/i.test(message)) console.error("The key is wrong, restricted to other APIs, or restricted to other referrers/IPs; check it under APIs & Services → Credentials.");
  process.exitCode = 1;
}
