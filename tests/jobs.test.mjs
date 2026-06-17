import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  newJobId,
  createJob,
  readJob,
  reconcile,
  isAlive,
  listJobs,
  cancelJob,
} from "../plugins/antigravity/scripts/lib/jobs.mjs";

const DEAD_PID = 2147480000; // astronomically unlikely to be a live pid
function home() {
  return { ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-jobs-")) };
}

test("newJobId is unique and prefixed", () => {
  assert.match(newJobId(), /^agy-/);
  assert.notEqual(newJobId(), newJobId());
});

test("isAlive: live for this process, false for a bogus/empty pid", () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(DEAD_PID), false);
  assert.equal(isAlive(null), false);
});

test("createJob persists and readJob round-trips", () => {
  const env = home();
  const job = createJob({ kind: "delegate", title: "t", cwd: "/x" }, env);
  const back = readJob(job.id, env);
  assert.equal(back.id, job.id);
  assert.equal(back.status, "running");
});

test("reconcile: dead pid WITH output -> done", () => {
  const env = home();
  const job = createJob({ kind: "delegate", cwd: "/x", pid: DEAD_PID }, env);
  writeFileSync(job.paths.output, "the answer");
  reconcile(job);
  assert.equal(readJob(job.id, env).status, "done");
});

test("reconcile: dead pid, no output, no error -> failed (never silent done)", () => {
  const env = home();
  const job = createJob({ kind: "delegate", cwd: "/x", pid: DEAD_PID }, env);
  reconcile(job);
  const back = readJob(job.id, env);
  assert.equal(back.status, "failed");
  assert.match(back.error, /no output/i);
});

test("cancelJob: not-running is a no-op; stale running pid -> failed", () => {
  const env = home();
  const done = createJob({ kind: "delegate", cwd: "/x", status: "done" }, env);
  assert.equal(cancelJob(done).cancelled, false);
  const stale = createJob({ kind: "delegate", cwd: "/x", status: "running", pid: DEAD_PID }, env);
  assert.equal(cancelJob(stale).cancelled, false);
  assert.equal(readJob(stale.id, env).status, "failed");
});

test("listJobs filters by cwd and sorts newest-first", () => {
  const env = home();
  createJob({ kind: "delegate", cwd: "/a", title: "old", startedAt: "2020-01-01T00:00:01.000Z" }, env);
  createJob({ kind: "delegate", cwd: "/b", title: "other", startedAt: "2020-01-01T00:00:02.000Z" }, env);
  createJob({ kind: "delegate", cwd: "/a", title: "new", startedAt: "2020-01-01T00:00:03.000Z" }, env);
  const a = listJobs("/a", env);
  assert.equal(a.length, 2);
  assert.equal(a[0].title, "new"); // newest first
  assert.equal(listJobs("/b", env).length, 1);
});

test("pruneJobs caps the dir at 50 newest, drops older TERMINAL jobs", () => {
  const env = home();
  for (let i = 0; i < 55; i += 1) {
    createJob(
      { kind: "delegate", cwd: "/x", status: "done", title: `job${i}`, startedAt: `2020-01-01T00:00:${String(i).padStart(2, "0")}.000Z` },
      env,
    );
  }
  const remaining = listJobs("/x", env);
  assert.ok(remaining.length <= 50, `expected <=50, got ${remaining.length}`);
  assert.ok(remaining.some((j) => j.title === "job54"), "newest survives");
  assert.ok(!remaining.some((j) => j.title === "job0"), "oldest is pruned");
});

test("pruneJobs never deletes a running job, even an old one", () => {
  const env = home();
  createJob(
    { kind: "delegate", cwd: "/x", status: "running", pid: process.pid, title: "ancient-running", startedAt: "2000-01-01T00:00:00.000Z" },
    env,
  );
  for (let i = 0; i < 55; i += 1) {
    createJob({ kind: "delegate", cwd: "/x", status: "done", startedAt: `2020-01-01T00:00:${String(i).padStart(2, "0")}.000Z` }, env);
  }
  assert.ok(listJobs("/x", env).some((j) => j.title === "ancient-running"), "old running job must survive");
});
