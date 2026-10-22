import ExcelJS from "exceljs";
import { reportPeriodLabels, reportPeriods, type ReportPeriod } from "@/lib/dates";
import { handleRouteError, jsonError } from "@/lib/http";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { performanceReport } from "@/features/reports/repository";
import { getSettings } from "@/features/settings/repository";
import { isUserStage, stageLabels } from "@/features/users/model";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

/** Excel (default) or PDF (`format=pdf`) export of the performance report (RPT-06), honouring the RPT-05 filters. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "view_reports", "You do not have permission to view reports.");
    const params = new URL(request.url).searchParams;
    const period = params.get("period") ?? "this_week";
    if (!reportPeriods.includes(period as ReportPeriod)) return jsonError(400, "Unknown report period.");
    const userId = Number(params.get("userId"));
    const selectedUser = Number.isSafeInteger(userId) && userId > 0 ? userId : null;
    if (selectedUser && selectedUser !== user.id && !hasPrivilege(user, "view_team_reports")) return jsonError(403, "You can only view your own report.");
    const stageParam = params.get("stage");
    const templateParam = Number(params.get("templateId"));
    const filters = { stage: isUserStage(stageParam) ? stageParam : null, templateId: Number.isSafeInteger(templateParam) && templateParam > 0 ? templateParam : null };
    const report = await performanceReport(period as ReportPeriod, user, selectedUser, filters);
    const { roleLabels } = await getSettings();
    const filterText = [filters.stage ? `Stage: ${stageLabels[filters.stage]}` : "", filters.templateId ? `Template: ${report.rows[0]?.template ?? `#${filters.templateId}`}` : ""].filter(Boolean).join(" · ") || "All sales managers";

    if (params.get("format") === "pdf") {
      const columns = [
        { header: "Name", width: 150 }, { header: "Role", width: 80 }, { header: "Stage", width: 80 }, { header: "Template", width: 90 },
        { header: "Leads", width: 44, align: "right" as const }, { header: "Updated", width: 50, align: "right" as const }, { header: "Calls", width: 44, align: "right" as const }, { header: "Emails", width: 48, align: "right" as const },
        { header: "Visits", width: 44, align: "right" as const }, { header: "Notes", width: 44, align: "right" as const }, { header: "Conv.", width: 44, align: "right" as const }, { header: "Tasks", width: 44, align: "right" as const },
        { header: "Done", width: 44, align: "right" as const }, { header: "Files", width: 44, align: "right" as const }, { header: "Logins", width: 48, align: "right" as const }, { header: "Target %", width: 56, align: "right" as const },
      ];
      const rows = report.rows.map((row) => [
        row.name, roleLabels[row.role as keyof typeof roleLabels] ?? row.role, row.stage.replace("_", " "), row.template ?? "", row.leadsCreated, row.leadsUpdated, row.calls, row.emails, row.visits, row.notes,
        row.conversions, row.tasksCreated, row.tasksCompleted, row.filesUploaded, row.logins, row.targetPercent === null ? "" : `${row.targetPercent}%`,
      ]);
      const totals = report.rows.reduce((sum, row) => ({ leads: sum.leads + row.leadsCreated, calls: sum.calls + row.calls, emails: sum.emails + row.emails, visits: sum.visits + row.visits, conversions: sum.conversions + row.conversions }), { leads: 0, calls: 0, emails: 0, visits: 0, conversions: 0 });
      const buffer = await renderTablePdf({
        title: "Performance report", subtitle: `${reportPeriodLabels[period as ReportPeriod]} · ${report.range.startYmd} to ${report.range.endExclusiveYmd} (exclusive)`,
        meta: [["Scope", filterText], ["Totals", `${totals.leads} leads · ${totals.calls} calls · ${totals.emails} emails · ${totals.visits} visits · ${totals.conversions} conversions`], ["Exported", new Date().toISOString()]],
        columns, rows, landscape: true, emptyText: "No people to report on.",
      });
      return pdfResponse(buffer, `salestrackpro-${period}-${report.range.startYmd}.pdf`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SalesTrackPro";
    const sheet = workbook.addWorksheet("Performance");
    sheet.columns = [
      { header: "Name", key: "name", width: 26 }, { header: "Role", key: "role", width: 16 }, { header: "Stage", key: "stage", width: 16 }, { header: "Template", key: "template", width: 18 },
      { header: "Leads", key: "leadsCreated", width: 8 }, { header: "Updated", key: "leadsUpdated", width: 9 }, { header: "Calls", key: "calls", width: 8 }, { header: "Emails", key: "emails", width: 8 },
      { header: "Visits", key: "visits", width: 8 }, { header: "Notes", key: "notes", width: 8 }, { header: "Conversions", key: "conversions", width: 12 }, { header: "Tasks", key: "tasksCreated", width: 8 },
      { header: "Done", key: "tasksCompleted", width: 8 }, { header: "Files", key: "filesUploaded", width: 8 }, { header: "Logins", key: "logins", width: 8 }, { header: "Target %", key: "targetPercent", width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    for (const row of report.rows) {
      sheet.addRow({ ...row, role: roleLabels[row.role as keyof typeof roleLabels] ?? row.role, template: row.template ?? "", targetPercent: row.targetPercent ?? "" });
    }
    const daily = workbook.addWorksheet("Daily");
    daily.columns = [{ header: "Date", key: "date", width: 12 }, { header: "Calls", key: "calls", width: 8 }, { header: "Emails", key: "emails", width: 8 }, { header: "Visits", key: "visits", width: 8 }, { header: "Leads", key: "leads", width: 8 }];
    daily.getRow(1).font = { bold: true };
    for (const point of report.series) daily.addRow(point);
    const info = workbook.addWorksheet("Report");
    info.columns = [{ key: "label", width: 14 }, { key: "value", width: 40 }];
    info.addRows([["Period", reportPeriodLabels[period as ReportPeriod]], ["From", report.range.startYmd], ["To (exclusive)", report.range.endExclusiveYmd], ["Scope", filterText], ["Exported", new Date().toISOString()]]);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="salestrackpro-${period}-${report.range.startYmd}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error, "Export report");
  }
}
