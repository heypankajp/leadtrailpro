import ExcelJS from "exceljs";
import { reportPeriodLabels, reportPeriods, type ReportPeriod } from "@/lib/dates";
import { handleRouteError, jsonError } from "@/lib/http";
import { performanceReport } from "@/features/reports/repository";
import { getSettings } from "@/features/settings/repository";
import { hasPrivilege, requirePrivilege, requireUser } from "@/features/users/session";

/** Excel export of the performance report (RPT-06). */
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
    const report = await performanceReport(period as ReportPeriod, user, selectedUser);
    const { roleLabels } = await getSettings();

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
    info.addRows([["Period", reportPeriodLabels[period as ReportPeriod]], ["From", report.range.startYmd], ["To (exclusive)", report.range.endExclusiveYmd], ["Exported", new Date().toISOString()]]);
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
