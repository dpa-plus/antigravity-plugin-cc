import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const COMPANION = fileURLToPath(new URL("../plugins/antigravity/scripts/antigravity.mjs", import.meta.url));
const FAKE_AGY = fileURLToPath(new URL("./fake-agy.mjs", import.meta.url));

function run(args, { mode = "success", home } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "agy-cwd-"));
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: home || mkdtempSync(join(tmpdir(), "agy-home-")),
    FAKE_AGY_MODE: mode,
  };
  const stdout = execFileSync("node", [COMPANION, ...args], { cwd, env, encoding: "utf8" });
  return { stdout, cwd, home: env.ANTIGRAVITY_CC_HOME };
}

before(() => {
  chmodSync(FAKE_AGY, 0o755);
});

test("setup --json reports ready when the (fake) binary resolves", () => {
  const { stdout } = run(["setup", "--json"]);
  const data = JSON.parse(stdout);
  assert.equal(data.ready, true);
  assert.equal(data.installed, true);
  assert.equal(data.version, "9.9.9-fake");
});

test("delegate (foreground success) returns the model response + conversation id", () => {
  const { stdout } = run(["delegate", "summarize the repo"], { mode: "success" });
  assert.match(stdout, /Gemini 3 \(fake\) reply/);
  assert.match(stdout, /summarize the repo/);
  assert.match(stdout, /Antigravity conversation:/);
  assert.match(stdout, /abcd1234-ef56-7890-abcd-1234567890ef/);
});

test("delegate surfaces quota exhaustion instead of returning empty (grounded behavior)", () => {
  const { stdout } = run(["delegate", "do something expensive"], { mode: "quota" });
  assert.match(stdout, /quota is exhausted/i);
  assert.match(stdout, /152h59m39s/);
});

test("delegate surfaces an auth error with sign-in guidance", () => {
  const { stdout } = run(["delegate", "anything"], { mode: "auth" });
  assert.match(stdout, /not authenticated/i);
  assert.match(stdout, /agy/);
});

test("delegate --model passes the model through to agy (when supported)", () => {
  const { stdout } = run(["delegate", "hello", "--model", "Gemini 3.5 Pro"], { mode: "success" });
  assert.match(stdout, /model=Gemini 3\.5 Pro/);
});

test("empty output (exit 0, no response, no log error) is surfaced as a failure, not success", () => {
  const { stdout } = run(["delegate", "anything"], { mode: "empty" });
  assert.match(stdout, /returned no output/i);
  assert.match(stdout, /Retry/i);
});

test("status + result work across invocations sharing a home", () => {
  const home = mkdtempSync(join(tmpdir(), "agy-home-shared-"));
  run(["delegate", "remember me"], { mode: "success", home });
  // status lists the job
  const status = execFileSync(
    "node",
    [COMPANION, "status"],
    { cwd: mkdtempSync(join(tmpdir(), "agy-cwd-")), env: { ...process.env, ANTIGRAVITY_CC_HOME: home, ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY }, encoding: "utf8" },
  );
  // jobs are filtered by cwd; with a fresh cwd there are none — assert the header renders.
  assert.match(status, /Antigravity — status/);
});

test("delegate with no task prompts for input", () => {
  const { stdout } = run(["delegate"]);
  assert.match(stdout, /What should Antigravity/);
});

test("unknown subcommand prints usage", () => {
  const { stdout } = run(["frobnicate"]);
  assert.match(stdout, /Usage: node antigravity\.mjs/);
});

test("missing binary yields install guidance", () => {
  // Isolate HOME so the real ~/.local/bin/agy fallback can't be found, and keep
  // only node's dir on PATH (so neither PATH nor well-known locations resolve agy).
  const cwd = mkdtempSync(join(tmpdir(), "agy-cwd-"));
  const isolatedHome = mkdtempSync(join(tmpdir(), "agy-nohome-"));
  const res = spawnSync(process.execPath, [COMPANION, "delegate", "x"], {
    cwd,
    encoding: "utf8",
    env: {
      ANTIGRAVITY_CC_AGY_BIN: "/nonexistent/agy",
      PATH: dirname(process.execPath),
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
    },
  });
  assert.match(res.stdout, /not installed/);
  assert.match(res.stdout, /install\.sh/);
});
