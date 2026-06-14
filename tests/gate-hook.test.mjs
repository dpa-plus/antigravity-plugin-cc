import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setGate } from "../plugins/antigravity/scripts/lib/config.mjs";

const HOOK = fileURLToPath(new URL("../plugins/antigravity/scripts/stop-review-gate-hook.mjs", import.meta.url));
const FAKE_AGY = fileURLToPath(new URL("./fake-agy.mjs", import.meta.url));

before(() => chmodSync(FAKE_AGY, 0o755));

function gitRepo({ dirty }) {
  const dir = mkdtempSync(join(tmpdir(), "agy-gate-git-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const g = (a) => execFileSync("git", a, { cwd: dir, env, encoding: "utf8" });
  g(["init", "-q"]);
  writeFileSync(join(dir, "x.txt"), "one\n");
  g(["add", "."]);
  g(["commit", "-q", "-m", "init"]);
  if (dirty) writeFileSync(join(dir, "x.txt"), "one\ntwo\n");
  return dir;
}

function newHome() {
  return mkdtempSync(join(tmpdir(), "agy-gate-home-"));
}

function runHook(input, { home, mode = "success", reply, noGate } = {}) {
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: home,
    FAKE_AGY_MODE: mode,
  };
  if (reply) env.FAKE_AGY_REPLY = reply;
  if (noGate) env.ANTIGRAVITY_CC_NO_GATE = "1";
  const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), env, encoding: "utf8" });
  return { stdout: res.stdout || "", stderr: res.stderr || "", status: res.status };
}

test("gate off (default): allows stop, emits no decision", () => {
  const home = newHome();
  const cwd = gitRepo({ dirty: true });
  const { stdout, status } = runHook({ cwd, last_assistant_message: "did stuff" }, { home });
  assert.equal(status, 0);
  assert.equal(stdout.trim(), "");
});

test("gate on + BLOCK verdict: blocks the stop with the reason", () => {
  const home = newHome();
  setGate(true, { ANTIGRAVITY_CC_HOME: home });
  const cwd = gitRepo({ dirty: true });
  const { stdout } = runHook(
    { cwd, last_assistant_message: "changed x" },
    { home, reply: "BLOCK: x.txt change drops error handling" },
  );
  const decision = JSON.parse(stdout);
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /drops error handling/);
});

test("gate on + ALLOW verdict: lets the stop through", () => {
  const home = newHome();
  setGate(true, { ANTIGRAVITY_CC_HOME: home });
  const cwd = gitRepo({ dirty: true });
  const { stdout } = runHook({ cwd }, { home, reply: "ALLOW: looks fine" });
  assert.equal(stdout.trim(), "");
});

test("gate on but no working-tree changes: allows without invoking agy", () => {
  const home = newHome();
  setGate(true, { ANTIGRAVITY_CC_HOME: home });
  const cwd = gitRepo({ dirty: false });
  const { stdout } = runHook({ cwd }, { home, reply: "BLOCK: should not be reached" });
  assert.equal(stdout.trim(), "");
});

test("stop_hook_active short-circuits to allow (no re-entrant loop)", () => {
  const home = newHome();
  setGate(true, { ANTIGRAVITY_CC_HOME: home });
  const cwd = gitRepo({ dirty: true });
  const { stdout } = runHook({ cwd, stop_hook_active: true }, { home, reply: "BLOCK: nope" });
  assert.equal(stdout.trim(), "");
});

test("ANTIGRAVITY_CC_NO_GATE=1 hard-disables even when enabled", () => {
  const home = newHome();
  setGate(true, { ANTIGRAVITY_CC_HOME: home });
  const cwd = gitRepo({ dirty: true });
  const { stdout } = runHook({ cwd }, { home, reply: "BLOCK: nope", noGate: true });
  assert.equal(stdout.trim(), "");
});

test("gate on + empty agy output: fail-safe allow (never trap the user)", () => {
  const home = newHome();
  setGate(true, { ANTIGRAVITY_CC_HOME: home });
  const cwd = gitRepo({ dirty: true });
  const { stdout, stderr } = runHook({ cwd }, { home, mode: "empty" });
  assert.equal(stdout.trim(), "");
  assert.match(stderr, /no verdict|allowing stop/i);
});
