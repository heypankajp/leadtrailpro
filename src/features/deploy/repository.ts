import { fromSqlDateTime, getDatabasePool, insertId, toSqlDateTime, type Queryable } from "@/lib/db";
import { recordAudit } from "@/features/audit/repository";
import type { UserAccount } from "@/features/users/model";
import { deployAgentOnlineMs, isCommit, sameCommit, shortCommit, type DeployAgent, type DeployEvent, type DeployFailureLog, type DeployPause, type DeployRequest, type DeployRun, type DeployStatus } from "./model";

/**
 * What the app knows about deploys (SPEC §2.4). The deployer's heartbeat and an administrator's "deploy now" live in
 * `app_settings` (`deploy_agent`, `deploy_request`, and `deploy_failure_log` with the end of the last failed deploy's
 * output); each deploy is a `job_runs` row with job `deploy`, so no table of its own is needed. The running commit is
 * the image's APP_COMMIT.
 */

const agentKey = "deploy_agent";
const requestKey = "deploy_request";
const failureLogKey = "deploy_failure_log";
const pauseKey = "deploy_pause";

/** The commit this image was built from, when the build was given one. */
export const runningCommit = (): string | null => { const value = process.env.APP_COMMIT?.trim().toLowerCase(); return isCommit(value) ? value : null; };

async function readSetting<T>(db: Queryable, key: string): Promise<T | null> {
  const { rows } = await db.query("SELECT value_json AS value FROM app_settings WHERE setting_key = ?", [key]);
  const value = (rows as { value: unknown }[])[0]?.value;
  if (value === undefined || value === null) return null;
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return null; } }
  return value as T;
}

const writeSetting = (db: Queryable, key: string, value: unknown) =>
  db.query("INSERT INTO app_settings (setting_key, value_json) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET value_json = EXCLUDED.value_json", [key, JSON.stringify(value)]);

export async function getDeployStatus(db: Queryable = getDatabasePool(), now = new Date()): Promise<DeployStatus> {
  const [agent, request, pause, failureLog, runs, schema] = await Promise.all([
    readSetting<DeployAgent>(db, agentKey),
    readSetting<DeployRequest>(db, requestKey),
    readSetting<DeployPause>(db, pauseKey),
    readSetting<DeployFailureLog>(db, failureLogKey),
    db.query("SELECT id, period_key AS \"periodKey\", status, details, started_at AS \"startedAt\", finished_at AS \"finishedAt\" FROM job_runs WHERE job = 'deploy' ORDER BY id DESC LIMIT 10"),
    db.query("SELECT MAX(version)::int AS version FROM schema_migrations").catch(() => ({ rows: [] })),
  ]);
  const commit = runningCommit();
  return {
    commit, schemaVersion: (schema.rows as { version: number | null }[])[0]?.version ?? null,
    agent, agentOnline: Boolean(agent && now.getTime() - new Date(agent.seenAt).getTime() < deployAgentOnlineMs),
    behind: Boolean(agent?.remoteCommit && !sameCommit(agent.remoteCommit, commit)),
    request, failureLog, paused: pause, waiting: Boolean(pause && agent?.remoteCommit && !sameCommit(agent.remoteCommit, commit)),
    runs: (runs.rows as { id: number; periodKey: string; status: string; details: string | null; startedAt: string; finishedAt: string | null }[]).map((run): DeployRun => ({
      id: Number(run.id), commit: run.periodKey.split("-")[0], status: run.status === "success" ? "success" : run.status === "running" ? "running" : "failed", details: run.details,
      startedAt: fromSqlDateTime(run.startedAt) ?? run.startedAt, finishedAt: fromSqlDateTime(run.finishedAt),
    })),
  };
}

/** "Deploy now": the deployer rebuilds on its next check even when the branch has not moved (for example after `.env.local` changed). */
export async function requestDeploy(user: UserAccount, db: Queryable = getDatabasePool(), now = new Date()): Promise<DeployRequest> {
  const request: DeployRequest = { requestedById: user.id, requestedByName: user.name, requestedAt: now.toISOString() };
  await writeSetting(db, requestKey, request);
  await recordAudit(db, { actorId: user.id, action: "deploy.requested", entityType: "job", after: request, details: `${user.name} asked the server to deploy now` }, now);
  return request;
}

/**
 * The pause switch: while paused, a push to the followed branch is not deployed by itself; "deploy now" still works,
 * and the pause stays on afterwards. Resuming lets the deployer catch up with the branch on its next check.
 */
export async function setDeployPaused(paused: boolean, user: UserAccount, db: Queryable = getDatabasePool(), now = new Date()): Promise<DeployPause | null> {
  const before = await readSetting<DeployPause>(db, pauseKey);
  if (paused === (before !== null)) return before;
  if (!paused) {
    await db.query("DELETE FROM app_settings WHERE setting_key = ?", [pauseKey]);
    await recordAudit(db, { actorId: user.id, action: "deploy.resumed", entityType: "job", before, details: `${user.name} resumed automatic deploys` }, now);
    return null;
  }
  const pause: DeployPause = { pausedById: user.id, pausedByName: user.name, pausedAt: now.toISOString() };
  await writeSetting(db, pauseKey, pause);
  await recordAudit(db, { actorId: user.id, action: "deploy.paused", entityType: "job", after: pause, details: `${user.name} paused deploys: pushes wait until a deploy is asked for` }, now);
  return pause;
}

/** One message from the deployer; the answer to `poll` tells it what is running and whether a deploy was asked for. */
export async function recordDeployEvent(event: DeployEvent, db: Queryable = getDatabasePool(), now = new Date()): Promise<Record<string, unknown>> {
  if (event.event === "poll") {
    const agent: DeployAgent = { seenAt: now.toISOString(), repo: event.repo, branch: event.branch, remoteCommit: event.remoteCommit, auto: event.auto };
    await writeSetting(db, agentKey, agent);
    return { commit: runningCommit(), requested: (await readSetting<DeployRequest>(db, requestKey)) !== null, paused: (await readSetting<DeployPause>(db, pauseKey)) !== null };
  }
  if (event.event === "start") {
    // A run cut short (the deployer was stopped mid-deploy) must not stay "running" for ever.
    await db.query("UPDATE job_runs SET status = 'failed', finished_at = ?, details = COALESCE(details, 'Interrupted: the deployer started another deploy') WHERE job = 'deploy' AND status = 'running'", [toSqlDateTime(now)]);
    const created = await db.query("INSERT INTO job_runs (job, period_key, status, details, started_at) VALUES ('deploy', ?, 'running', ?, ?) RETURNING id", [`${shortCommit(event.commit)}-${now.getTime().toString(36)}`, event.reason, toSqlDateTime(now)]);
    await db.query("DELETE FROM app_settings WHERE setting_key = ?", [requestKey]);
    return { runId: insertId(created) };
  }
  // finish: the run the deployer named, else the latest one still open for that commit, else a row of its own.
  const details = `${event.status === "success" ? "Deployed" : "Failed"}: ${event.details || shortCommit(event.commit)}`.slice(0, 500);
  let runId = event.runId;
  if (!runId) {
    const open = await db.query("SELECT id FROM job_runs WHERE job = 'deploy' AND status = 'running' AND period_key LIKE ? ORDER BY id DESC LIMIT 1", [`${shortCommit(event.commit)}-%`]);
    runId = (open.rows as { id: number }[])[0]?.id ?? null;
  }
  if (runId) await db.query("UPDATE job_runs SET status = ?, finished_at = ?, details = ? WHERE id = ? AND job = 'deploy'", [event.status, toSqlDateTime(now), details, runId]);
  else runId = insertId(await db.query("INSERT INTO job_runs (job, period_key, status, details, started_at, finished_at) VALUES ('deploy', ?, ?, ?, ?, ?) RETURNING id", [`${shortCommit(event.commit)}-${now.getTime().toString(36)}`, event.status, details, toSqlDateTime(now), toSqlDateTime(now)]));
  if (event.status === "failed" && event.log) await writeSetting(db, failureLogKey, { runId, commit: event.commit, at: now.toISOString(), log: event.log } satisfies DeployFailureLog);
  await recordAudit(db, { actorId: null, action: "deploy.finished", entityType: "job", entityId: runId, after: { commit: event.commit, status: event.status }, details: `Deploy of ${shortCommit(event.commit)} ${event.status}: ${event.details}`.slice(0, 500) }, now);
  return { runId };
}
