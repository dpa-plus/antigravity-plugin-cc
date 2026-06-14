// Background job state for the Antigravity companion.
// One directory per job under jobsRoot(): meta.json + output.txt + err.txt + agy.log

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { jobsRoot, jobDir } from "./paths.mjs";
import { readLogSafe } from "./agy.mjs";
import { scanAgyLog } from "./logscan.mjs";

function nowIso() {
  return new Date().toISOString();
}

export function newJobId() {
  const ts = Date.now().toString(36);
  const rand = randomBytes(6).toString("hex");
  return `agy-${ts}-${rand}`;
}

export function jobPaths(id, env = process.env) {
  const dir = jobDir(id, env);
  return {
    dir,
    meta: join(dir, "meta.json"),
    output: join(dir, "output.txt"),
    err: join(dir, "err.txt"),
    log: join(dir, "agy.log"),
  };
}

export function createJob(meta, env = process.env) {
  const id = meta.id || newJobId();
  const paths = jobPaths(id, env);
  mkdirSync(paths.dir, { recursive: true });
  const record = {
    id,
    kind: meta.kind || "delegate",
    title: meta.title || "",
    prompt: meta.prompt || "",
    cwd: meta.cwd || process.cwd(),
    status: meta.status || "running",
    pid: meta.pid ?? null,
    conversationId: meta.conversationId ?? null,
    startedAt: meta.startedAt || nowIso(),
    finishedAt: meta.finishedAt ?? null,
    error: meta.error ?? null,
    paths,
  };
  writeFileSync(paths.meta, JSON.stringify(record, null, 2));
  return record;
}

export function writeJob(job) {
  writeFileSync(job.paths.meta, JSON.stringify(job, null, 2));
  return job;
}

export function readJob(id, env = process.env) {
  const paths = jobPaths(id, env);
  if (!existsSync(paths.meta)) return null;
  try {
    const job = JSON.parse(readFileSync(paths.meta, "utf8"));
    job.paths = paths; // always recompute absolute paths
    return job;
  } catch {
    return null;
  }
}

export function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // exists but not ours
  }
}

/**
 * Reconcile a job's recorded status with reality: if it was "running" but the pid
 * is gone, read output + log, classify, and persist a terminal status.
 */
export function reconcile(job) {
  if (!job) return job;
  if (job.status !== "running") return job;
  if (isAlive(job.pid)) return job;

  const output = readLogSafe(job.paths.output).trim();
  const logText = readLogSafe(job.paths.log);
  const scan = scanAgyLog(logText);

  job.finishedAt = nowIso();
  job.conversationId = job.conversationId || scan.conversationId;
  if (output) {
    job.status = "done";
  } else if (scan.error) {
    job.status = "failed";
    job.error = scan.error.message + (scan.error.resetsIn ? ` (resets in ${scan.error.resetsIn})` : "");
  } else {
    // No output and no recognizable error: this is a failure, not a silent success.
    job.status = "failed";
    job.error = "Antigravity returned no output (no error found in the log).";
  }
  return writeJob(job);
}

export function listJobs(cwd, env = process.env) {
  const root = jobsRoot(env);
  if (!existsSync(root)) return [];
  const jobs = [];
  for (const name of readdirSync(root)) {
    const job = readJob(name, env);
    if (!job) continue;
    reconcile(job);
    if (cwd && job.cwd !== cwd) continue;
    jobs.push(job);
  }
  jobs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return jobs;
}

export function latestJob(cwd, env = process.env) {
  return listJobs(cwd, env)[0] || null;
}

export function cancelJob(job) {
  if (!job) return { cancelled: false, reason: "not found" };
  if (job.status !== "running") return { cancelled: false, reason: `job is ${job.status}` };
  if (!isAlive(job.pid)) {
    job.status = "failed";
    job.finishedAt = nowIso();
    job.error = "process exited before cancel";
    writeJob(job);
    return { cancelled: false, reason: "process already exited" };
  }
  try {
    process.kill(job.pid, "SIGTERM");
  } catch {
    /* ignore */
  }
  job.status = "cancelled";
  job.finishedAt = nowIso();
  writeJob(job);
  return { cancelled: true };
}

export { nowIso };
