---
description: Adversarial cross-model review by Gemini 3.5 that challenges whether your change should ship (read-only, contained).
argument-hint: "[--base <ref>] [--background] [--wait] [--model <label>] [focus text]"
allowed-tools: Bash(node:*)
---

Get Gemini 3.5 to **attack** your change instead of just reviewing it. This runs a **read-only**, sandboxed adversarial review of your current changes through Antigravity (Gemini 3.5) and brings the findings back into Claude Code. The framing is skeptical: it tries to find the strongest reasons the change should *not* ship — failure paths, broken invariants, auth/data-loss/rollback risks, and assumptions that stop being true under stress.

Run the companion and present its output:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity.mjs" adversarial-review "$ARGUMENTS"
```

Then show the review verbatim, then add a one-line summary of the single most important finding (if any). Use the `antigravity-result-handling` skill to interpret the companion output first — distinguish a real review from a quota/auth/backend error so you never present an empty result as a clean review.

This command is review-only: do not fix issues, apply patches, or imply you are about to make changes. Your job is to run the review and relay Gemini's output.

## What the arguments do

- **No `--base`** — reviews your **uncommitted changes** (working tree vs HEAD). The default.
- **`--base <ref>`** — reviews `<ref>...HEAD` instead. `--base main` for the whole branch.
- **Trailing focus text** — steers the attack: `auth`, `data loss`, `the new migration`, `concurrency`.
- **`--background`** — for large diffs, run it as a job and keep working; pull it with `/antigravity:result`.
- **`--wait`** — run as a job but block until it finishes, then print the result.
- **`--model <label>`** — pick the Gemini model for this run (e.g. `--model "Gemini 3.5 Pro"`); requires an agy build with `--model` support.

## Examples

```
/antigravity:adversarial-review
/antigravity:adversarial-review --base main auth and tenant isolation
/antigravity:adversarial-review --background rollback safety of the new writer
```

## Notes

- Read-only and contained — Gemini sees the git diff embedded in the prompt and reports back. Nothing in your repo changes.
- Antigravity is in preview with a quota. If the review comes back empty, you're likely rate-limited — the companion surfaces the reset time when it can.

_Powered by Google Antigravity (`agy`, Gemini 3.5). A dpa-plus plugin._
