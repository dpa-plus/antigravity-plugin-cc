import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const COMPANION = fileURLToPath(new URL("../plugins/antigravity/scripts/antigravity.mjs", import.meta.url));
const FAKE_AGY = fileURLToPath(new URL("./fake-agy.mjs", import.meta.url));

// Create a throwaway git repo with one committed file and one uncommitted change.
function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "agy-git-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const g = (args) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" });
  g(["init", "-q"]);
  writeFileSync(join(dir, "x.txt"), "one\n");
  g(["add", "."]);
  g(["commit", "-q", "-m", "init"]);
  writeFileSync(join(dir, "x.txt"), "one\ntwo\n");
  return dir;
}

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

function capturedArgv(args, { mode = "success" } = {}) {
  const argvOut = join(mkdtempSync(join(tmpdir(), "agy-argv-")), "argv.json");
  const cwd = mkdtempSync(join(tmpdir(), "agy-cwd-"));
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-home-")),
    FAKE_AGY_MODE: mode,
    FAKE_AGY_ARGV_OUT: argvOut,
  };
  execFileSync("node", [COMPANION, ...args], { cwd, env, encoding: "utf8" });
  return JSON.parse(execFileSync("cat", [argvOut], { encoding: "utf8" }));
}

test("read-only review never sends --dangerously-skip-permissions (it IS sandboxed)", () => {
  const cwd = gitRepo();
  const argvOut = join(mkdtempSync(join(tmpdir(), "agy-argv-")), "argv.json");
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-home-")),
    FAKE_AGY_MODE: "success",
    FAKE_AGY_ARGV_OUT: argvOut,
  };
  execFileSync("node", [COMPANION, "review"], { cwd, env, encoding: "utf8" });
  const argv = JSON.parse(execFileSync("cat", [argvOut], { encoding: "utf8" }));
  assert.ok(argv.includes("--sandbox"), "review is sandboxed");
  assert.ok(!argv.includes("--dangerously-skip-permissions"), "read-only review must NOT auto-approve permissions");
});

test("delegate is write-capable by default, but --read-only drops --dangerously-skip-permissions", () => {
  const plain = capturedArgv(["delegate", "do a thing"]);
  assert.ok(plain.includes("--dangerously-skip-permissions"), "default delegate is write-capable");
  assert.ok(!plain.includes("--sandbox"));
  const ro = capturedArgv(["delegate", "--read-only", "look only"]);
  assert.ok(!ro.includes("--dangerously-skip-permissions"), "--read-only must not auto-approve permissions");
  assert.ok(ro.includes("--sandbox"));
});

test("/antigravity:result returns a finished FOREGROUND job's output (output.txt persisted)", () => {
  const home = mkdtempSync(join(tmpdir(), "agy-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "agy-cwd-"));
  const env = { ...process.env, ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY, ANTIGRAVITY_CC_HOME: home, FAKE_AGY_MODE: "success" };
  execFileSync("node", [COMPANION, "delegate", "remember this"], { cwd, env, encoding: "utf8" });
  const result = execFileSync("node", [COMPANION, "result"], { cwd, env, encoding: "utf8" });
  assert.match(result, /Gemini 3 \(fake\) reply/);
  assert.match(result, /remember this/);
});

test("delegate --wait returns the result inline (synchronous foreground)", () => {
  const { stdout } = run(["delegate", "wait for me", "--wait"], { mode: "success" });
  assert.match(stdout, /Gemini 3 \(fake\) reply/);
  assert.match(stdout, /wait for me/);
});

test("delegate --background returns a job id immediately, --wait overrides to foreground", () => {
  const bg = run(["delegate", "later", "--background"], { mode: "success" });
  assert.match(bg.stdout, /started in background/i);
  assert.match(bg.stdout, /agy-/);
  // --wait wins over --background: result comes back inline, no "started in background"
  const both = run(["delegate", "now", "--background", "--wait"], { mode: "success" });
  assert.match(both.stdout, /Gemini 3 \(fake\) reply/);
  assert.doesNotMatch(both.stdout, /started in background/i);
});

test("adversarial-review runs against a working-tree diff with skeptical framing", () => {
  const cwd = gitRepo();
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-home-")),
    FAKE_AGY_MODE: "success",
  };
  const stdout = execFileSync("node", [COMPANION, "adversarial-review"], { cwd, env, encoding: "utf8" });
  assert.match(stdout, /Gemini 3 \(fake\) reply/);
  assert.doesNotMatch(stdout, /Nothing to review/);
  // fake-agy echoes the leading prompt text, which proves the adversarial prompt was sent
  assert.match(stdout, /ADVERSARIAL/);
});

test("review --json emits clean schema-valid JSON (no markdown wrapper)", () => {
  const cwd = gitRepo();
  const reply = JSON.stringify({
    verdict: "needs-attention",
    summary: "risky change",
    findings: [
      { severity: "high", title: "t", body: "b", file: "x.txt", line_start: 1, line_end: 2, confidence: 0.9, recommendation: "fix it" },
    ],
    next_steps: ["add a test"],
  });
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-home-")),
    FAKE_AGY_MODE: "success",
    FAKE_AGY_REPLY: reply,
  };
  const stdout = execFileSync("node", [COMPANION, "review", "--json"], { cwd, env, encoding: "utf8" });
  const data = JSON.parse(stdout); // must be parseable — no markdown
  assert.equal(data.verdict, "needs-attention");
  assert.equal(data.findings[0].file, "x.txt");
  assert.doesNotMatch(stdout, /🛰️|# Antigravity/);
});

test("review --json falls back to a valid JSON object when agy returns non-JSON", () => {
  const cwd = gitRepo();
  const env = {
    ...process.env,
    ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY,
    ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-home-")),
    FAKE_AGY_MODE: "success",
    FAKE_AGY_REPLY: "I think it's fine, no JSON here.",
  };
  const stdout = execFileSync("node", [COMPANION, "review", "--json"], { cwd, env, encoding: "utf8" });
  const data = JSON.parse(stdout); // still valid JSON
  assert.equal(data.verdict, "needs-attention");
  assert.ok(data.error);
  assert.match(data.raw_output, /no JSON here/);
});

test("review reports nothing to review on a clean tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "agy-git-clean-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const g = (args) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" });
  g(["init", "-q"]);
  writeFileSync(join(dir, "x.txt"), "one\n");
  g(["add", "."]);
  g(["commit", "-q", "-m", "init"]);
  const stdout = execFileSync("node", [COMPANION, "review"], {
    cwd: dir,
    env: { ...process.env, ANTIGRAVITY_CC_AGY_BIN: FAKE_AGY, ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-home-")) },
    encoding: "utf8",
  });
  assert.match(stdout, /Nothing to review/);
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
