import { handleRouteError, jsonError } from "@/lib/http";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { formatDate } from "@/lib/format";
import { getVisitTrip, visitTripDeals, visitTripLeads, visitTripOrder } from "@/features/visit-trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const fileSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "trip";

/**
 * A sales trip as a PDF (request of November 20, 2026): the trip's date and salesperson, how many companies and which cities,
 * then the deals in visiting order with the person to see (name, phone, email), the address and the positions the company hires
 * for, and an empty Visit Notes column to fill in (columns of November 20, 2026).
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view sales trips.");
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid sales trip ID.");
    const trip = await getVisitTrip(id);
    if (!trip) return jsonError(404, "Sales trip not found.");
    // Deals and leads in their visiting order (request of November 20, 2026).
    const [deals, leads, order] = await Promise.all([visitTripDeals(id), visitTripLeads(id), visitTripOrder(id)]);
    const dealById = new Map(deals.map((deal) => [deal.id, deal]));
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const positionsOf = (text: string) => [...new Set(text.split(/[\n;,]+/).map((item) => item.trim()).filter(Boolean))];
    const stops = order.flatMap((item) => {
      if (item.kind === "deal") {
        const deal = dealById.get(item.id);
        return deal ? [{
          name: deal.clientName, sub: deal.industry, city: deal.city?.trim() || (deal.address.includes(",") ? deal.address.split(",").slice(-2)[0].trim() : ""),
          person: [deal.clientExecutive || "No contact yet", [deal.contactPhone, deal.contactAltPhone].filter(Boolean).join(" · "), deal.clientEmails.join(", ")].filter(Boolean).join("\n"),
          address: [deal.address, deal.city].filter(Boolean).join(", ") || "—", positions: positionsOf(deal.positions).join("\n") || "—",
          stage: deal.statusCode === "client" ? "Client" : deal.stage ?? "—",
        }] : [];
      }
      const lead = leadById.get(item.id);
      return lead ? [{
        name: lead.companyName, sub: "Lead", city: lead.location.split(",")[0]?.trim() ?? "",
        person: [lead.person?.name || "No contact yet", lead.person?.phone ?? "", (lead.person?.emails ?? []).join(", ")].filter(Boolean).join("\n"),
        address: lead.location || "—", positions: lead.positions.join("\n") || "—",
        stage: lead.archived ? "Lead · Archived" : lead.status === "not_relevant" ? "Lead · Not Relevant" : "Lead",
      }] : [];
    });
    const companies = new Set(stops.map((stop) => stop.name.trim().toLowerCase())).size;
    const cities = [...stops.reduce((map, stop) => { const city = stop.city || "No city"; map.set(city, (map.get(city) ?? 0) + 1); return map; }, new Map<string, number>())]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([city, count]) => (count > 1 ? `${city} (${count})` : city));
    const buffer = await renderTablePdf({
      title: `Sales trip: ${trip.title}`,
      subtitle: `${formatDate(trip.tripDate)} · ${trip.ownerName}`,
      meta: [
        ["Companies planned", String(companies)],
        ["Cities", cities.join(", ") || "None yet"],
        ["Printed", formatDate(new Date().toISOString().slice(0, 10))],
      ],
      columns: [
        { header: "#", width: 22, align: "center" },
        { header: "Company", width: 150 },
        { header: "Person", width: 140 },
        { header: "Address", width: 130 },
        { header: "Positions", width: 110 },
        { header: "Stage", width: 80 },
        { header: "Visit Notes", width: 125 },
      ],
      rows: stops.map((stop, index) => [index + 1, [stop.name, stop.sub].filter(Boolean).join("\n"), stop.person, stop.address, stop.positions, stop.stage, "\n\n"]),
      landscape: true,
      emptyText: "No deals or leads on this trip yet.",
    });
    return pdfResponse(buffer, `sales-trip-${trip.id}-${fileSlug(trip.title)}.pdf`);
  } catch (error) {
    return handleRouteError(error, "Sales trip PDF");
  }
}
