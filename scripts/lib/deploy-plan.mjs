/**
 * Pure rules of the deployer (scripts/deployer.mjs, SPEC §2.4): whether to deploy, and how the repository address is
 * formed and shown. No Node or app imports beyond the language, so tests/unit loads this file directly.
 */

export const isOff = (value) => /^(off|false|0|no)$/i.test(String(value ?? "").trim());
export const sameCommit = (a, b) => Boolean(a && b && a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a)));

/**
 * What to do on one check.
 *   remote     the branch's commit on the repository (null: could not be read)
 *   running    the commit the app reports (null: the app answered but its image carries none)
 *   reachable  whether the app answered at all
 *   attempted  the commit of the deployer's last attempt, kept across restarts
 *   failed     the commit whose last attempt failed (not retried by itself)
 *   requested  an administrator asked for a deploy now
 *   auto       whether a moved branch deploys by itself
 */
export function decideDeploy({ remote, running, reachable, attempted, failed, requested, auto }) {
  if (!remote) return { deploy: false, reason: "the repository could not be read" };
  if (requested) return { deploy: true, reason: "asked for by an administrator" };
  if (!auto) return { deploy: false, reason: "automatic deploys are off" };
  if (sameCommit(failed, remote)) return { deploy: false, reason: "the last deploy of this commit failed; push a fix or ask for a deploy" };
  // An app that does not answer is judged by what was last attempted, so a push can still repair a broken deploy.
  const current = reachable ? running : attempted;
  if (sameCommit(current, remote)) return { deploy: false, reason: "up to date" };
  if (!reachable && !attempted) return { deploy: false, reason: "the app is not answering yet" };
  return { deploy: true, reason: current ? "the branch moved" : "the running image carries no commit" };
}

/** `git@github.com:owner/name.git` and `ssh://git@github.com/owner/name.git` as HTTPS; anything else unchanged. */
export function httpsRepoUrl(url) {
  const text = String(url ?? "").trim();
  const scp = /^git@([^:]+):(.+)$/.exec(text);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  const ssh = /^ssh:\/\/git@([^/]+)\/(.+)$/.exec(text);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return text;
}

/** The address git is given: a private repository's read token goes in as the HTTPS user. */
export function authenticatedRepoUrl(url, token) {
  const base = httpsRepoUrl(url);
  const secret = String(token ?? "").trim();
  if (!secret || !/^https:\/\//i.test(base)) return base;
  const parsed = new URL(base);
  parsed.username = "x-access-token";
  parsed.password = secret;
  return parsed.toString();
}

/** The address as it may be logged or sent to the app: no credentials. */
export function publicRepoUrl(url) {
  const base = httpsRepoUrl(url);
  try {
    const parsed = new URL(base);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return base;
  }
}

/** Command output as plain lines: no colour codes, no build-step and timing prefixes ("#20 12.62 "), no npm notices or rules. */
export function cleanOutput(text) {
  return String(text ?? "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#\d+\s+(?=\d+\.\d+\s|ERROR|CANCELED|DONE|\[)/, "").replace(/^\d+\.\d+\s?/, "").trimEnd())
    .filter((line) => line.trim() && !/^\s*npm notice\b/i.test(line) && !/^-{3,}$/.test(line.trim()))
    .join("\n");
}

/** The end of a long output, for the one-line result kept with the deploy. */
export function lastLines(text, lines = 6, max = 420) {
  const kept = cleanOutput(text).split("\n").map((line) => line.trim()).filter(Boolean).slice(-lines).join(" | ");
  return kept.length > max ? `…${kept.slice(kept.length - max + 1)}` : kept;
}

/**
 * Why a step failed, in one line: the lines of its output that name a source position ("./src/x.ts:16:22") or say what
 * went wrong, each once, the last few of them; the plain end of the output when nothing of the kind is found.
 */
export function failureSummary(text, max = 420) {
  const telling = /^\.{0,2}\/?[\w@.[\]()/-]+:\d+:\d+|\b(error|failed|cannot|could not|not found|denied|invalid|unable|refused|timed out|no such)\b/i;
  const seen = new Set();
  const lines = cleanOutput(text).split("\n").map((line) => line.trim()).filter((line) => telling.test(line) && !seen.has(line) && seen.add(line));
  if (!lines.length) return lastLines(text, 6, max);
  const kept = lines.slice(-5).join(" | ");
  return kept.length > max ? `${kept.slice(0, max - 1)}…` : kept;
}
