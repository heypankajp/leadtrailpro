import { NextResponse } from "next/server";
import { handleRouteError, jsonError, requireSameOrigin } from "@/lib/http";
import { defaultTrackerSheet, maxTrackerUploadBytes, parseTrackerImportOptions } from "@/features/tracker-import/model";
import { runUploadedTrackerImport, trackerImportStatus } from "@/features/tracker-import/service";
import { requirePrivilege, requireUser } from "@/features/users/session";

/**
 * The sales-tracker import through the app (SPEC §10.9). GET: previous runs and whether a baseline is needed.
 * POST (multipart): `file` (the .xlsx export), optional `baseline`, `mode` preview|apply, `sheet`, `keepActionNames`,
 * `force`, `defaultOwner`, `owners` (Name=email lines), `archiveSheet`, `clientsSheet`. The response is the report; a preview
 * runs everything and rolls it back. Also reachable with an API token: `npm run remote -- import <file> [--apply]`.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to import the sales tracker.");
    const sheet = new URL(request.url).searchParams.get("sheet")?.trim().slice(0, 120) || defaultTrackerSheet;
    return NextResponse.json({ status: await trackerImportStatus(sheet) });
  } catch (error) {
    return handleRouteError(error, "Tracker import status");
  }
}

const uploaded = async (value: FormDataEntryValue | null, what: string): Promise<{ bytes: Buffer; name: string } | null> => {
  if (value === null || typeof value === "string") return null;
  if (value.size > maxTrackerUploadBytes) throw new Error(`${what} is larger than ${Math.round(maxTrackerUploadBytes / 1024 / 1024)} MB.`);
  return { bytes: Buffer.from(await value.arrayBuffer()), name: value.name || `${what}.xlsx` };
};

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    requirePrivilege(user, "manage_settings", "You do not have permission to import the sales tracker.");
    const form = await request.formData().catch(() => null);
    if (!form) return jsonError(400, "Send the workbook as multipart form data in the field \"file\".");
    const options = parseTrackerImportOptions(form);
    if ("error" in options) return jsonError(400, options.error);
    let file: { bytes: Buffer; name: string } | null;
    let baseline: { bytes: Buffer; name: string } | null;
    try {
      file = await uploaded(form.get("file"), "The workbook");
      baseline = await uploaded(form.get("baseline"), "The baseline workbook");
    } catch (error) {
      return jsonError(413, error instanceof Error ? error.message : "The upload is too large.");
    }
    if (!file || !file.bytes.length) return jsonError(400, "Choose the tracker's .xlsx export (the field \"file\").");
    const report = await runUploadedTrackerImport({ fileBytes: file.bytes, fileName: file.name, baselineBytes: baseline?.bytes ?? null, baselineName: baseline?.name ?? null, options }, user);
    return NextResponse.json({ report });
  } catch (error) {
    return handleRouteError(error, "Tracker import");
  }
}
