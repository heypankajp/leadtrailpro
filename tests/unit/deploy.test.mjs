import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adminSqlEnabled, adminSqlSummary, normalizeAdminSql, parseAdminSql } from "../../src/features/admin/sql-model.ts";
import { parseDeployEvent, sameCommit, shortCommit } from "../../src/features/deploy/model.ts";
import { authenticatedRepoUrl, cleanOutput, decideDeploy, failureSummary, httpsRepoUrl, lastLines, publicRepoUrl } from "../../scripts/lib/deploy-plan.mjs";

const full = "0123456789abcdef0123456789abcdef01234567";
const other = "fedcba9876543210fedcba9876543210fedcba98";

describe("Data corrections through the API (SPEC §6.16)", () => {
  test("one data statement is accepted; apply is off unless it is exactly true", () => {
    assert.deepEqual(parseAdminSql({ sql: "  UPDATE leads SET industry = 'Logistics' WHERE industry = 'Logistic';  " }), { sql: "UPDATE leads SET industry = 'Logistics' WHERE industry = 'Logistic'", apply: false });
    assert.equal(parseAdminSql({ sql: "select 1", apply: true }).apply, true);
    assert.equal(parseAdminSql({ sql: "select 1", apply: "yes" }).apply, false);
    assert.equal(parseAdminSql({ sql: "-- why\n/* and how */ WITH moved AS (DELETE FROM a RETURNING *) SELECT * FROM moved" }).sql.startsWith("WITH moved"), true);
    assert.equal(parseAdminSql({ sql: "explain select 1" }).sql, "explain select 1");
  });

  test("anything that is not a data statement is refused: schema changes, transaction control, blocks, empty input", () => {
    for (const sql of ["DROP TABLE leads", "ALTER TABLE leads ADD x int", "COMMIT", "BEGIN; DELETE FROM leads", "DO $$ BEGIN END $$", "TRUNCATE leads", "SET statement_timeout = 0", "COPY leads TO STDOUT", "-- only a comment", "", "   "]) {
      assert.ok("error" in parseAdminSql({ sql }), `refused: ${sql}`);
    }
    assert.ok("error" in parseAdminSql(null));
    assert.ok("error" in parseAdminSql({ sql: 42 }));
    assert.ok("error" in parseAdminSql({ sql: `select '${"x".repeat(20_001)}'` }));
  });

  test("the statement is normalised, summarised on one line, and the switch is on unless ADMIN_SQL says off", () => {
    assert.equal(normalizeAdminSql("/* a */ -- b\n select 1 ; "), "select 1");
    assert.equal(adminSqlSummary("update leads\n   set a = 1\n where b = 2"), "update leads set a = 1 where b = 2");
    assert.equal(adminSqlSummary("x".repeat(500)).length, 360);
    assert.equal(adminSqlEnabled(undefined), true);
    assert.equal(adminSqlEnabled("on"), true);
    for (const value of ["off", "OFF", "false", "0", "no", " off "]) assert.equal(adminSqlEnabled(value), false);
  });
});

describe("Deploys from a push (SPEC §2.4)", () => {
  test("a full commit id and its abbreviation are the same commit", () => {
    assert.equal(sameCommit(full, full.slice(0, 12)), true);
    assert.equal(sameCommit(full.slice(0, 7), full), true);
    assert.equal(sameCommit(full, other), false);
    assert.equal(sameCommit(full, null), false);
    assert.equal(sameCommit("012", full), false); // too short to mean anything
    assert.equal(shortCommit(full), "0123456789ab");
    assert.equal(shortCommit(null), null);
  });

  test("the deployer's messages are validated", () => {
    assert.deepEqual(parseDeployEvent({ event: "poll", repo: "https://github.com/o/r.git", branch: "", remoteCommit: full, auto: false }), { event: "poll", repo: "https://github.com/o/r.git", branch: "master", remoteCommit: full, auto: false });
    assert.equal(parseDeployEvent({ event: "poll", remoteCommit: "not a commit" }).remoteCommit, null);
    assert.deepEqual(parseDeployEvent({ event: "start", commit: full }), { event: "start", commit: full, reason: "new commit" });
    assert.ok("error" in parseDeployEvent({ event: "start", commit: "zzz" }));
    assert.deepEqual(parseDeployEvent({ event: "finish", runId: "7", commit: full, status: "failed", details: "build: boom", log: "line 1\nline 2" }), { event: "finish", runId: 7, commit: full, status: "failed", details: "build: boom", log: "line 1\nline 2" });
    assert.equal(parseDeployEvent({ event: "finish", commit: full, status: "failed", log: `start${"x".repeat(9000)}end` }).log.endsWith("end"), true); // the end of a long log is what is kept
    assert.equal(parseDeployEvent({ event: "finish", commit: full, status: "failed", log: `start${"x".repeat(9000)}end` }).log.length, 8000);
    assert.equal(parseDeployEvent({ event: "finish", commit: full, status: "success" }).runId, null);
    assert.ok("error" in parseDeployEvent({ event: "finish", commit: full, status: "maybe" }));
    assert.ok("error" in parseDeployEvent({ event: "restart" }));
    assert.ok("error" in parseDeployEvent(null));
  });

  test("a moved branch deploys; the same commit, a failed commit, and an unreadable repository do not", () => {
    const base = { remote: full, running: full, reachable: true, attempted: full, failed: null, requested: false, auto: true };
    assert.equal(decideDeploy(base).deploy, false);
    assert.equal(decideDeploy({ ...base, running: full.slice(0, 12) }).deploy, false);
    assert.equal(decideDeploy({ ...base, running: other }).deploy, true);
    assert.equal(decideDeploy({ ...base, running: null }).deploy, true); // an image built by hand carries no commit
    assert.equal(decideDeploy({ ...base, running: other, failed: full }).deploy, false);
    assert.equal(decideDeploy({ ...base, remote: null, requested: true }).deploy, false);
  });

  test("a request deploys the same commit and a failed one; automatic deploys can be switched off", () => {
    const base = { remote: full, running: full, reachable: true, attempted: full, failed: full, requested: true, auto: true };
    assert.equal(decideDeploy(base).deploy, true);
    assert.equal(decideDeploy({ ...base, auto: false }).deploy, true);
    assert.equal(decideDeploy({ ...base, requested: false, running: other, failed: null, auto: false }).deploy, false);
  });

  test("an app that does not answer is judged by the last attempt, so a push can repair a broken deploy", () => {
    const down = { remote: full, running: null, reachable: false, failed: null, requested: false, auto: true };
    assert.equal(decideDeploy({ ...down, attempted: null }).deploy, false); // first start: the app is still coming up
    assert.equal(decideDeploy({ ...down, attempted: full }).deploy, false); // already tried this commit
    assert.equal(decideDeploy({ ...down, attempted: other }).deploy, true); // a newer commit is the repair
  });

  test("repository addresses: SSH forms become HTTPS, a token goes in for git only, and nothing secret is shown", () => {
    assert.equal(httpsRepoUrl("git@github.com:owner/name.git"), "https://github.com/owner/name.git");
    assert.equal(httpsRepoUrl("ssh://git@github.com/owner/name.git"), "https://github.com/owner/name.git");
    assert.equal(httpsRepoUrl("https://github.com/owner/name.git"), "https://github.com/owner/name.git");
    assert.equal(authenticatedRepoUrl("https://github.com/owner/name.git", "tok123"), "https://x-access-token:tok123@github.com/owner/name.git");
    assert.equal(authenticatedRepoUrl("https://github.com/owner/name.git", ""), "https://github.com/owner/name.git");
    assert.equal(authenticatedRepoUrl("file:///host/remote.git", "tok123"), "file:///host/remote.git");
    assert.equal(publicRepoUrl("https://x-access-token:tok123@github.com/owner/name.git"), "https://github.com/owner/name.git");
    assert.equal(lastLines("a\n\n b \nc\n", 2), "b | c");
    assert.equal(lastLines("x".repeat(1000), 6, 100).length, 100);
  });

  test("a failed build is summarised by the lines that say what went wrong, not by the noise after them", () => {
    const output = [
      "#20 12.62 \u001b[31m\u001b[1m>\u001b[0m Build error occurred",
      "#20 12.62 ./src/lib/jobs-key.ts:16:22",
      "#20 12.62   \u001b[90m16 |\u001b[0m export const broken: = ;",
      "#20 12.62 Parsing ecmascript source code failed",
      "#20 12.62     at ignore-listed frames",
      "#20 12.68 npm notice",
      "#20 12.68 npm notice New major version of npm available! 10.9.9 -> 12.2.2",
      "#20 ERROR: process \"/bin/sh -c npm run build\" did not complete successfully: exit code: 1",
      "------",
      " > [app builder 4/4] RUN npm run build:",
      "12.62 Parsing ecmascript source code failed",
      "12.68 npm notice To update run: npm install -g npm@12.2.2",
      "------",
      "target app: failed to solve: process \"/bin/sh -c npm run build\" did not complete successfully: exit code: 1",
    ].join("\n");
    const cleaned = cleanOutput(output);
    assert.doesNotMatch(cleaned, /npm notice|\u001b|^-+$/m);
    assert.match(cleaned, /^\.\/src\/lib\/jobs-key\.ts:16:22$/m);
    const summary = failureSummary(output);
    assert.match(summary, /\.\/src\/lib\/jobs-key\.ts:16:22 \| Parsing ecmascript source code failed/);
    assert.match(summary, /failed to solve/);
    assert.doesNotMatch(summary, /npm notice/);
    assert.equal(summary.split("Parsing ecmascript source code failed").length, 2, "a repeated line is kept once");
    assert.equal(failureSummary("all good\nnothing to see"), "all good | nothing to see");
  });

  test("while deploys are paused a moved branch waits; a request still deploys, and the pause does not hide other reasons", () => {
    const remote = "a".repeat(40);
    const running = "b".repeat(40);
    const base = { remote, running, reachable: true, attempted: null, failed: null, requested: false, auto: true };
    assert.deepEqual(decideDeploy({ ...base, paused: true }), { deploy: false, reason: "deploys are paused in the app; a pushed version waits until a deploy is asked for" });
    assert.equal(decideDeploy({ ...base, paused: true, requested: true }).deploy, true);
    assert.equal(decideDeploy({ ...base, paused: false }).deploy, true);
    assert.equal(decideDeploy(base).deploy, true, "not paused unless said so");
    assert.equal(decideDeploy({ ...base, paused: true, auto: false }).reason, "automatic deploys are off");
    assert.equal(decideDeploy({ ...base, paused: true, remote: null }).reason, "the repository could not be read");
  });
});
