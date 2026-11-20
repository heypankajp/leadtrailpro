import { handleRouteError, jsonError } from "@/lib/http";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { formatDate } from "@/lib/format";
import { getVisitTrip, visitTripDeals } from "@/features/visit-trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const fileSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "trip";

/**
 * A sales trip as a PDF (request of November 20, 2026): the trip's date and salesperson, how many companies and which cities,
 * then the deals in visiting order with their contact, address, status and stage, and an empty Visit notes column to fill in.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_leads", "You do not have permission to view sales trips.");
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid sales trip ID.");
    const trip = await getVisitTrip(id);
    if (!trip) return jsonError(404, "Sales trip not found.");
    const deals = await visitTripDeals(id);
    const companies = new Set(deals.map((deal) => deal.clientName.trim().toLowerCase())).size;
    const cities = [...deals.reduce((map, deal) => { const city = deal.city?.trim() || "No city"; map.set(city, (map.get(city) ?? 0) + 1); return map; }, new Map<string, number>())]
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
        { header: "Contact", width: 120 },
        { header: "Address", width: 170 },
        { header: "Status", width: 80 },
        { header: "Stage", width: 95 },
        { header: "Visit notes", width: 150 },
      ],
      rows: deals.map((deal, index) => [
        index + 1,
        [deal.clientName, deal.industry].filter(Boolean).join("\n"),
        [deal.clientExecutive || "No contact yet", deal.contactPhone].filter(Boolean).join("\n"),
        [deal.address, deal.city].filter(Boolean).join(", ") || "—",
        deal.statusLabel,
        deal.statusCode === "client" ? "—" : deal.stage ?? "—",
        "\n\n",
      ]),
      landscape: true,
      emptyText: "No deals on this trip yet.",
    });
    return pdfResponse(buffer, `sales-trip-${trip.id}-${fileSlug(trip.title)}.pdf`);
  } catch (error) {
    return handleRouteError(error, "Sales trip PDF");
  }
}
