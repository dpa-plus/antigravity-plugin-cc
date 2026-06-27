#!/usr/bin/env node
// Antigravity companion for Claude Code.
//
// Thin, dependency-free runtime that drives the `agy` CLI (Google Antigravity,
// Gemini 3) in print mode and manages background jobs. Each subcommand prints
// Markdown that the calling slash command / subagent relays to the user verbatim.
//
// Subcommands: setup | delegate | review | resume | status | result | cancel
//   (aliases: run -> delegate)

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseArgs, hasFlag } from "./lib/args.mjs";
import { resolveAgyBinary, agyConfigDir } from "./lib/paths.mjs";
import {
  buildPrintArgs,
  runForeground,
  spawnBackground,
  goDurationToMs,
  agyVersion,
  agySupportsModel,
  readLogSafe,
} from "./lib/agy.mjs";
import { scanAgyLog } from "./lib/logscan.mjs";
import { resolveReviewTarget } from "./lib/git.mjs";
import { buildReviewPrompt, buildAdversarialReviewPrompt, parseReviewJson } from "./lib/review.mjs";
import { isGateEnabled, setGate } from "./lib/config.mjs";
import {
  createJob,
  writeJob,
  readJob,
  reconcile,
  listJobs,
  latestJob,
  cancelJob,
} from "./lib/jobs.mjs";
import * as render from "./lib/render.mjs";
import { clampPrompt } from "./lib/text.mjs";

function out(text) {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function requireBinaryOrExit() {
  const bin = resolveAgyBinary();
  if (!bin) {
    out(render.renderNotInstalled());
    process.exit(0);
  }
  return bin;
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
function cmdSetup(parsed) {
  // Stop-review-gate toggle (opt-in). Applied before reporting so the new state shows.
  if (hasFlag(parsed, "enable-gate")) setGate(true);
  if (hasFlag(parsed, "disable-gate")) setGate(false);
  const gateOn = isGateEnabled();

  const bin = resolveAgyBinary();
  const configDir = agyConfigDir();
  const configExists = existsSync(configDir);
  const installationId = existsSync(join(configDir, "installation_id"));
  const hasConversations =
    existsSync(join(configDir, "conversations")) &&
    // agy 1.0.8+ stores conversations as SQLite *.db; older builds used *.pb.
    safeReaddir(join(configDir, "conversations")).some((f) => f.endsWith(".db") || f.endsWith(".pb"));

  const version = bin ? agyVersion(bin.path) : null;
  // Best-effort auth signal: we never log you in. Presence of prior threads or an
  // installation id strongly suggests a completed sign-in.
  const authedGuess = configExists && (installationId || hasConversations);

  const report = {
    ready: Boolean(bin),
    binary: { found: Boolean(bin), detail: bin ? `${bin.path} (${bin.source})` : "not found" },
    version,
    configDir: { exists: configExists, detail: configExists ? configDir : `${configDir} (missing)` },
    auth: {
      detail: !bin
        ? "n/a (install agy first)"
        : authedGuess
          ? "looks configured (a prior signed-in session was found)"
          : "no prior session detected — run `! agy` once to sign in",
    },
    gate: gateOn,
    nextSteps: [],
  };

  if (!bin) {
    report.nextSteps.push("Install agy (see the install block below), then rerun `/antigravity:setup`.");
  } else if (!authedGuess) {
    report.nextSteps.push("Run `! agy` once to complete the browser sign-in, then you're ready.");
  } else {
    report.nextSteps.push("You're set. Try `/antigravity:review` or `/antigravity:delegate <task>`.");
  }

  if (hasFlag(parsed, "json")) {
    out(
      JSON.stringify(
        {
          ready: report.ready,
          installed: report.binary.found,
          binaryPath: bin?.path ?? null,
          version,
          authedGuess,
          configDir,
          gate: gateOn,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!bin) {
    out(render.renderNotInstalled());
    return;
  }
  out(render.renderSetup(report));
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// delegate / resume (shared core)
// ---------------------------------------------------------------------------
function runAgyTask(parsed, { kind, title, prompt, readOnly, resume }) {
  const bin = requireBinaryOrExit();
  const cwd = process.cwd();

  const sandbox = hasFlag(parsed, "sandbox") || Boolean(readOnly);
  // Read-only and sandboxed invocations must NEVER auto-approve tool permissions —
  // otherwise --dangerously-skip-permissions would void the sandbox guarantee if agy
  // gives it precedence over --sandbox. Write paths (delegate/resume without --sandbox)
  // stay write-capable by default; --no-yolo opts out.
  const yolo = (readOnly || sandbox) ? false : !hasFlag(parsed, "no-yolo");
  const continueLast = resume && !parsed.valued.conversation ? true : hasFlag(parsed, "continue");
  const conversationId = parsed.valued.conversation || null;
  const printTimeout = parsed.valued["print-timeout"] || "10m";
  const addDirs = [cwd, ...(parsed.repeated["add-dir"] || [])];

  // --model: agy 1.0.8+ accepts --model <label>; older builds don't. Probe once and
  // pass it through when supported, otherwise warn and let agy use its settings model.
  let resolvedModel = null;
  if (parsed.valued.model) {
    if (agySupportsModel(bin.path)) {
      resolvedModel = parsed.valued.model;
    } else {
      process.stderr.write(
        "[antigravity-plugin-cc] note: this agy build has no --model flag; ignoring --model. Pick the model with /model inside agy.\n",
      );
    }
  }

  const finalPrompt = clampPrompt(prompt);
  const background = hasFlag(parsed, "background");

  const job = createJob({ kind, title, prompt: finalPrompt, cwd, conversationId });
  const args = buildPrintArgs({
    prompt: finalPrompt,
    addDirs,
    yolo,
    sandbox,
    model: resolvedModel,
    continueLast,
    conversationId,
    logFile: job.paths.log,
    printTimeout,
  });

  const watchdogMs = goDurationToMs(printTimeout) + 60_000;
  const wait = hasFlag(parsed, "wait");

  // --background detaches into a tracked job and returns its id immediately.
  // --wait forces the synchronous foreground path (and overrides --background), so the
  // caller blocks for the result inline — the explicit form of the default behavior.
  // (We intentionally do NOT poll a detached job here: a child that exits while the
  // parent is still polling becomes an unreaped zombie, and kill(pid,0) reports it as
  // alive — so spawnSync's clean wait/reap in runForeground is the correct mechanism.)
  if (background && !wait) {
    const { pid } = spawnBackground({
      bin: bin.path,
      args,
      cwd,
      outputFile: job.paths.output,
      errFile: job.paths.err,
    });
    job.pid = pid;
    writeJob(job);
    out(render.renderBackgroundStarted(job));
    return;
  }

  const result = runForeground({ bin: bin.path, args, cwd, logFile: job.paths.log, watchdogMs });
  const scan = scanAgyLog(result.logText);
  job.conversationId = scan.conversationId || job.conversationId;

  const responseText = result.stdout.trim();
  if (responseText) {
    job.status = "done";
    // Persist the output so a later /antigravity:result on this finished job returns the
    // response instead of false-failing (foreground jobs never wrote output.txt before).
    try {
      writeFileSync(job.paths.output, responseText);
    } catch {
      /* non-fatal: result is still shown inline below */
    }
    writeJob(job);
    out(render.renderResponse(responseText, { title, conversationId: job.conversationId }));
    return;
  }

  if (result.timedOut) {
    job.status = "failed";
    job.error = `timed out after ${printTimeout}`;
    writeJob(job);
    out(
      render.renderError(
        { kind: "backend", message: `Antigravity timed out after ${printTimeout}. Try --print-timeout 20m or run with --background.` },
        { title, conversationId: job.conversationId, logFile: job.paths.log },
      ),
    );
    return;
  }

  // Empty stdout, no timeout: either a recognized backend error (quota/auth/...) or a
  // genuinely empty result. Both are FAILURES — never report empty output as success.
  job.status = "failed";
  job.error = scan.error ? scan.error.message : "Antigravity returned no output (no error found in the log).";
  writeJob(job);
  out(render.renderError(scan.error, { title, conversationId: job.conversationId, logFile: job.paths.log }));
}

function cmdDelegate(parsed) {
  const task = parsed.text;
  if (!task) {
    out("# 🛰️ Antigravity — delegate\n\nWhat should Antigravity (Gemini 3) work on? Pass the task, e.g.\n`/antigravity:delegate investigate why the auth tests fail and propose a fix`.");
    return;
  }
  runAgyTask(parsed, { kind: "delegate", title: truncate(task, 80), prompt: task, readOnly: hasFlag(parsed, "read-only") });
}

function cmdResume(parsed) {
  const followUp = parsed.text || "Continue from where you left off.";
  runAgyTask(parsed, {
    kind: "delegate",
    title: truncate(followUp, 80),
    prompt: followUp,
    resume: true,
  });
}

// ---------------------------------------------------------------------------
// review / adversarial-review (shared core)
// ---------------------------------------------------------------------------
function runReview(parsed, { adversarial }) {
  requireBinaryOrExit();
  const cwd = process.cwd();
  const base = parsed.valued.base || null;
  const focus = parsed.text;
  const label = adversarial ? "adversarial review" : "review";

  const target = resolveReviewTarget(cwd, base);
  if (!target.ok) {
    out(`# 🛰️ Antigravity — ${label}\n\nNothing to review: ${target.reason}.`);
    return;
  }

  // --json: emit clean, schema-validated JSON on stdout (foreground capture), not the
  // Markdown-wrapped render path. Falls back to a structured needs-attention object if
  // agy returns no/invalid JSON, so stdout is ALWAYS parseable.
  if (hasFlag(parsed, "json")) {
    return runJsonReview(parsed, { adversarial, target });
  }

  const prompt = adversarial
    ? buildAdversarialReviewPrompt(target, focus)
    : buildReviewPrompt(target, focus);
  // Reviews are contained + read-capable but should not modify the tree.
  const reviewParsed = { ...parsed, flags: { ...parsed.flags, sandbox: true } };
  runAgyTask(reviewParsed, {
    kind: adversarial ? "adversarial-review" : "review",
    title: `${label} ${target.label}`,
    prompt,
    readOnly: true,
  });
}

function runJsonReview(parsed, { adversarial, target }) {
  const bin = requireBinaryOrExit();
  const cwd = process.cwd();
  const focus = parsed.text;
  const prompt = adversarial
    ? buildAdversarialReviewPrompt(target, focus, { json: true })
    : buildReviewPrompt(target, focus, { json: true });

  const resolvedModel =
    parsed.valued.model && agySupportsModel(bin.path) ? parsed.valued.model : null;
  const printTimeout = parsed.valued["print-timeout"] || "10m";
  const job = createJob({
    kind: adversarial ? "adversarial-review" : "review",
    title: `${adversarial ? "adversarial review" : "review"} ${target.label} (json)`,
    prompt,
    cwd,
  });
  const args = buildPrintArgs({
    prompt,
    addDirs: [cwd],
    sandbox: true,
    yolo: false,
    model: resolvedModel,
    logFile: job.paths.log,
    printTimeout,
  });
  const result = runForeground({
    bin: bin.path,
    args,
    cwd,
    logFile: job.paths.log,
    watchdogMs: goDurationToMs(printTimeout) + 60_000,
  });
  const scan = scanAgyLog(result.logText);
  job.conversationId = scan.conversationId || null;
  const text = (result.stdout || "").trim();

  const parsedJson = parseReviewJson(text);
  if (parsedJson.ok) {
    job.status = "done";
    const rendered = JSON.stringify(parsedJson.data, null, 2);
    try {
      writeFileSync(job.paths.output, rendered);
    } catch {
      /* non-fatal */
    }
    writeJob(job);
    out(rendered);
    return;
  }

  // Fail-safe: always emit a valid JSON object so --json output is parseable.
  job.status = text ? "done" : "failed";
  job.error = text ? null : scan.error ? scan.error.message : "no output";
  writeJob(job);
  out(
    JSON.stringify(
      {
        verdict: "needs-attention",
        summary: text
          ? "Antigravity did not return schema-valid JSON; see raw_output."
          : scan.error
            ? `Antigravity error: ${scan.error.message}`
            : "Antigravity returned no output.",
        findings: [],
        next_steps: ["Re-run the review (optionally without --json)."],
        error: parsedJson.error || (scan.error ? scan.error.kind : "no-output"),
        raw_output: text || null,
      },
      null,
      2,
    ),
  );
}

function cmdReview(parsed) {
  return runReview(parsed, { adversarial: false });
}

function cmdAdversarialReview(parsed) {
  return runReview(parsed, { adversarial: true });
}

// ---------------------------------------------------------------------------
// status / result / cancel
// ---------------------------------------------------------------------------
function cmdStatus(parsed) {
  const id = parsed.positionals.find((p) => p.startsWith("agy-"));
  if (id) {
    const job = readJob(id);
    if (!job) {
      out(`# 🛰️ Antigravity — status\n\nNo job \`${id}\` found.`);
      return;
    }
    reconcile(job);
    out(render.renderJobStatus(job));
    return;
  }
  out(render.renderStatus(listJobs(process.cwd())));
}

function cmdResult(parsed) {
  const id = parsed.positionals.find((p) => p.startsWith("agy-"));
  let job = id ? readJob(id) : latestJob(process.cwd());
  if (!job) {
    out(`# 🛰️ Antigravity — result\n\nNo ${id ? `job \`${id}\`` : "recent jobs"} found for this repository.`);
    return;
  }
  reconcile(job);
  if (job.status === "running") {
    out(render.renderJobStatus(job));
    return;
  }

  const output = readLogSafe(job.paths.output).trim();
  const scan = scanAgyLog(readLogSafe(job.paths.log));
  const conversationId = job.conversationId || scan.conversationId;
  if (output) {
    out(render.renderResponse(output, { title: job.title, conversationId }));
  } else {
    out(render.renderError(scan.error, { title: job.title, conversationId, logFile: job.paths.log }));
  }
}

function cmdCancel(parsed) {
  const id = parsed.positionals.find((p) => p.startsWith("agy-"));
  const job = id ? readJob(id) : listJobs(process.cwd()).find((j) => j.status === "running");
  if (!job) {
    out(`# 🛰️ Antigravity — cancel\n\nNo running job ${id ? `\`${id}\`` : ""} to cancel.`);
    return;
  }
  const result = cancelJob(job);
  out(render.renderCancel(result, job));
}

// ---------------------------------------------------------------------------
function truncate(s, n) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function usage() {
  out(
    [
      "antigravity companion — drive the Antigravity CLI (agy / Gemini 3) from Claude Code",
      "",
      "Usage: node antigravity.mjs <subcommand> [args]",
      "  setup [--json]",
      "  delegate <task> [--background] [--wait] [--sandbox] [--read-only] [--model <label>] [--continue] [--conversation <id>] [--add-dir <p>] [--print-timeout <dur>]",
      "  review [--base <ref>] [--background] [--wait] [--model <label>] [focus text...]",
      "  adversarial-review [--base <ref>] [--background] [--wait] [--model <label>] [focus text...]",
      "  resume <follow-up> [--conversation <id>] [--background] [--wait]",
      "  status [job-id]",
      "  result [job-id]",
      "  cancel [job-id]",
    ].join("\n"),
  );
}

function main() {
  const [, , sub, ...rest] = process.argv;
  const parsed = parseArgs(rest);
  switch (sub) {
    case "setup":
      return cmdSetup(parsed);
    case "delegate":
    case "run":
    case "task":
      return cmdDelegate(parsed);
    case "review":
      return cmdReview(parsed);
    case "adversarial-review":
      return cmdAdversarialReview(parsed);
    case "resume":
      return cmdResume(parsed);
    case "status":
      return cmdStatus(parsed);
    case "result":
      return cmdResult(parsed);
    case "cancel":
      return cmdCancel(parsed);
    default:
      return usage();
  }
}

main();
