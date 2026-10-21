import { haversineKm } from "../matching";
import type { JobListing } from "../model";
import type { CompanyCandidate, CompanySearchInput, GeoPoint, TripProvider } from "./types";

/**
 * Deterministic sample data for development and the end-to-end suite (`TRIPS_PROVIDER=stub`): a fixed catalogue of
 * companies around Mississauga and Toronto with addresses, websites, phones, and a few job listings each.
 */

type CatalogueEntry = { name: string; address: string; latitude: number; longitude: number; types: string[]; website: string; phone: string; jobs: JobListing[] };

const job = (title: string, location: string, daysAgo: number, employmentType: string | null, source = "Indeed"): JobListing => ({
  title, source, location, employmentType,
  postedAt: new Date(Date.UTC(2026, 9, 20 - daysAgo)).toISOString().slice(0, 10),
  url: `https://jobs.example/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"))}`,
});

const catalogue: CatalogueEntry[] = [
  { name: "Northgate Packaging", address: "1200 Britannia Rd E, Mississauga, ON L4W 1C3", latitude: 43.6305, longitude: -79.6327, types: ["manufacturing"], website: "https://northgatepackaging.example", phone: "905-555-0141",
    jobs: [job("Packaging Line Operator", "Mississauga, ON", 2, "Full-time"), job("Forklift Operator", "Mississauga, ON", 5, "Full-time"), job("Quality Technician", "Mississauga, ON", 9, "Contract")] },
  { name: "Lakeshore Bakery Co.", address: "88 Lakeshore Rd E, Mississauga, ON L5G 1C9", latitude: 43.5598, longitude: -79.5826, types: ["bakery_food_manufacturing"], website: "https://lakeshorebakery.example", phone: "905-555-0118",
    jobs: [job("Production Baker", "Mississauga, ON", 1, "Full-time"), job("Mixer Operator", "Mississauga, ON", 6, "Part-time")] },
  { name: "Dixie Road Distribution", address: "5400 Dixie Rd, Mississauga, ON L4W 1E6", latitude: 43.6422, longitude: -79.6214, types: ["warehouse_distribution"], website: "https://dixiedistribution.example", phone: "905-555-0177",
    jobs: [job("Warehouse Associate", "Mississauga, ON", 3, "Full-time")] },
  { name: "Meadowvale Metal Works", address: "6700 Century Ave, Mississauga, ON L5N 2V8", latitude: 43.5947, longitude: -79.7498, types: ["manufacturing"], website: "https://meadowvalemetal.example", phone: "905-555-0155", jobs: [] },
  { name: "Cedarline Foods", address: "100 Carrier Dr, Etobicoke, ON M9W 5R1", latitude: 43.7156, longitude: -79.6107, types: ["bakery_food_manufacturing", "manufacturing"], website: "https://cedarlinefoods.example", phone: "416-555-0162",
    jobs: [job("Food Production Associate", "Etobicoke, ON", 4, "Full-time"), job("Sanitation Lead", "Etobicoke, ON", 12, "Full-time"), job("Maintenance Technician", "Etobicoke, ON", 15, null), job("Shipping Clerk", "Etobicoke, ON", 18, "Full-time")] },
  { name: "Axiom Industrial", address: "8000 Keele St, Vaughan, ON L4K 2A4", latitude: 43.7959, longitude: -79.5262, types: ["manufacturing"], website: "https://axiom.example", phone: "905-555-0177", jobs: [job("CNC Machinist", "Vaughan, ON", 7, "Full-time")] },
  { name: "Harbourfront Logistics", address: "2300 Finch Ave W, Toronto, ON M9M 2Y3", latitude: 43.7461, longitude: -79.5281, types: ["warehouse_distribution"], website: "https://harbourfrontlogistics.example", phone: "416-555-0199",
    jobs: [job("AZ Driver", "Toronto, ON", 2, "Full-time"), job("Dispatcher", "Toronto, ON", 10, "Full-time")] },
  { name: "Queensway Cold Storage", address: "1140 The Queensway, Etobicoke, ON M8Z 1R1", latitude: 43.6228, longitude: -79.5213, types: ["warehouse_distribution"], website: "", phone: "416-555-0107", jobs: [] },
  { name: "Streetsville Pastry Kitchen", address: "180 Queen St S, Mississauga, ON L5M 1L3", latitude: 43.5804, longitude: -79.7108, types: ["bakery_food_manufacturing"], website: "https://streetsvillepastry.example", phone: "905-555-0133", jobs: [job("Pastry Cook", "Mississauga, ON", 1, "Full-time")] },
  { name: "Pearson Freight Centre", address: "6600 Goreway Dr, Mississauga, ON L4V 1S6", latitude: 43.7064, longitude: -79.6258, types: ["warehouse_distribution"], website: "https://pearsonfreight.example", phone: "905-555-0188", jobs: [job("Material Handler", "Mississauga, ON", 3, "Full-time"), job("Night Shift Supervisor", "Mississauga, ON", 8, "Full-time")] },
  { name: "Vertex Manufacturing", address: "45 Steelwell Rd, Brampton, ON L6T 5P3", latitude: 43.7169, longitude: -79.6764, types: ["manufacturing"], website: "https://vertex.example", phone: "905-555-0164", jobs: [job("Press Brake Operator", "Brampton, ON", 5, "Full-time")] },
  { name: "Bloor West Bagels", address: "2200 Bloor St W, Toronto, ON M6S 1N4", latitude: 43.6504, longitude: -79.4829, types: ["bakery_food_manufacturing"], website: "https://bloorwestbagels.example", phone: "416-555-0121", jobs: [] },
  { name: "Golden Horseshoe Extrusions", address: "85 Parkshore Dr, Brampton, ON L6T 5M1", latitude: 43.7254, longitude: -79.6611, types: ["manufacturing"], website: "https://ghextrusions.example", phone: "905-555-0149", jobs: [job("Extrusion Operator", "Brampton, ON", 4, "Full-time"), job("Shift Lead", "Brampton, ON", 11, "Full-time")] },
  { name: "Port Credit Provisions", address: "20 Port St E, Mississauga, ON L5G 4V3", latitude: 43.5495, longitude: -79.5833, types: ["bakery_food_manufacturing", "warehouse_distribution"], website: "https://portcreditprovisions.example", phone: "905-555-0112", jobs: [job("Delivery Driver", "Mississauga, ON", 6, "Part-time")] },
];

const landmarks: [RegExp, GeoPoint][] = [
  [/toronto|downtown/i, { latitude: 43.6532, longitude: -79.3832 }],
  [/brampton/i, { latitude: 43.7315, longitude: -79.7624 }],
  [/etobicoke/i, { latitude: 43.6205, longitude: -79.5132 }],
  [/vaughan|concord|woodbridge/i, { latitude: 43.8361, longitude: -79.4983 }],
  [/oakville/i, { latitude: 43.4675, longitude: -79.6877 }],
];
const defaultOrigin: GeoPoint = { latitude: 43.589, longitude: -79.6441 }; // Mississauga

export const stubProvider: TripProvider = {
  name: "stub",
  jobsConfigured: true,
  async geocode(address) {
    if (!address.trim()) return null;
    if (/^(nowhere|unknown)/i.test(address.trim())) return null;
    return landmarks.find(([pattern]) => pattern.test(address))?.[1] ?? defaultOrigin;
  },
  async searchCompanies(input: CompanySearchInput): Promise<CompanyCandidate[]> {
    const code = input.businessType?.code;
    const anyType = !code || code === "any";
    const candidates = catalogue
      .filter((entry) => anyType || entry.types.includes(code))
      .map((entry) => {
        const distanceKm = haversineKm(input.origin, entry);
        const driveMinutes = Math.round(distanceKm * 2.4 + 3);
        return { entry, distanceKm, driveMinutes };
      })
      .filter(({ distanceKm, driveMinutes }) => (input.radiusType === "km" ? distanceKm <= input.radius : driveMinutes <= input.radius))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, input.limit);
    return candidates.map(({ entry, distanceKm, driveMinutes }) => ({
      name: entry.name, address: entry.address, latitude: entry.latitude, longitude: entry.longitude, website: entry.website, phone: entry.phone,
      placeId: `stub-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, distanceKm: Math.round(distanceKm * 10) / 10, driveMinutes,
    }));
  },
  async jobs({ companyName }) {
    return catalogue.find((entry) => entry.name === companyName)?.jobs ?? [];
  },
};
