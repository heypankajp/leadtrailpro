"use client";

import { useCallback, useState } from "react";
import { Pause, Play, RefreshCw, Rocket } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/useAsyncData";
import { useApp } from "@/features/shell/AppContext";
import { ErrorText, Loading } from "@/features/shell/components";
import { fetchDeployStatus, requestDeployNow, setDeployPaused } from "./client";
import { shortCommit, type DeployStatus } from "./model";

/**
 * Settings → Releases (SPEC §2.4): what the server runs, and the pause switch. A push to the followed branch goes live
 * by itself; with deploys paused it waits until someone presses Deploy now (or runs `deploy` from the remote client).
 */
export default function ReleasesCard() {
  const { notify } = useApp();
  const fetcher = useCallback(() => fetchDeployStatus(), []);
  const { data, error, reload } = useAsyncData<DeployStatus>(fetcher);
  const [changed, setChanged] = useState<DeployStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const status = changed ?? data;

  const act = async (work: () => Promise<DeployStatus>, message: string) => {
    setBusy(true);
    try { setChanged(await work()); notify(message); } catch (caught) { notify(errorMessage(caught), "error"); } finally { setBusy(false); }
  };
  const last = status?.runs[0];

  return (
    <section className="panel settings-panel releases-card" aria-label="Releases">
      <div className="panel-heading">
        <div><h2>Releases</h2><p>What the server runs, and whether a push goes live by itself.</p></div>
        <button type="button" className="text-button" onClick={() => { setChanged(null); reload(); }}><RefreshCw size={13} /> Refresh</button>
      </div>
      <ErrorText message={error} />
      {!status && !error && <Loading />}
      {status && (
        <>
          <dl className="releases-facts">
            <div><dt>Running</dt><dd>{status.commit ? shortCommit(status.commit) : "a build made by hand"} · database version {status.schemaVersion ?? "?"}</dd></div>
            <div><dt>Deployer</dt><dd>{status.agent ? `${status.agentOnline ? "online" : "not running"} · follows ${status.agent.branch}${status.agent.remoteCommit ? ` (at ${shortCommit(status.agent.remoteCommit)})` : ""}` : "none has checked in on this installation"}</dd></div>
            {last && <div><dt>Last deploy</dt><dd>{formatDateTime(last.startedAt)} · {last.status}{last.details ? ` · ${last.details}` : ""}</dd></div>}
          </dl>
          {status.paused
            ? <p className="form-note releases-note releases-paused" role="status"><Pause size={14} /> <span><strong>Deploys are paused</strong> since {formatDateTime(status.paused.pausedAt)} by {status.paused.pausedByName}. Pushed changes wait until someone deploys.{status.waiting ? " A newer version is waiting now." : ""}</span></p>
            : <p className="form-note releases-note" role="status"><Play size={14} /> <span><strong>Automatic deploys are on.</strong> A push to the followed branch goes live by itself within a couple of minutes.</span></p>}
          {status.request && <p className="field-hint">Deploy asked for by {status.request.requestedByName} at {formatDateTime(status.request.requestedAt)}; the deployer checks every minute.</p>}
          <div className="releases-actions">
            {status.paused
              ? <button type="button" className="button button-outline" disabled={busy} onClick={() => void act(() => setDeployPaused(false), "Automatic deploys resumed")}><Play size={14} /> Resume automatic deploys</button>
              : <button type="button" className="button button-outline" disabled={busy} onClick={() => void act(() => setDeployPaused(true), "Deploys paused: pushes wait until you deploy")}><Pause size={14} /> Pause deploys</button>}
            <button type="button" className="button button-primary" disabled={busy || !status.agentOnline} title={status.agentOnline ? undefined : "No deployer is running on this installation"} onClick={() => void act(requestDeployNow, "Deploy requested; the deployer checks every minute")}><Rocket size={14} /> Deploy now</button>
          </div>
        </>
      )}
    </section>
  );
}
