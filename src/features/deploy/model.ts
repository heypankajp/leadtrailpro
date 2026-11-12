/**
 * Deploys from a push (SPEC §2.4): the `deployer` container on the server watches the repository's branch, rebuilds
 * the stack when it moves or when an administrator asks, and tells the app what it did. Pure rules shared by the API:
 * the events the deployer sends and how commits are compared. No app imports, so the unit tests load this directly.
 */

export const isCommit = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{7,40}$/.test(value);
/** Two spellings of one commit: a full id and its abbreviation match. */
export const sameCommit = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a)));
export const shortCommit = (commit: string | null | undefined) => (commit ? commit.slice(0, 12) : null);

/** What the deployer last told the app about itself. */
export type DeployAgent = { seenAt: string; repo: string; branch: string; remoteCommit: string | null; auto: boolean };
export type DeployRequest = { requestedById: number; requestedByName: string; requestedAt: string };
export type DeployRun = { id: number; commit: string; status: "running" | "success" | "failed"; details: string | null; startedAt: string; finishedAt: string | null };
export type DeployStatus = {
  /** The commit the running app was built from; null when the image was built by hand without GIT_COMMIT. */
  commit: string | null;
  schemaVersion: number | null;
  /** Null until a deployer has checked in. */
  agent: DeployAgent | null;
  /** Whether the deployer checked in within the last five minutes. */
  agentOnline: boolean;
  /** Whether the branch has moved past the running commit (the deployer will pick it up on its next check). */
  behind: boolean;
  request: DeployRequest | null;
  runs: DeployRun[];
  /** The end of the output of the most recent failed deploy, so a failure can be diagnosed without access to the server. */
  failureLog: DeployFailureLog | null;
};
export type DeployFailureLog = { runId: number; commit: string; at: string; log: string };

export const deployAgentOnlineMs = 5 * 60_000;
export const deployLogMaxLength = 8000;

export type DeployEvent =
  | { event: "poll"; repo: string; branch: string; remoteCommit: string | null; auto: boolean }
  | { event: "start"; commit: string; reason: string }
  | { event: "finish"; runId: number | null; commit: string; status: "success" | "failed"; details: string; log: string };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The deployer's messages: `poll` (its heartbeat, answered with the running commit and any request), `start`, `finish`. */
export function parseDeployEvent(body: Record<string, unknown> | null): DeployEvent | { error: string } {
  if (body?.event === "poll") {
    return { event: "poll", repo: text(body.repo, 200), branch: text(body.branch, 100) || "master", remoteCommit: isCommit(body.remoteCommit) ? body.remoteCommit : null, auto: body.auto !== false };
  }
  if (body?.event === "start") {
    if (!isCommit(body.commit)) return { error: "start needs the commit being deployed." };
    return { event: "start", commit: body.commit, reason: text(body.reason, 120) || "new commit" };
  }
  if (body?.event === "finish") {
    if (!isCommit(body.commit)) return { error: "finish needs the commit that was deployed." };
    if (body.status !== "success" && body.status !== "failed") return { error: "finish needs status success or failed." };
    const runId = Number(body.runId);
    // The log is the end of the failed step's output: keep its end.
    return { event: "finish", runId: Number.isSafeInteger(runId) && runId > 0 ? runId : null, commit: body.commit, status: body.status, details: text(body.details, 480), log: typeof body.log === "string" ? body.log.slice(-deployLogMaxLength) : "" };
  }
  return { error: "Unknown event: send poll, start, or finish." };
}
