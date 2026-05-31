import { test } from "node:test";
import assert from "node:assert/strict";
import { scanAgyLog, stripGlogPrefix } from "../plugins/antigravity/scripts/lib/logscan.mjs";

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
