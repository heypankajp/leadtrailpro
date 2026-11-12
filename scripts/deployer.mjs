/**
 * LeadTrailPro deployer (compose.prod.yaml `deployer`, SPEC §2.4): keeps the server on the repository's branch so a
 * push is all a release needs. Every DEPLOY_INTERVAL_SECONDS it reads the branch's commit and asks the app what is
 * running; when they differ, or an administrator asked for a deploy (`POST /api/deploy`), it updates its own clone,
 * rebuilds the images through the host's Docker socket, and brings the stack up: the `migrate` service upgrades the
 * database, then the app and the scheduler restart. It reports the start and the result to the app and never retries
 * a commit that failed until the branch moves again or a deploy is asked for.
 *
 * It works in a clone of its own (the /work volume), not in the server's folder: that folder is mounted read-only at
 * /host and only supplies `.env`, `.env.local`, and the repository address. After a deploy the process exits and the
 * container's restart policy starts it again, so the deployer always runs the code it just deployed.
 *
 *   DEPLOY_REPO              repository address (default: the origin of the server's folder)
 *   DEPLOY_BRANCH            branch to follow (default master)
 *   DEPLOY_GIT_TOKEN         read token for a private repository (GitHub fine-grained token, Contents: read)
 *   DEPLOY_AUTO              off = deploy only when asked (default on)
 *   DEPLOY_INTERVAL_SECONDS  seconds between checks (default 60, at least 15)
 *   DEPLOY_PROJECT           compose project name (default leadtrailpro)
 *   JOBS_KEY                 the app's JOBS_KEY (required)
 */
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { authenticatedRepoUrl, cleanOutput, decideDeploy, failureSummary, isOff, lastLines, publicRepoUrl, sameCommit } from "./lib/deploy-plan.mjs";

const hostDir = process.env.DEPLOY_HOST_DIR || "/host";
const workDir = process.env.DEPLOY_WORK_DIR || "/work";
const repoDir = path.join(workDir, "repo");
const stateFile = path.join(workDir, "state.json");
const branch = process.env.DEPLOY_BRANCH?.trim() || "master";
const project = process.env.DEPLOY_PROJECT?.trim() || "leadtrailpro";
const composeFiles = (process.env.DEPLOY_COMPOSE_FILES || "compose.yaml,compose.prod.yaml").split(",").map((file) => file.trim()).filter(Boolean);
const buildServices = ["migrate", "app", "jobs"];
const upServices = ["db", "migrate", "app", "jobs"];
const appUrl = (process.env.DEPLOY_APP_URL || "http://app:3000").replace(/\/$/, "");
const jobsKey = process.env.JOBS_KEY?.trim();
const every = Math.max(15, Number(process.env.DEPLOY_INTERVAL_SECONDS || "60")) * 1000;
const verifySeconds = Math.max(30, Number(process.env.DEPLOY_VERIFY_SECONDS || "300"));
const auto = !isOff(process.env.DEPLOY_AUTO);

const log = (message) => console.log(`${new Date().toISOString()} deployer: ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (file) => stat(file).then(() => true, () => false);

if (!jobsKey) { console.error("deployer: JOBS_KEY is required (the same value the app has)."); process.exit(1); }

/** Runs a command, echoing its output; resolves with the exit code and the output's tail. Secrets in `hide` are masked. */
function run(command, args, { cwd, env, hide = [], quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const take = (chunk) => {
      let text = chunk.toString();
      for (const secret of hide) if (secret) text = text.split(secret).join("***");
      output = (output + text).slice(-20_000);
      if (!quiet) process.stdout.write(text);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (error) => resolve({ code: 127, output: `${output}\n${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function readState() {
  try { return JSON.parse(await readFile(stateFile, "utf8")); } catch { return {}; }
}
const writeState = (state) => writeFile(stateFile, JSON.stringify(state, null, 2));

/** One message to the app; null when it does not answer. */
async function tell(body) {
  try {
    const response = await fetch(`${appUrl}/api/deploy/agent`, { method: "POST", headers: { "Content-Type": "application/json", "X-Jobs-Key": jobsKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function repositoryAddress() {
  const configured = process.env.DEPLOY_REPO?.trim();
  if (configured) return configured;
  const { code, output } = await run("git", ["config", "--file", path.join(hostDir, ".git", "config"), "--get", "remote.origin.url"], { quiet: true });
  return code === 0 ? output.trim() : "";
}

const compose = (args, env, hide) => run("docker", ["compose", "-p", project, ...composeFiles.flatMap((file) => ["-f", file]), ...args], { cwd: repoDir, env, hide });

/** Brings the clone to the commit, copies the server's settings next to it, builds, and starts the stack. */
async function deploy(commit, address, hide) {
  const git = (args, options = {}) => run("git", args, { hide, ...options });
  if (!(await exists(path.join(repoDir, ".git")))) {
    const cloned = await git(["clone", "--branch", branch, "--single-branch", address, repoDir]);
    if (cloned.code !== 0) return { ok: false, step: "clone", output: cloned.output };
  } else {
    await git(["-C", repoDir, "remote", "set-url", "origin", address], { quiet: true });
    const fetched = await git(["-C", repoDir, "fetch", "--prune", "origin", branch]);
    if (fetched.code !== 0) return { ok: false, step: "fetch", output: fetched.output };
  }
  const checkedOut = await git(["-C", repoDir, "checkout", "--force", "--detach", commit]);
  if (checkedOut.code !== 0) return { ok: false, step: "checkout", output: checkedOut.output };
  await git(["-C", repoDir, "clean", "-fdx", "-e", ".env", "-e", ".env.local"], { quiet: true });
  // The server's own settings: `.env` (compose variables) and `.env.local` (the app's), as they are now.
  for (const file of [".env", ".env.local"]) {
    if (await exists(path.join(hostDir, file))) await copyFile(path.join(hostDir, file), path.join(repoDir, file));
  }
  const built = await compose(["build", ...buildServices], { GIT_COMMIT: commit }, hide);
  if (built.code !== 0) return { ok: false, step: "build", output: built.output };
  const started = await compose(["up", "-d", "--no-build", ...upServices], { GIT_COMMIT: commit }, hide);
  if (started.code !== 0) return { ok: false, step: "start (database upgrade or containers)", output: started.output };
  // The new app answers with the commit it was built from.
  const deadline = Date.now() + verifySeconds * 1000;
  while (Date.now() < deadline) {
    const answer = await tell({ event: "poll", repo: publicRepoUrl(address), branch, remoteCommit: commit, auto });
    if (answer && sameCommit(answer.commit, commit)) return { ok: true, step: "done", output: "" };
    await sleep(5000);
  }
  return { ok: false, step: "check", output: `The app did not report commit ${commit.slice(0, 12)} within ${verifySeconds} seconds.` };
}

async function check() {
  const state = await readState();
  const source = await repositoryAddress();
  if (!source) { log("no repository address: set DEPLOY_REPO in .env, or keep the server's folder a git clone"); return; }
  const address = authenticatedRepoUrl(source, process.env.DEPLOY_GIT_TOKEN);
  const hide = [process.env.DEPLOY_GIT_TOKEN?.trim(), address === publicRepoUrl(address) ? "" : address];
  const listed = await run("git", ["ls-remote", address, `refs/heads/${branch}`], { hide, quiet: true });
  const remote = listed.code === 0 ? (/^[0-9a-f]{40}/.exec(listed.output.trim())?.[0] ?? null) : null;
  if (!remote) log(`could not read ${branch} of ${publicRepoUrl(address)}: ${lastLines(listed.output, 2) || "no such branch"}`);

  // A result the app could not be told (it was down): tell it now.
  if (state.unreported && (await tell({ event: "finish", ...state.unreported }))) { delete state.unreported; await writeState(state); }

  const answer = await tell({ event: "poll", repo: publicRepoUrl(address), branch, remoteCommit: remote, auto });
  const decision = decideDeploy({ remote, running: answer?.commit ?? null, reachable: answer !== null, attempted: state.attempted ?? null, failed: state.failed ?? null, requested: answer?.requested === true, auto });
  if (!decision.deploy) {
    if (decision.reason !== state.lastReason) { log(decision.reason); state.lastReason = decision.reason; await writeState(state); }
    return;
  }

  log(`deploying ${remote.slice(0, 12)} (${decision.reason})`);
  const started = await tell({ event: "start", commit: remote, reason: decision.reason });
  state.attempted = remote;
  delete state.failed;
  delete state.lastReason;
  await writeState(state);
  const result = await deploy(remote, address, hide);
  // A failure travels with the end of the step's output, so it can be read from another machine (GET /api/deploy).
  const report = result.ok
    ? { runId: started?.runId ?? null, commit: remote, status: "success", details: `${remote.slice(0, 12)} (${decision.reason})` }
    : { runId: started?.runId ?? null, commit: remote, status: "failed", details: `${result.step}: ${failureSummary(result.output)}`, log: cleanOutput(result.output).slice(-6000) };
  if (!result.ok) state.failed = remote;
  if (!(await tell({ event: "finish", ...report }))) state.unreported = report;
  await writeState(state);
  log(result.ok ? `deployed ${remote.slice(0, 12)}` : `deploy of ${remote.slice(0, 12)} failed at ${result.step}; the previous containers keep running where they could`);
  if (result.ok) {
    // Old images of earlier deploys would fill the disk.
    await run("docker", ["image", "prune", "-f"], { quiet: true });
    // Start again from the code that was just deployed.
    process.exit(0);
  }
}

await mkdir(workDir, { recursive: true });
// The clone and a file:// test repository may belong to another user id than this process.
await run("git", ["config", "--global", "--add", "safe.directory", "*"], { quiet: true });
log(`following ${branch} every ${every / 1000}s (project ${project}; automatic deploys ${auto ? "on" : "off"})`);
for (;;) {
  try { await check(); } catch (error) { log(`check failed: ${error instanceof Error ? error.message : error}`); }
  await sleep(every);
}
