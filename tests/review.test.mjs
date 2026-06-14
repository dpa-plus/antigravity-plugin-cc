import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewPrompt,
  buildAdversarialReviewPrompt,
  parseReviewJson,
} from "../plugins/antigravity/scripts/lib/review.mjs";

const target = {
  ok: true,
  label: "uncommitted changes (HEAD)",
  diff: "diff --git a/x b/x\n+boom",
  stat: " x | 1 +",
};

test("standard review prompt embeds the diff and asks for a verdict", () => {
  const p = buildReviewPrompt(target, "");
  assert.match(p, /senior code reviewer/i);
  assert.match(p, /Verdict/);
  assert.match(p, /```diff/);
  assert.match(p, /boom/);
  assert.doesNotMatch(p, /ADVERSARIAL/);
});

test("adversarial prompt uses a skeptical, break-it framing", () => {
  const p = buildAdversarialReviewPrompt(target, "");
  assert.match(p, /ADVERSARIAL/);
  assert.match(p, /break confidence|DISPROVE|skepticism/i);
  assert.match(p, /DO-NOT-SHIP/);
  assert.match(p, /```diff/);
  assert.match(p, /boom/);
});

test("focus text is woven into both prompts", () => {
  assert.match(buildReviewPrompt(target, "security"), /security/);
  assert.match(buildAdversarialReviewPrompt(target, "tenant isolation"), /tenant isolation/);
});

test("{ json: true } appends the structured-output contract", () => {
  const p = buildReviewPrompt(target, "", { json: true });
  assert.match(p, /Return ONLY a single valid JSON object/);
  assert.match(p, /"verdict": "approve" \| "needs-attention"/);
  assert.match(p, /line_start/);
  // default (no json) must NOT include the contract
  assert.doesNotMatch(buildReviewPrompt(target, ""), /Return ONLY a single valid JSON object/);
});

test("adversarial review also supports { json: true }", () => {
  assert.match(buildAdversarialReviewPrompt(target, "", { json: true }), /Return ONLY a single valid JSON object/);
});

test("parseReviewJson accepts a clean schema-valid object", () => {
  const r = parseReviewJson('{"verdict":"approve","summary":"ok","findings":[],"next_steps":[]}');
  assert.equal(r.ok, true);
  assert.equal(r.data.verdict, "approve");
});

test("parseReviewJson tolerates ```json fences and surrounding prose", () => {
  const r = parseReviewJson('Sure:\n```json\n{"verdict":"needs-attention","summary":"x","findings":[],"next_steps":["fix"]}\n```\n');
  assert.equal(r.ok, true);
  assert.equal(r.data.verdict, "needs-attention");
});

test("parseReviewJson rejects invalid or non-conforming output", () => {
  assert.equal(parseReviewJson("totally not json").ok, false);
  assert.equal(parseReviewJson("").ok, false);
  assert.equal(parseReviewJson('{"verdict":"maybe","summary":"x","findings":[],"next_steps":[]}').ok, false); // bad enum
  assert.equal(parseReviewJson('{"summary":"x","findings":[],"next_steps":[]}').ok, false); // missing verdict
  assert.equal(parseReviewJson('{"verdict":"approve","summary":"x","findings":{},"next_steps":[]}').ok, false); // findings not array
});
