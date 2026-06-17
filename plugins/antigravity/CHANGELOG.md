# Changelog

All notable changes to the `antigravity` plugin are documented here.

## [0.3.0] — 2026-06-15

Public-readiness hardening (security + parity), informed by a multi-agent audit and an independent Codex review.

### Security
- Hardened the stop-review gate and review prompts against prompt-injection via diff content: untrusted diffs/messages are wrapped in per-call crypto-nonce delimiters with data-not-instructions framing, and the ALLOW/BLOCK contract is re-asserted last (`lib/untrusted.mjs`).
- Read-only paths (`review`/`adversarial-review`/`--read-only`) no longer emit `--dangerously-skip-permissions` (yolo is forced off when contained).
- Quoted `"$ARGUMENTS"` in every command doc (shell-metacharacter safety).
- CI actions pinned to commit SHAs + least-privilege `permissions: contents: read`; added Dependabot.

### Fixed
- Foreground / `--wait` job output is persisted, so `/antigravity:result` no longer false-fails on a finished foreground job.
- `args.mjs`: a valued flag no longer swallows a following `--flag` or over-consumes past the end of argv.
- `goDurationToMs`: `500ms` is milliseconds, not minutes (longest-unit-first).
- `clampPrompt` truncates on a UTF-8 boundary (no mojibake); job IDs use `crypto.randomBytes` (supersedes PR #11).
- setup auth heuristic matches SQLite `*.db` conversations; `agySupportsModel` no longer caches transient probe failures.

### Changed / parity
- Corrected the `--model` story across all agent/skill/reference docs (agy 1.0.8+ has `--model <label>`).
- Job dir pruned to the newest 50; new SessionStart/SessionEnd hook reconciles stale jobs and reaps this session's detached background jobs.
- `review --base` now embeds untracked (new) file content too.

### Privacy
- Redacted personal data (email, paths, IDs) from the captured test fixture; documented that `delegate`/`review` send working-directory content to Google's Antigravity.

### Tests
- 93 tests (`node --test`); CI on Node 18/20/22.

## [0.2.1] — 2026-06-14

### Changed
- Rebranded to **dpa-plus**: authors, docs, README badges/credits, and manifests no
  longer carry upstream branding. The MIT license attribution to the original author is
  retained in `LICENSE` as required.
- Fixed the stale "no `--model` flag" note in CONTRIBUTING (agy 1.0.8 has `--model`).

## [0.2.0] — 2026-06-14

codex-plugin-cc parity for the Antigravity (`agy` / Gemini 3.5) companion. Verified against agy 1.0.8.

### Added
- `/antigravity:adversarial-review` — red-team review that challenges whether the change should ship (ported from codex-plugin-cc's adversarial prompt). Read-only + sandboxed.
- **Opt-in stop-review-gate** — a `Stop` hook (`hooks/hooks.json`) runs Antigravity (Gemini 3.5) over the turn's working-tree diff using an `ALLOW:`/`BLOCK:` contract and blocks stopping on `BLOCK`. Off by default; toggle with `/antigravity:setup --enable-gate` / `--disable-gate`. **Fail-safe:** agy missing/quota/timeout/empty/garbled output, no diff, `stop_hook_active`, or `ANTIGRAVITY_CC_NO_GATE=1` all allow — a broken gate can never trap the user.
- `--model <label>` passthrough on delegate/review/adversarial-review/resume, behind an `agy --help` capability probe (agy 1.0.8+; warn+ignore on older builds).
- `--wait` — synchronous foreground run that returns the result inline (overrides `--background`).
- `--json` on review/adversarial-review — emits clean, schema-validated JSON (matching the new `schemas/review-output.schema.json`) with a structured fallback so stdout is always parseable.

### Fixed
- **logscan no longer false-positives on agy 1.0.8's benign startup errors.** agy logs ~30 `E`-level "not logged into Antigravity" lines before silent auth completes; `scanAgyLog` now only classifies errors after the auth-success marker, and treats "not logged in" as a real error only when auth never succeeded. Quota matching tightened to real quota errors (not the bare word "quota", which appears in `quotaRefreshLoop` info lines). Regression-tested against a real captured log.
- **Empty output is surfaced as a failure**, never a silent success — foreground and background `reconcile()` both report "no output" with a retry hint.
- **Reviews and the stop-gate now embed untracked (new) file CONTENT, not just filenames** (with binary/size guards), so a turn that adds new files can't slip past review/the gate unseen. *(Codex review finding.)*

### Notes
- No new runtime dependencies. Test suite expanded to 70 tests (`node --test`), CI on Node 18/20/22.
- Reviewed by OpenAI Codex (via the codex-plugin-cc rescue runtime): no critical/high findings; the two medium findings (`--json` cleanliness, untracked-content coverage) are fixed above.

## [0.1.0] — 2026-05-31

Initial release.

### Added
- `/antigravity:setup` — detect the `agy` binary, version, and auth state; offer to install if missing.
- `/antigravity:delegate` — hand a task to Antigravity (Gemini 3.5) via the `antigravity-pair` subagent; foreground or `--background`.
- `/antigravity:review` — get a read-only, cross-model code review of your current diff (or a branch via `--base <ref>`).
- `/antigravity:resume` — continue the most recent Antigravity conversation, or a specific one with `--conversation <id>`.
- `/antigravity:status`, `/antigravity:result`, `/antigravity:cancel` — manage background jobs.
- `antigravity-pair` subagent for delegation.
- Skills: `antigravity-cli-runtime`, `antigravity-result-handling`, `gemini-3-prompting`.
- Node companion runtime (`scripts/antigravity.mjs`) driving `agy --print` with robust log scanning:
  recovers the conversation ID and surfaces quota/auth/backend errors that `agy` hides behind exit code 0.

### Grounded against
- `agy` 1.0.3 (Antigravity CLI), macOS, May 2026.
