import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPrompt, MAX_PROMPT_BYTES } from "../plugins/antigravity/scripts/lib/text.mjs";

test("clampPrompt returns short prompts unchanged", () => {
  assert.equal(clampPrompt("hello world"), "hello world");
});

test("clampPrompt truncates oversized prompts and marks it", () => {
  const out = clampPrompt("a".repeat(MAX_PROMPT_BYTES + 100));
  assert.ok(Buffer.byteLength(out, "utf8") < MAX_PROMPT_BYTES + 100);
  assert.match(out, /truncated/);
});

test("clampPrompt cuts on a UTF-8 boundary — no mojibake from a split multibyte char", () => {
  // a 4-byte emoji straddles the byte limit; the old byte-slice would split it.
  const big = "a".repeat(MAX_PROMPT_BYTES - 1) + "😀";
  const out = clampPrompt(big);
  assert.ok(!out.includes("�"), "must not contain the replacement character");
  assert.match(out, /truncated/);
});
