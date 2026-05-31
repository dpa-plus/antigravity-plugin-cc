# Changelog

All notable changes to the `antigravity` plugin are documented here.

## [0.1.0] — 2026-05-31

Initial release.

### Added
- `/antigravity:setup` — detect the `agy` binary, version, and auth state; offer to install if missing.
- `/antigravity:delegate` — hand a task to Antigravity (Gemini 3) via the `antigravity-pair` subagent; foreground or `--background`.
- `/antigravity:review` — get a read-only, cross-model code review of your current diff (or a branch via `--base <ref>`).
- `/antigravity:resume` — continue the most recent Antigravity conversation, or a specific one with `--conversation <id>`.
- `/antigravity:status`, `/antigravity:result`, `/antigravity:cancel` — manage background jobs.
- `antigravity-pair` subagent for delegation.
- Skills: `antigravity-cli-runtime`, `antigravity-result-handling`, `gemini-3-prompting`.
- Node companion runtime (`scripts/antigravity.mjs`) driving `agy --print` with robust log scanning:
  recovers the conversation ID and surfaces quota/auth/backend errors that `agy` hides behind exit code 0.

### Grounded against
- `agy` 1.0.3 (Antigravity CLI), macOS, May 2026.
