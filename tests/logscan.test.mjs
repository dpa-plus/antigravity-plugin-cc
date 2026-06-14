import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanAgyLog, stripGlogPrefix } from "../plugins/antigravity/scripts/lib/logscan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SUCCESS_LOG = readFileSync(join(HERE, "fixtures", "agy-1.0.8-success.log"), "utf8");

// agy logs ~30 E-level "not logged into Antigravity" lines on startup BEFORE it
// silently authenticates. Those are benign noise on a successful run.
const BENIGN_PREFIX = [
  "E0614 13:27:42.322438 65164 log.go:398] Failed to poll ListExperiments: error getting token source: You are not logged into Antigravity.",
  "E0614 13:27:42.324562 65164 server.go:630] Failed to get OAuth token: error getting token source from auth provider: You are not logged into Antigravity.",
  "W0614 13:27:42.324574 65164 client.go:82] failed to set auth token",
  "I0614 13:27:45.261838 65164 auth.go:114] ChainedAuth: authenticated via keyring (effective: keyring)",
  "I0614 13:27:51.523965 65164 printmode.go:191] Print mode: silent auth succeeded",
].join("\n");

const QUOTA_LOG = `I0531 16:30:42 1 server.go:755] Created conversation d112284b-3fbb-40bc-b559-5770aa771494
I0531 16:30:42 1 printmode.go:130] Print mode: conversation=d112284b-3fbb-40bc-b559-5770aa771494, sending message
E0531 16:30:43.195032 38848 log.go:398] agent executor error: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Contact your administrator to enable overages. Resets in 152h59m39s.
E0531 16:30:43.196093 38848 log.go:398] RESOURCE_EXHAUSTED (code 429): Individual quota reached. Contact your administrator to enable overages. Resets in 152h59m39s.`;

test("extracts conversation id from 'Created conversation'", () => {
  const r = scanAgyLog(QUOTA_LOG);
  assert.equal(r.conversationId, "d112284b-3fbb-40bc-b559-5770aa771494");
});

test("falls back to conversation= form", () => {
  const r = scanAgyLog("blah conversation=11112222-3333-4444-5555-666677778888 more");
  assert.equal(r.conversationId, "11112222-3333-4444-5555-666677778888");
});

test("classifies quota exhaustion and parses reset window", () => {
  const r = scanAgyLog(QUOTA_LOG);
  assert.equal(r.error.kind, "quota");
  assert.equal(r.error.resetsIn, "152h59m39s");
});

test("deduplicates the repeated quota error line", () => {
  const r = scanAgyLog(QUOTA_LOG);
  assert.equal(r.errorLines.length, 1);
});

test("classifies auth errors", () => {
  const r = scanAgyLog("E0101 00:00:00 1 log.go:1] UNAUTHENTICATED (code 401): login required");
  assert.equal(r.error.kind, "auth");
});

test("classifies generic backend errors and strips glog prefix", () => {
  const r = scanAgyLog("E0101 00:00:00.0 5 log.go:9] agent executor error: INTERNAL (code 500): boom");
  assert.equal(r.error.kind, "backend");
  assert.match(r.error.message, /agent executor error/);
  assert.doesNotMatch(r.error.message, /log\.go/);
});

test("returns null error on clean log", () => {
  const r = scanAgyLog("I0101 00:00:00 1 server.go:1] all good\nCreated conversation aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(r.error, null);
  assert.equal(r.conversationId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

test("stripGlogPrefix is a no-op on plain text", () => {
  assert.equal(stripGlogPrefix("just a message"), "just a message");
});

// --- agy 1.0.8 benign pre-auth error window -------------------------------

test("real 1.0.8 successful-run log has no error and yields the conversation id", () => {
  const r = scanAgyLog(REAL_SUCCESS_LOG);
  assert.equal(r.error, null, "benign startup 'not logged in' lines must not be reported as an error");
  assert.equal(r.conversationId, "b9b094d3-83fe-4bf5-b6aa-58c4024f9784");
});

test("ignores 'not logged into Antigravity' lines that precede a successful silent auth", () => {
  const r = scanAgyLog(BENIGN_PREFIX);
  assert.equal(r.error, null);
});

test("classifies a real error that occurs AFTER auth succeeds", () => {
  const log = `${BENIGN_PREFIX}\nE0614 13:27:55.0 1 log.go:398] agent executor error: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 10h0m0s.`;
  const r = scanAgyLog(log);
  assert.equal(r.error.kind, "quota");
  assert.equal(r.error.resetsIn, "10h0m0s");
});

test("treats 'not logged in' as a real auth error when silent auth never succeeds", () => {
  const log = "E0614 13:27:42.3 1 server.go:630] Failed to get OAuth token: error getting token source from auth provider: You are not logged into Antigravity.";
  const r = scanAgyLog(log);
  assert.equal(r.error.kind, "auth");
});
