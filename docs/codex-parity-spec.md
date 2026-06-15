# Spec: codex-plugin-cc parity for Antigravity

Status: approved (2026-06-14). Base: the upstream antigravity-plugin-cc @ v0.1.0.
Goal: bring this Antigravity (`agy` / Gemini 3.5) companion to feature parity with OpenAI's
`codex-plugin-cc`, so it behaves like the Codex plugin but drives `agy` instead.

## Context / ground truth (verified on agy 1.0.8, macOS arm64)

- `agy -p "<prompt>"` prints the model response to **stdout** correctly (the old headless
  empty-stdout bug is gone on 1.0.8).
- `agy --model <value>` **is** a real flag. Models are referenced by **label**
  (`settings.json` → `"model": "Gemini 3.5 Flash (High)"`). There is **no** `--effort` flag.
- `agy models` **hangs** in a non-TTY (no output) — do not call it from the companion.
- Conversation id appears in `--log-file` as `Created conversation <uuid>` and
  `Print mode: conversation=<uuid>` — `logscan` already extracts both. ✅ still valid.
- **Benign-error trap (real bug):** on *every successful* run, agy logs ~30 `E…`-level lines
  (`You are not logged into Antigravity`, `error getting token source`,
  `Failed to get OAuth token`, `failed to set auth token`) **before** it silently authenticates
  (`Print mode: silent auth succeeded` / `ChainedAuth: authenticated via keyring`). Today's
  `scanAgyLog` collects these and reports a bogus `backend` error whenever stdout is empty for
  any non-quota reason — which would poison the review gate and `reconcile()`. Real captured
  log saved at `tests/fixtures/agy-1.0.8-success.log`.

## Architecture (unchanged base)

Claude Code plugin → `commands/*.md` shell out to `scripts/antigravity.mjs` (zero-dep Node ESM)
→ drives `agy -p` via `lib/agy.mjs`; per-job state under `~/.antigravity-cc/jobs/`;
`lib/logscan.mjs` recovers error/conversation-id from the agy `--log-file`. Each addition below
is an isolated unit, following existing patterns. No MCP, no broker (agy has no app-server).

## Work items

### 0. logscan hardening (foundation — fixes the benign-error trap)
- In `scanAgyLog`: find the **last** auth-success marker
  (`silent auth succeeded` | `authenticated via keyring` | `Auth succeeded, refreshing`).
  If found, only classify error lines that appear **after** it. If not found, the
  `not logged into Antigravity` lines are the *real* error → classify as `auth`.
- Add `not logged into Antigravity` / `not logged in` to the auth-error matcher.
- Regression test: `scanAgyLog(fixtures/agy-1.0.8-success.log)` → `error === null`,
  `conversationId === "b9b094d3-…"`.

### 1. Empty-stdout hardening (normal path)
- `lib/agy.mjs` foreground + background spawns: pass `stdin: ignore` is already there; keep it.
  Treat empty stdout + **no real** log error as a *surfaced* failure (clear message:
  "Antigravity returned no output"), not a silent success — on the normal path too.
- `reconcile()` mirrors the same logic (post-logscan-fix it no longer trips on benign lines).

### 2. `--model` passthrough
- `lib/agy.mjs buildPrintArgs`: add `--model <value>` (flags-first, before `-p`).
- Gate behind a one-time capability probe (`agy --help` contains `--model`); if absent
  (older agy), warn + ignore as today. Drop `--effort` entirely (agy has no such flag).
- `args.mjs`: `model` stays a valued flag (already is).

### 3. `/antigravity:adversarial-review`
- `commands/adversarial-review.md` + `cmdAdversarialReview()` in `antigravity.mjs`.
- Reuse `resolveReviewTarget()`; new `buildAdversarialReviewPrompt()` (red-team framing,
  ported from codex's adversarial-review prompt). Read-only + `--sandbox` like review.

### 4. `--wait` on background
- `--wait` flag: start the job via the background path, then poll `meta.json`/output to a
  terminal state (`waitForJob()` in `jobs.mjs`), then render the result — matching codex's
  `--background`/`--wait` pairing. Bounded by the print-timeout + watchdog.

### 5. Stop-review-gate (headline)
- `hooks/hooks.json` with a `Stop` hook (+ `SessionStart`/`SessionEnd` no-op lifecycle for
  parity) → `scripts/stop-review-gate-hook.mjs`.
- Hook reads `{session_id, last_assistant_message, cwd}`, checks an **opt-in** toggle in
  `~/.antigravity-cc/config.json` (`gate: true|false`, default **false**). When on, it runs a
  gate review of the working diff through `agy` with `prompts/stop-review-gate.md` (first line
  `ALLOW:` / `BLOCK: <reason>`), parses it, and emits `{decision:"block", reason}` until ALLOW.
- **Fail-safe + escape hatch:** if agy errors/empties/times out, do **not** hard-block — surface
  a note and ALLOW (a broken gate must never trap the user). `ANTIGRAVITY_CC_NO_GATE=1` env and
  a setup toggle both disable it. Watchdog budget mirrors codex (~15m cap).
- `lib/config.mjs` (new): read/write the toggle. `paths.mjs`: `configPath()`.
- `/antigravity:setup` gains `--enable-gate` / `--disable-gate`.

### 6. Structured JSON review output (nicety, lowest priority)
- Port codex's `schemas/review-output.schema.json`. `review`/`adversarial-review` gain `--json`:
  prompt agy for schema-conforming JSON, validate, **fail-safe to needs-attention** on malformed.
- Not required by the gate (the gate uses the ALLOW/BLOCK contract).

### 7. Docs / attribution
- README + command docs for the new commands/flags; `CHANGELOG.md` entry; keep the MIT license.

## Testing
- Extend `tests/fake-agy.mjs` to optionally emit the benign startup block and to honor `--model`.
- New/updated tests: logscan benign-window (real fixture), empty-stdout hardening, `--model`
  arg-building + probe, adversarial prompt build, `--wait` polling, gate ALLOW/BLOCK parsing +
  block decision + fail-safe. Keep `node --test`; CI on Node 18/20/22.
- One manual smoke test of every tool against real agy 1.0.8 before sign-off.

## Out of scope (YAGNI)
MCP server, broker/app-server, `image`/`research` commands, namespace rename.
```
