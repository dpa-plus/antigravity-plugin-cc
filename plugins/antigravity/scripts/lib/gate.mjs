// Stop-review-gate: prompt builder + decision parser.
// Ported from codex-plugin-cc's stop-review-gate contract: the model's FIRST line is
// "ALLOW: <reason>" or "BLOCK: <reason>". We embed the working-tree diff so the verdict
// is grounded in the actual change rather than agy wandering the repo.

export function buildGatePrompt(target, lastAssistantMessage) {
  return [
    "Run a stop-gate review of the previous Claude turn.",
    "Only review the code changes shown in the diff below. If the diff shows no real code changes (only status/setup/summary output), return ALLOW immediately and do no further work.",
    "Challenge whether this specific work and its design choices should ship. Look for second-order failures, empty-state behavior, broken invariants, missing guards, and rollback/retry risks.",
    "",
    "Your FIRST line must be exactly one of:",
    "- ALLOW: <short reason>",
    "- BLOCK: <short reason>",
    "Put nothing before that first line. Use BLOCK only if you found a concrete issue that must be fixed before stopping; otherwise use ALLOW.",
    "",
    "Ground every blocking claim in the diff below — do not block on code you cannot see.",
    "",
    lastAssistantMessage ? `Previous Claude response:\n${lastAssistantMessage}\n` : "",
    "Working-tree diff under review:",
    "```diff",
    target.diff,
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Parse agy's gate output. Lenient: scans for the first line that starts with
 * ALLOW: or BLOCK: (Gemini sometimes adds a blank line first). Fail-safe: anything
 * that is not an explicit BLOCK is treated as ALLOW — a broken/garbled gate must never
 * trap the user at the end of a turn.
 *
 * @returns {{ block: boolean, reason: string|null, parsed: boolean }}
 */
export function parseGateDecision(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => /^(ALLOW|BLOCK):/i.test(s));

  if (!line) return { block: false, reason: null, parsed: false };
  if (/^BLOCK:/i.test(line)) {
    const reason = line.replace(/^BLOCK:\s*/i, "").trim();
    return { block: true, reason: reason || "the review found an issue that should be fixed before stopping", parsed: true };
  }
  return { block: false, reason: null, parsed: true };
}
