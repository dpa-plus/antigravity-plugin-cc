// Prompt builders for code review. Pure functions, unit-tested. Each embeds the
// git diff (resolved by lib/git.mjs) and asks agy (Gemini) to review it read-only.

function diffBlock(target) {
  return [
    `Review target: ${target.label}`,
    target.stat ? `\nDiffstat:\n${target.stat}` : "",
    "\nUnified diff:\n",
    "```diff",
    target.diff,
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Standard "second pair of eyes" review. */
export function buildReviewPrompt(target, focus) {
  return [
    "You are a meticulous senior code reviewer. Review ONLY the changes below. Do not modify any files.",
    focus ? `\nReviewer focus: ${focus}` : "",
    "\nReturn a concise review with:",
    "1. Verdict (ship / ship with nits / needs work).",
    "2. The most important issues first, each as: severity (critical/high/medium/low), file:line, what's wrong, and a concrete fix.",
    "3. Anything risky around correctness, security, error handling, concurrency, or data loss.",
    "4. A short list of suggested next steps.",
    "\n" + diffBlock(target),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Adversarial review — challenges whether the change should ship at all. Ported from
 * codex-plugin-cc's adversarial-review prompt: skeptical stance, attack-surface focus,
 * one strong finding over many weak ones.
 */
export function buildAdversarialReviewPrompt(target, focus) {
  return [
    "You are performing an ADVERSARIAL code review. Your job is to break confidence in this change, not to validate it. Review ONLY the changes below. Do not modify any files.",
    "",
    "Operating stance: default to skepticism. Assume the change can fail in subtle, high-cost, or user-visible ways until the evidence says otherwise. Do not give credit for good intent, partial fixes, or likely follow-up work. If something only works on the happy path, treat that as a real weakness.",
    "",
    "Prioritize failures that are expensive, dangerous, or hard to detect:",
    "- auth, permissions, tenant isolation, and trust boundaries",
    "- data loss, corruption, duplication, and irreversible state changes",
    "- rollback safety, retries, partial failure, and idempotency gaps",
    "- race conditions, ordering assumptions, stale state, and re-entrancy",
    "- empty-state, null, timeout, and degraded-dependency behavior",
    "- version skew, schema drift, migration hazards, and compatibility regressions",
    "- observability gaps that would hide failure or make recovery harder",
    focus ? `\nWeight this focus area heavily, but still report any other material issue: ${focus}` : "",
    "",
    "Method: actively try to DISPROVE the change. Look for violated invariants, missing guards, unhandled failure paths, and assumptions that stop being true under stress. Trace how bad inputs, retries, concurrent actions, or partially completed operations move through the code.",
    "",
    "Return:",
    "1. Verdict: SHIP or DO-NOT-SHIP — be decisive.",
    "2. The strongest findings first (prefer one well-supported finding over several weak ones). For each: severity, file:line, what can go wrong, why this path is vulnerable, the likely impact, and a concrete fix.",
    "3. The key assumptions this change depends on, and where they could fail under real-world conditions.",
    "",
    "Stay grounded: every finding must be defensible from the diff below. Do not invent files, lines, or runtime behavior you cannot support. If the change looks safe, say so directly.",
    "\n" + diffBlock(target),
  ]
    .filter(Boolean)
    .join("\n");
}
