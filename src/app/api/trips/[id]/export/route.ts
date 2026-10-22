import ExcelJS from "exceljs";
import { handleRouteError, jsonError } from "@/lib/http";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { exportScopeLabels, formatDistance, parseExportScope, radiusLabel } from "@/features/trips/model";
import { getTrip, selectScope } from "@/features/trips/repository";
import { requirePrivilege, requireUser } from "@/features/users/session";

type RouteContext = { params: Promise<{ id: string }> };

const fileSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "trip";

/** Excel (default) or PDF (`format=pdf`) export of a trip's companies (TRIP-11): scope all | filtered | shortlisted | planned, optionally one Action label. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "plan_trips", "You do not have permission to plan sales trips.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, "Invalid trip ID.");
    const params = new URL(request.url).searchParams;
    const scope = parseExportScope(params.get("scope"));
    const action = params.get("action")?.trim().slice(0, 160) || null;
    const { trip, results } = await getTrip(id, user);
    const rows = selectScope(results, scope, action);
    const scopeText = `${exportScopeLabels[scope]}${action ? ` · Action: ${action}` : ""}`;

    if (params.get("format") === "pdf") {
      const buffer = await renderTablePdf({
        title: `Field visit report: ${trip.title}`,
        subtitle: `${trip.address} · within ${radiusLabel(trip)} · ${trip.businessType ?? "Any business type"}`,
        meta: [["Scope", `${scopeText} · ${rows.length} ${rows.length === 1 ? "company" : "companies"}`], ["Planned by", trip.ownerName], ["Printed", new Date().toISOString().slice(0, 10)]],
        columns: [
          { header: "Company", width: 150 }, { header: "Company Address", width: 200 }, { header: "Distance", width: 55, align: "right" }, { header: "Hiring", width: 45, align: "right" },
          { header: "Action", width: 130 }, { header: "Phone", width: 80 }, { header: "Planned visit", width: 70 },
        ],
        rows: rows.map((row) => [row.companyName, row.address, formatDistance(row, trip.radiusType), row.jobCount === null ? "" : `${row.jobCount} ${row.jobCount === 1 ? "job" : "jobs"}`, row.actionLabel, row.phone, row.plannedVisitDate ?? ""]),
        landscape: true, emptyText: "No companies in this scope.",
      });
      return pdfResponse(buffer, `sales-trip-${trip.id}-${fileSlug(trip.title)}-${scope}.pdf`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SalesTrackPro";
    const sheet = workbook.addWorksheet("Companies");
    sheet.columns = [
      { header: "Company", key: "company", width: 34 },
      { header: "Company Address", key: "address", width: 46 },
      { header: "Distance", key: "distance", width: 12 },
      { header: "Hiring", key: "hiring", width: 10 },
      { header: "Action", key: "action", width: 32 },
      { header: "Website", key: "website", width: 34 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Shortlisted", key: "shortlisted", width: 12 },
      { header: "Planned visit", key: "plannedVisit", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    for (const row of rows) {
      sheet.addRow({
        company: row.companyName, address: row.address, distance: formatDistance(row, trip.radiusType), hiring: row.jobCount ?? "", action: row.actionLabel,
        website: row.website, phone: row.phone, shortlisted: row.shortlisted ? "Yes" : "", plannedVisit: row.plannedVisitDate ?? "",
      });
    }
    const info = workbook.addWorksheet("Trip");
    info.columns = [{ key: "label", width: 18 }, { key: "value", width: 60 }];
    info.addRows([
      ["Trip", trip.title], ["Address", trip.address], ["Radius", radiusLabel(trip)], ["Business type", trip.businessType ?? "Any"],
      ["Scope", scopeText], ["Companies", rows.length], ["Planned by", trip.ownerName], ["Exported", new Date().toISOString()],
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sales-trip-${trip.id}-${fileSlug(trip.title)}-${scope}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error, "Export sales trip");
  }
}
