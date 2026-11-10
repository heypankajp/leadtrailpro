"use client";

import { useCallback, useState, type FormEvent } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Play, RefreshCw, Search } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText, Field, Loading } from "@/features/shell/components";
import { fetchTrackerImportStatus, runTrackerImport } from "./client";
import { defaultTrackerSheet, orderedCounts, type TrackerImportReport, type TrackerImportStatus } from "./model";

const fileKey = (file: File | null) => (file ? `${file.name}:${file.size}:${file.lastModified}` : "");

/** Administration → Tracker import (SPEC §10.9): upload the LeadsDec25 export, preview the exact outcome, then apply it. */
export default function TrackerImportPanel() {
  const { user: me, reference, notify, bumpData, refreshReference } = useApp();
  const fetcher = useCallback(() => fetchTrackerImportStatus().then((result) => result.status), []);
  const { data: status, error, reload } = useAsyncData<TrackerImportStatus>(fetcher);
  const [file, setFile] = useState<File | null>(null);
  const [baseline, setBaseline] = useState<File | null>(null);
  const [sheet, setSheet] = useState(defaultTrackerSheet);
  const [keepActionNames, setKeepActionNames] = useState(false);
  const [force, setForce] = useState(false);
  const [defaultOwner, setDefaultOwner] = useState("");
  const [owners, setOwners] = useState<string | null>(null);
  const [archiveSheet, setArchiveSheet] = useState("");
  const [clientsSheet, setClientsSheet] = useState("");
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [report, setReport] = useState<TrackerImportReport | null>(null);
  const [previewedKey, setPreviewedKey] = useState("");
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The built-in Sales Manager mappings pre-fill the text area; `owners` stays null until the person edits it.
  const ownersText = owners ?? (status?.managers ?? []).map((manager) => `${manager.name}=${manager.email}`).join("\n");

  const needsBaseline = (status?.unstampedEntries ?? 0) > 0 || refusal?.code === "needs_baseline";
  const canApply = Boolean(file) && previewedKey === fileKey(file) && !busy;

  const run = async (mode: "preview" | "apply") => {
    if (!file) { notify("Choose the tracker's .xlsx export first.", "error"); return; }
    setBusy(mode);
    setRefusal(null);
    try {
      const result = await runTrackerImport({ file, baseline, mode, sheet: sheet.trim() || defaultTrackerSheet, keepActionNames, force, defaultOwner, owners: ownersText, archiveSheet: archiveSheet.trim(), clientsSheet: clientsSheet.trim() });
      setReport(result.report);
      if (mode === "preview") { setPreviewedKey(fileKey(file)); notify("Preview ready: nothing was written"); }
      else {
        setPreviewedKey("");
        setForce(false);
        notify("Sales tracker imported");
        reload();
        bumpData();
        await refreshReference();
      }
    } catch (caught) {
      const code = caught instanceof ApiError && typeof caught.data.code === "string" ? caught.data.code : "";
      setRefusal({ code, message: errorMessage(caught) });
      notify(errorMessage(caught), "error");
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void run("preview"); };

  const ownersHint = "One Name=email per line, as the Sales Manager is written in the sheet. A missing account is created as a Sales Manager who signs in with Google.";

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">ADMINISTRATION</div><h1>Tracker import</h1><p>Bring the team&apos;s Google Sheet into the app: upload the export, preview the exact outcome, then apply it. Rows already imported are left alone; new and edited rows are applied.</p></div>
        <button type="button" className="text-button" onClick={reload}><RefreshCw size={13} /> Refresh</button>
      </div>
      <ErrorText message={error} />
      {!status && !error && <Loading text="Loading import status..." />}
      {status && (
        <div className="import-layout">
          <form className="panel settings-panel import-form" onSubmit={submit}>
            <div className="panel-heading"><div><h2>Upload the export</h2><p>Google Sheets → File → Download → Microsoft Excel (.xlsx). Only the <code>{sheet || defaultTrackerSheet}</code> sheet is read.</p></div></div>
            {needsBaseline && (
              <div className="form-note note-warning"><AlertTriangle size={14} /> <span>{status.unstampedEntries.toLocaleString()} timeline entries come from an import made before row fingerprints existed. For this one run, also upload the <strong>baseline workbook</strong> (the export that import was run from) so those entries can be matched to their rows; later runs need no baseline.</span></div>
            )}
            {refusal?.code === "already_imported" && (
              <div className="form-note note-warning"><AlertTriangle size={14} /> <span>{refusal.message} Tick &ldquo;Apply anyway&rdquo; below to run it again.</span></div>
            )}
            <div className="lead-form settings-form">
              <Field label="Tracker export (.xlsx)" required wide>
                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreviewedKey(""); setRefusal(null); }} required />
              </Field>
              {needsBaseline && (
                <Field label="Baseline workbook (.xlsx), once" hint="The export the earlier import was run from." wide>
                  <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setBaseline(event.target.files?.[0] ?? null); setPreviewedKey(""); }} />
                </Field>
              )}
              <Field label="Sheet"><input value={sheet} maxLength={120} onChange={(event) => { setSheet(event.target.value); setPreviewedKey(""); }} required /></Field>
              <Field label="Owner when a row names no Sales Manager">
                <select value={defaultOwner} onChange={(event) => { setDefaultOwner(event.target.value); setPreviewedKey(""); }}>
                  <option value="">{me.name} (you)</option>
                  {reference.users.filter((person) => person.active && person.role !== "recruiter" && person.id !== me.id).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </Field>
              <Field label="Sales Manager accounts" hint={ownersHint} wide>
                <textarea rows={5} value={ownersText} onChange={(event) => { setOwners(event.target.value); setPreviewedKey(""); }} />
              </Field>
              <label className="checklist-item"><input type="checkbox" checked={keepActionNames} onChange={(event) => { setKeepActionNames(event.target.checked); setPreviewedKey(""); }} /> Keep the tracker&apos;s &ldquo;Cold Call&rdquo; and &ldquo;Cold Email&rdquo; instead of &ldquo;First Call&rdquo; and &ldquo;First Email&rdquo;</label>
              {(refusal?.code === "already_imported" || force) && (
                <label className="checklist-item"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} /> Apply anyway: this file was imported before (rows already imported are still left alone)</label>
              )}
              <details className="import-section">
                <summary>Other sheets (optional)</summary>
                <div className="rule-row">
                  <Field label="Archive sheet" hint="For example ArchiveSales: one archived lead per company not already present."><input value={archiveSheet} maxLength={120} onChange={(event) => { setArchiveSheet(event.target.value); setPreviewedKey(""); }} /></Field>
                  <Field label="Clients sheet" hint="For example Clients: companies listed there are set to status Client."><input value={clientsSheet} maxLength={120} onChange={(event) => { setClientsSheet(event.target.value); setPreviewedKey(""); }} /></Field>
                </div>
              </details>
              <div className="import-actions">
                <button type="submit" className="button button-outline" disabled={busy !== null || !file}><Search size={15} /> {busy === "preview" ? "Previewing..." : "Preview"}</button>
                <button type="button" className="button button-primary" disabled={!canApply} onClick={() => setConfirming(true)}><Play size={15} /> {busy === "apply" ? "Importing..." : "Apply"}</button>
                <small className="field-hint">{canApply ? "The preview above is what Apply will write." : "Preview first; Apply is enabled once the chosen file has been previewed."}</small>
              </div>
            </div>
            {report && <ReportView report={report} />}
          </form>
          <section className="panel settings-panel">
            <div className="panel-heading"><div><h2>Status</h2><p>What the database already holds from the tracker.</p></div></div>
            <div className="form-note"><FileSpreadsheet size={14} /> <span>{status.importedLeads.toLocaleString()} leads with {status.importedEntries.toLocaleString()} timeline entries from <code>{status.sheetName}</code>. Last applied import: {status.lastImport ? `${formatDateTime(status.lastImport.at)} by ${status.lastImport.actorName ?? "unknown"}` : "none yet"}.</span></div>
            <div className="panel-heading"><div><h2>Sales Managers in the sheet</h2><p>Names in the sheet and the accounts their leads go to.</p></div></div>
            <ul className="manager-list">
              {status.managers.map((manager) => (
                <li key={manager.name}>
                  <strong>{manager.name}</strong> → {manager.email}
                  {manager.userId ? <span className={`badge ${manager.active ? "badge-on" : "badge-off"}`}>{manager.active ? "account exists" : "account inactive"}</span> : <span className="badge badge-muted">created on first import</span>}
                  {manager.note && <small className="field-hint">{manager.note}</small>}
                </li>
              ))}
            </ul>
            <div className="panel-heading"><div><h2>Previous runs</h2><p>Previews and applied imports, newest first.</p></div></div>
            {status.history.length === 0 ? <p className="field-hint">No runs yet.</p> : (
              <ul className="import-history">
                {status.history.map((run) => (
                  <li key={run.id}>
                    <span><span className={`badge ${run.dryRun ? "badge-muted" : "badge-on"}`}>{run.dryRun ? "Preview" : "Applied"}</span> {formatDateTime(run.at)}{run.actorName ? ` · ${run.actorName}` : ""}</span>
                    <small>{run.details}</small>
                  </li>
                ))}
              </ul>
            )}
            <div className="panel-heading"><div><h2>From another machine</h2><p>The same import without the browser.</p></div></div>
            <pre className="token-usage">{`npm run remote -- import "docs/Sales Leads 2026.xlsx"          # preview\nnpm run remote -- import "docs/Sales Leads 2026.xlsx" --apply\n# needs LTP_URL and LTP_TOKEN (Administration → API access) in .env.remote.local`}</pre>
          </section>
        </div>
      )}

      {confirming && report && file && (
        <Dialog title="Apply the import?" eyebrow="TRACKER IMPORT" onClose={() => setConfirming(false)} size="narrow">
          <p className="dialog-description">
            {file.name} will be applied as previewed: {report.counts["leads created (new companies)"] ?? 0} new leads, {report.counts["leads updated"] ?? 0} leads updated, {(report.counts["timeline entries added (new rows)"] ?? 0) + (report.counts["timeline entries written"] ?? 0)} timeline entries added, {report.counts["timeline entries updated (edited rows)"] ?? 0} updated.
            {report.appEdited.length > 0 && ` ${report.appEdited.length} of the leads were changed in the app since the previous import; the sheet's values will replace those fields.`}
          </p>
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => void run("apply")}>{busy === "apply" ? "Importing..." : "Apply import"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function ReportSection({ title, lines, alert }: { title: string; lines: string[]; alert?: boolean }) {
  if (!lines.length) return null;
  return (
    <details className={`import-section ${alert ? "is-alert" : ""}`} open={alert}>
      <summary>{title} <small>({lines.length})</small></summary>
      <ul>{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </details>
  );
}

const countedLines = (record: Record<string, number>) => Object.entries(record).map(([key, value]) => `${value} × ${key}`);

function ReportView({ report }: { report: TrackerImportReport }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([report.text], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `import-report-${report.fileHash}${report.dryRun ? "-preview" : ""}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="import-report" aria-live="polite">
      <div className="import-report-head">
        <strong>{report.dryRun ? "Preview: nothing was written" : "Applied"}</strong>
        <span>{report.fileName} (hash {report.fileHash})</span>
        <span>sheet {report.sheetName}</span>
        <span>{report.seconds.toFixed(1)} s</span>
        <span>previous import {report.previousImportAt ?? "none"}</span>
        <span>{report.warningCount} warning{report.warningCount === 1 ? "" : "s"}</span>
        <button type="button" className="text-button" onClick={download}><Download size={13} /> Download report</button>
      </div>
      <div className="import-counts">
        {orderedCounts(report.counts).map(([key, value]) => <div className="import-count" key={key}><strong>{value.toLocaleString()}</strong><span>{key}</span></div>)}
      </div>
      <ReportSection title="Leads edited in the app since the previous import (check these: the sheet's values win)" lines={report.appEdited} alert />
      <ReportSection title="Defaults and mappings applied" lines={countedLines(report.decisions)} />
      <ReportSection title="Fields changed on existing leads" lines={countedLines(report.fieldChanges)} />
      <ReportSection title="Accounts created" lines={report.createdUsers} />
      <ReportSection title="List values created" lines={report.createdValues} />
      <ReportSection title="Leads updated" lines={report.updatedLeads} />
      <ReportSection title="Rows removed from the sheet (timeline entries kept)" lines={report.removedRows} />
      <ReportSection title="Rejected rows" lines={report.rejects} />
      <ReportSection title="Companies skipped" lines={report.skipped} />
      {Object.entries(report.warnings).map(([kind, lines]) => <ReportSection key={kind} title={kind} lines={lines} />)}
    </div>
  );
}
