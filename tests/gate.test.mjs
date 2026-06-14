import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGatePrompt, parseGateDecision } from "../plugins/antigravity/scripts/lib/gate.mjs";

const target = { ok: true, label: "uncommitted", diff: "diff --git a/x b/x\n+oops" };

test("gate prompt embeds the ALLOW/BLOCK contract, the diff, and the prior response", () => {
  const p = buildGatePrompt(target, "I changed x");
  assert.match(p, /ALLOW: <short reason>/);
  assert.match(p, /BLOCK: <short reason>/);
  assert.match(p, /```diff/);
  assert.match(p, /oops/);
  assert.match(p, /I changed x/);
});

test("parseGateDecision: BLOCK carries its reason", () => {
  const d = parseGateDecision("BLOCK: missing null check in handler");
  assert.equal(d.block, true);
  assert.match(d.reason, /missing null check/);
});

test("parseGateDecision: ALLOW does not block", () => {
  assert.deepEqual(parseGateDecision("ALLOW: looks good"), { block: false, reason: null, parsed: true });
});

test("parseGateDecision tolerates a leading blank line before the verdict", () => {
  assert.equal(parseGateDecision("\n\nBLOCK: race condition").block, true);
});

test("parseGateDecision fail-safe: unparseable output allows (does not trap the user)", () => {
  const d = parseGateDecision("I think it's probably fine?");
  assert.equal(d.block, false);
  assert.equal(d.parsed, false);
});

test("parseGateDecision: BLOCK with no reason still blocks with a default reason", () => {
  const d = parseGateDecision("BLOCK:");
  assert.equal(d.block, true);
  assert.ok(d.reason && d.reason.length > 0);
});
