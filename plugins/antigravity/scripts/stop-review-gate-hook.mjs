#!/usr/bin/env node
// Stop hook: opt-in cross-model review gate. When enabled, agy (Gemini 3.5) reviews the
// working-tree diff of the turn that is ending; a BLOCK verdict blocks the stop so Claude
// keeps working, an ALLOW lets it finish.
//
// FAIL-SAFE: anything that isn't an explicit, parseable BLOCK -> allow. A broken gate
// (agy missing, quota, timeout, garbled output) must never trap the user. Disable
// entirely with ANTIGRAVITY_CC_NO_GATE=1 or `/antigravity:setup --disable-gate`.

import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { resolveAgyBinary, gateLogPath } from "./lib/paths.mjs";
import { isGateEnabled } from "./lib/config.mjs";
import { resolveReviewTarget } from "./lib/git.mjs";
import { buildPrintArgs, runForeground, goDurationToMs } from "./lib/agy.mjs";
import { scanAgyLog } from "./lib/logscan.mjs";
import { buildGatePrompt, parseGateDecision } from "./lib/gate.mjs";

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function allow(note) {
  if (note) process.stderr.write(`${note}\n`);
  process.exit(0);
}

function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  process.exit(0);
}

function main() {
  const input = readInput();

  // Never re-enter our own gate (Claude Code re-invokes Stop after a block).
  if (input.stop_hook_active) return allow();
  if (!isGateEnabled()) return allow();

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const bin = resolveAgyBinary();
  if (!bin) return allow("[antigravity gate] agy not installed — skipping review gate.");

  // Only gate real code changes. No working-tree diff -> nothing to review.
  const target = resolveReviewTarget(cwd, null);
  if (!target.ok) return allow();

  const prompt = buildGatePrompt(target, String(input.last_assistant_message || ""));
  const printTimeout = process.env.ANTIGRAVITY_CC_GATE_TIMEOUT || "5m";
  const logFile = gateLogPath();
  try {
    mkdirSync(dirname(logFile), { recursive: true });
  } catch {
    /* ignore */
  }

  const args = buildPrintArgs({
    prompt,
    addDirs: [cwd],
    sandbox: true, // read-only: the gate must never modify the tree
    yolo: false,
    logFile,
    printTimeout,
  });

  const result = runForeground({
    bin: bin.path,
    args,
    cwd,
    logFile,
    watchdogMs: goDurationToMs(printTimeout) + 60_000,
  });

  const text = (result.stdout || "").trim();
  if (!text) {
    const scan = scanAgyLog(result.logText);
    const why = result.timedOut ? "review timed out" : scan.error ? scan.error.kind : "no output";
    return allow(`[antigravity gate] no verdict (${why}) — allowing stop.`);
  }

  const decision = parseGateDecision(text);
  if (decision.block) {
    return block(
      `Antigravity (Gemini 3.5) review gate blocked stopping: ${decision.reason} ` +
        "Address it, or run `/antigravity:setup --disable-gate` (or set ANTIGRAVITY_CC_NO_GATE=1) to bypass.",
    );
  }
  return allow();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // Fail open — a crashing gate must not block the user.
  allow(`[antigravity gate] error: ${message} — allowing stop.`);
}
