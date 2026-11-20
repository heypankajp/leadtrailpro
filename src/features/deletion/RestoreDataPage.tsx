"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, RotateCcw, Search, Trash2 } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { EmptyState, ErrorText, Loading } from "@/features/shell/components";
import { dealExportUrl, fetchDeleted, leadExportUrl, restoreDeleted } from "./client";
import { RestoreConfirmDialog } from "./DeleteDialogs";
import { restoreDaysOf, type DeletedItem, type DeletedKind } from "./model";

/**
 * Restore Data (request of November 20, 2026), last under Tools: the deals and leads deleted in the last 30 days, each in a
 * tab, restored one by one or several at once, or exported to Excel before the scheduler removes them for good.
 */
export default function RestoreDataPage({ kind }: { kind: DeletedKind }) {
  const { navigate, notify, bumpData, dataVersion, openLead, reference } = useApp();
  const restoreDays = restoreDaysOf(reference.listValues.restore_days);
  const fetcher = useCallback(() => fetchDeleted(kind), [kind]);
  const { data, error, loading, reload } = useAsyncData(fetcher, dataVersion);
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<DeletedItem[] | null>(null);
  const one = kind === "deals" ? "deal" : "lead";

  const items = useMemo(() => {
    const words = filter.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => !words || [item.title, item.contact ?? "", item.city ?? "", item.ownerName ?? "", item.deletedByName ?? ""].some((text) => text.toLowerCase().includes(words)));
  }, [data, filter]);
  const restorable = items.filter((item) => item.canRestore);
  const allChecked = restorable.length > 0 && restorable.every((item) => selected.includes(item.id));
  const picked = items.filter((item) => selected.includes(item.id));

  const restore = async (list: DeletedItem[]) => {
    const result = await restoreDeleted(kind, list.map((item) => item.id));
    setConfirm(null);
    setSelected([]);
    notify(result.restored === list.length ? `${result.restored === 1 ? list[0].title : `${result.restored} ${one}s`} restored` : `${result.restored} of ${list.length} restored; you may restore only your own ${one}s`);
    reload();
    bumpData();
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TOOLS</div>
          <h1>Restore Data</h1>
          <p>Deals and leads deleted in the last {restoreDays} days. Restore them, or export one to Excel before it is removed for good.</p>
        </div>
      </div>
      <div className="opp-tabs">
        <div className="followup-tabs tab-strip" role="tablist">
          {(["deals", "leads"] as const).map((id) => (
            <button key={id} role="tab" aria-selected={kind === id} className={`followup-tab ${kind === id ? "is-active" : ""}`} onClick={() => navigate("restore-data", id)}>
              {id === "deals" ? "Deals" : "Leads"} <span className="tab-count">{data?.counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel restore-panel">
        <div className="opp-toolbar">
          <div className="opp-toolbar-left">
            <button type="button" className="button button-outline button-small" disabled={!picked.length} onClick={() => setConfirm(picked)}><RotateCcw size={14} /> Restore {kind === "deals" ? "Deals" : "Leads"}{picked.length ? ` [${picked.length}]` : ""}</button>
            <label className="opp-search"><Search size={13} /><input placeholder={`Filter by ${kind === "deals" ? "deal, contact, owner" : "lead, contact, location"}`} aria-label={`Filter deleted ${one}s`} value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
          </div>
          {data && <small className="field-hint">{items.length} {items.length === 1 ? one : `${one}s`}</small>}
        </div>
        <ErrorText message={error} />
        {loading && !data ? <Loading text="Loading deleted items..." /> : items.length === 0 ? (
          <EmptyState icon={<Trash2 size={22} />} title={filter ? `No deleted ${one} matches the filter` : `No ${one} deleted in the last ${restoreDays} days`} text={`A deleted ${one} stays here for ${restoreDays} days.`} />
        ) : (
          <div className="table-scroll">
            <table className="lead-table restore-table">
              <thead>
                <tr>
                  <th className="check-cell"><input type="checkbox" aria-label={`Select every ${one}`} checked={allChecked} disabled={!restorable.length} onChange={(event) => setSelected(event.target.checked ? restorable.map((item) => item.id) : [])} /></th>
                  <th>{kind === "deals" ? "DEAL" : "LEAD"}</th>
                  <th>DELETED BY</th>
                  <th>DELETED</th>
                  <th>{kind === "deals" ? "STAGE" : "STATUS"}</th>
                  <th>CONTACT</th>
                  <th>{kind === "deals" ? "OWNER" : "ADDED BY"}</th>
                  <th>REMOVED FOR GOOD</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={selected.includes(item.id) ? "is-selected" : ""}>
                    <td className="check-cell"><input type="checkbox" aria-label={`Select ${item.title}`} disabled={!item.canRestore} checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td>
                    <td>
                      {kind === "deals"
                        ? <button type="button" className="opp-name opp-name-link" onClick={() => openLead(item.id)}>{item.title}</button>
                        : <strong className="opp-name">{item.title}</strong>}
                      <small className="muted-cell">{[item.city, item.origin ? (item.origin === "manual" ? "Manual" : "Generated") : item.status].filter(Boolean).join(" · ")}</small>
                    </td>
                    <td>{item.deletedByName ?? "—"}</td>
                    <td>{formatDateTime(item.deletedAt)}</td>
                    <td>{kind === "deals" ? item.stage ?? "—" : item.status}</td>
                    <td>{item.contact || "—"}</td>
                    <td>{item.ownerName ?? "—"}</td>
                    <td><span className="restore-expiry">{formatDate(item.purgeAt.slice(0, 10))}</span></td>
                    <td>
                      <div className="opp-actions">
                        <a className="button button-outline button-small" href={kind === "deals" ? dealExportUrl(item.id) : leadExportUrl(item.id)} title="Download the details as Excel"><Download size={13} /> Excel</a>
                        {item.canRestore && <button type="button" className="button button-outline button-small" onClick={() => setConfirm([item])} aria-label={`Restore ${item.title}`}><RotateCcw size={13} /> Restore</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirm && <RestoreConfirmDialog kind={one} names={confirm.map((item) => item.title)} onClose={() => setConfirm(null)} onConfirm={() => restore(confirm)} />}
    </>
  );
}
