import { api, toQuery } from "@/lib/api";
import type { TrackerImportMode, TrackerImportReport, TrackerImportStatus } from "./model";

export const fetchTrackerImportStatus = (sheet?: string) => api<{ status: TrackerImportStatus }>(`/api/imports/tracker${toQuery({ sheet })}`);

export type TrackerUpload = {
  file: File;
  baseline: File | null;
  mode: TrackerImportMode;
  sheet: string;
  keepActionNames: boolean;
  force: boolean;
  defaultOwner: string;
  owners: string;
  archiveSheet: string;
  clientsSheet: string;
};

export function runTrackerImport(upload: TrackerUpload) {
  const form = new FormData();
  form.set("file", upload.file);
  if (upload.baseline) form.set("baseline", upload.baseline);
  form.set("mode", upload.mode);
  form.set("sheet", upload.sheet);
  form.set("keepActionNames", upload.keepActionNames ? "1" : "0");
  form.set("force", upload.force ? "1" : "0");
  form.set("defaultOwner", upload.defaultOwner);
  form.set("owners", upload.owners);
  form.set("archiveSheet", upload.archiveSheet);
  form.set("clientsSheet", upload.clientsSheet);
  return api<{ report: TrackerImportReport }>("/api/imports/tracker", { method: "POST", body: form });
}
