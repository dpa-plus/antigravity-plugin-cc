#!/usr/bin/env node
// SessionStart / SessionEnd lifecycle. Two jobs:
//   - Always reconcile recorded job statuses with reality (a "running" job whose pid is
//     gone becomes done/failed) so /antigravity:status isn't stale across sessions.
//   - On SessionEnd, reap this session's still-running DETACHED background jobs (SIGTERM),
//     so a backgrounded agy run doesn't outlive the Claude session that started it.
//
// Session correlation is best-effort: jobs are stamped with CLAUDE_SESSION_ID at creation
// and matched against the hook's session_id. If the id is unknown, nothing is reaped
// (conservative — never kill another session's jobs). Fail-safe: never throws out.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { jobsRoot } from "./lib/paths.mjs";
import { readJob, reconcile, writeJob, nowIso } from "./lib/jobs.mjs";

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function jobNames() {
  const root = jobsRoot();
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

function main() {
  const event = process.argv[2] || "";
  const input = readInput();
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || null;

  // Reconcile stale statuses (cheap, both events).
  for (const name of jobNames()) {
    const job = readJob(name);
    if (job) reconcile(job);
  }

  if (event === "SessionEnd" && sessionId) {
    for (const name of jobNames()) {
      const job = readJob(name);
      if (job && job.status === "running" && job.sessionId === sessionId && job.pid) {
        try {
          process.kill(job.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
        job.status = "cancelled";
        job.finishedAt = nowIso();
        job.error = "session ended";
        try {
          writeJob(job);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[antigravity session hook] ${message}\n`);
}
