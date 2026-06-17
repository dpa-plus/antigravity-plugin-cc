# 🛰️ Antigravity plugin for Claude Code

<p align="center">
  <img src="./assets/banner.png" alt="Claude Code × Antigravity — drive Google's agy CLI (Gemini 3.5) without leaving Claude Code" width="100%">
</p>

> **A second model inside Claude Code.** Hand a diff or a task to Google's Antigravity CLI (`agy`, Gemini 3.5) and get the answer back — without leaving your session.

[![CI](https://github.com/dpa-plus/antigravity-plugin-cc/actions/workflows/ci.yml/badge.svg)](https://github.com/dpa-plus/antigravity-plugin-cc/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/dpa-plus/antigravity-plugin-cc?sort=semver&color=6E56CF)](https://github.com/dpa-plus/antigravity-plugin-cc/releases)
[![License: MIT](https://img.shields.io/github/license/dpa-plus/antigravity-plugin-cc?color=green)](./LICENSE)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg)](./package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dpa-plus/antigravity-plugin-cc/pulls)

**For Claude Code users who want Gemini 3.5 as a second opinion or a second pair of hands** — code review, adversarial review, delegated tasks, and an optional "don't let me ship a bug" gate. The Antigravity counterpart to [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc). No API key, no new account — just your local `agy` login.

---

## See it in action

```text
$ /antigravity:review

# 🛰️ Antigravity — review (Gemini 3.5)
Verdict: needs work

• Critical · cart.js:12 — checkout() passes `percent = undefined` when there's no coupon,
   so `amount - amount * undefined` = NaN. Breaks every normal (no-coupon) checkout.
• High     · applyCoupon() never clamps `percent`; a value > 1 returns a negative total
   ("checkout for free, or get paid by the store").
• Medium   · float precision (19.990000000000002) will trip payment gateways.
```

Real output. A *different* model reviewing your diff catches what the model that wrote it won't.

---

## What you get

| Command | What it does |
|---|---|
| **`/antigravity:review`** ⭐ | Read-only cross-model review of your diff (or a branch). `--json` for structured output. |
| **`/antigravity:adversarial-review`** | Skeptical red-team review — *should this ship at all?* |
| **`/antigravity:delegate`** ⭐ | Hand a task to Gemini 3.5 (write-capable; `--read-only` / `--sandbox` to contain it). |
| **`/antigravity:resume`** | Continue the last conversation with a follow-up. |
| **`/antigravity:setup`** | Check `agy` is installed + signed in; toggle the review gate. |
| **`/antigravity:status` · `result` · `cancel`** | Manage background jobs. |

**Flags:** `--background` (detach into a tracked job) · `--wait` (block for the result) · `--model <label>` · `--json`

**⭐ Opt-in review gate** — turn it on and Gemini reviews *every code-changing turn* before Claude can stop, blocking on real issues. A cross-model safety net. Off by default; fails safe.

---

## Requirements

- **`agy`** — the Antigravity CLI, installed and signed in (Google OAuth, free preview tier).
- **Node.js ≥ 18** — the companion is a zero-dependency ESM script.

```bash
# install agy (macOS / Linux → ~/.local/bin/agy)
curl -fsSL https://antigravity.google/cli/install.sh | bash
# sign in once (opens a browser); in Claude Code use:  ! agy
agy
```
<sub>Windows: `irm https://antigravity.google/cli/install.ps1 | iex`</sub>

---

## Install

```text
/plugin marketplace add dpa-plus/antigravity-plugin-cc
/plugin install antigravity@dpa-antigravity
/antigravity:setup
```

`/antigravity:setup` confirms `agy` is reachable and signed in, and tells you what to fix if not.

---

## Usage

### Review your work ⭐
```text
/antigravity:review                          # uncommitted changes vs HEAD
/antigravity:review --base main              # the whole branch vs main
/antigravity:review security and edge cases  # steer the focus
/antigravity:review --json                   # structured JSON output
```
Read-only and sandboxed — Gemini reads the diff, it never touches your files.

### Challenge the change
```text
/antigravity:adversarial-review
/antigravity:adversarial-review --base main  rollback safety of the new writer
```
A skeptical pass: what breaks, which assumptions fail, whether it should ship at all.

### Delegate a task ⭐
```text
/antigravity:delegate add a --csv flag to the export script and update its tests
/antigravity:delegate --read-only explain the retry logic in client.ts
/antigravity:delegate --background port utils from CommonJS to ESM   # then: /status, /result
```
Write-capable by default — it can edit files and run commands. Add `--read-only` or `--sandbox` to contain it.

### Continue & manage jobs
```text
/antigravity:resume now add unit tests for that
/antigravity:status               # background jobs for this repo
/antigravity:result               # latest finished job's output
/antigravity:cancel <job-id>
```

---

## The review gate (optional, off by default)

```text
/antigravity:setup --enable-gate      # turn it on
/antigravity:setup --disable-gate     # turn it off
```

When **on**, every time Claude tries to end a turn that changed code, Gemini reviews the diff and **blocks the stop if it finds a real issue** — so a second model signs off before you move on.

**Fails safe:** if `agy` is missing, rate-limited, times out, or returns anything unclear, it lets you stop — it can never trap you. Hard kill-switch: `ANTIGRAVITY_CC_NO_GATE=1`.

---

## How it works

A thin, zero-dependency Node companion drives `agy -p` and smooths the rough edges:

- **Background jobs** — `--background` detaches and tracks the run per-repo; poll with `status`, collect with `result`, stop with `cancel`.
- **Honest errors** — on quota exhaustion `agy` exits `0` with *empty stdout* (looks fine, did nothing). The companion reads `agy`'s log to surface the real signal — `RESOURCE_EXHAUSTED`, the reset time, auth/backend errors — and recovers the conversation id so `resume` works.
- **Injection-resistant gate** — untrusted diffs are wrapped in per-call nonce delimiters and treated strictly as data; the gate parses only the verdict line and fails safe, so repo content can't steer it.

**Model selection:** `agy` 1.0.8+ takes `--model <label>`; the companion probes support and passes it through (warns + ignores on older builds). With no `--model`, the default is whatever you set via `/model` inside `agy`.

---

## Privacy

`delegate` / `review` send your working-directory contents and diffs to **Google's Antigravity** (`agy`, Gemini 3.5) under **your own** Google account — that's the second model at work. No servers, no telemetry, nothing sent anywhere else. `ANTIGRAVITY_CC_AGY_BIN` runs whatever binary it points at, so set it only to a trusted path.

---

## FAQ

**Quota / "RESOURCE_EXHAUSTED"?** The free-preview limit, per Google account. The companion shows the reset time — wait it out, or sign `agy` into another account (`! agy`). Claude Code can keep working meanwhile.
**Empty output, no error?** Almost always quota — re-run; the companion reads the log and reports the reset time.
**Not signed in?** Run `agy` once (`! agy`) and complete the Google OAuth. The plugin never logs you in.
**Need an API key?** No — the preview tier uses your local `agy` Google auth.

---

## Credits

A [**dpa-plus**](https://github.com/dpa-plus) project, inspired by [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc). Licensed [MIT](./LICENSE). PRs welcome — see [CONTRIBUTING](./CONTRIBUTING.md) and [SECURITY](./SECURITY.md).

Independent project. Not affiliated with, endorsed by, or sponsored by Google or Anthropic. "Antigravity", "Gemini", and "Claude Code" belong to their respective owners.
