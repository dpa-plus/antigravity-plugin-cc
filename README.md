# 🛰️ antigravity-plugin-cc

> Drive Google's Antigravity CLI (`agy`, powered by Gemini 3) without leaving Claude Code.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Built by Idun Labs](https://img.shields.io/badge/built%20by-Idun%20Labs-6E56CF.svg)](https://github.com/Idun-Group)
[![Powered by agy / Gemini 3](https://img.shields.io/badge/powered%20by-agy%20%2F%20Gemini%203-4285F4.svg)](https://antigravity.google/docs/cli-overview)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Idun-Group/antigravity-plugin-cc/pulls)

A Claude Code plugin that hands work to `agy` — Google's Antigravity CLI — and brings the result back into your session. You stay in Claude Code; Gemini 3 becomes a second model on tap. Think of it as the Antigravity counterpart to [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc).

---

## What you get

Seven slash commands, all under the `/antigravity:` namespace. Each one shells out to a small Node companion that wraps `agy` in headless (`-p`) mode and manages background jobs.

- **`/antigravity:setup`** — check that `agy` is installed, find its binary and version, and get a best-effort read on whether you're signed in. Never logs you in.
- **`/antigravity:delegate`** — hand a task to Gemini 3. Write-capable by default; can be sandboxed or made read-only, and can run in the background.
- **`/antigravity:review`** — read-only cross-model review of your current diff (or `base...HEAD`). Sandboxed.
- **`/antigravity:resume`** — continue the most recent Antigravity conversation (or a specific one) with a follow-up.
- **`/antigravity:status`** — list background jobs for this repo, or inspect one.
- **`/antigravity:result`** — print the final output of a finished job, plus the conversation id and a resume hint.
- **`/antigravity:cancel`** — stop a running background job.

---

## Why

You already trust Claude Code for the loop you're in. Sometimes you want a different model in the room — a second opinion on a thorny diff, a second pair of hands on a parallel task, or simply a separate quota when you'd rather not spend yours.

This plugin makes that one slash command away:

- **Second opinion.** `/antigravity:review` sends your diff to Gemini 3 and reads its critique back. Different model, different blind spots — useful precisely because it isn't the model that wrote the code.
- **Second pair of hands.** `/antigravity:delegate` offloads a self-contained task (a refactor, a script, a migration) to `agy` while you keep working. Run it in the background and collect the result later.
- **Separate quota.** `agy` runs on your own local Antigravity auth and its own free-preview quota. Offloading to it doesn't draw down your Claude Code usage.

No new account, no API keys, no context switch. If you have `agy` installed and signed in, you have a second model.

---

## Requirements

- **`agy`** — the Antigravity CLI, installed and signed in (Google account, browser OAuth, free preview tier). See install one-liners below.
- **Node.js >= 18** — the companion is a small ESM script with zero runtime dependencies.

Install `agy`:

```bash
# macOS / Linux  →  installs to ~/.local/bin/agy
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

```powershell
# Windows
irm https://antigravity.google/cli/install.ps1 | iex
```

Then sign in once, interactively (this opens a browser):

```bash
agy
```

In Claude Code you can do this without leaving the session — type `! agy`, complete the OAuth flow, then quit the TUI.

---

## Install

```text
/plugin marketplace add Idun-Group/antigravity-plugin-cc
/plugin install antigravity@idun-antigravity
/antigravity:setup
```

`/antigravity:setup` confirms `agy` is reachable and tells you what to fix if it isn't.

---

## Usage

### `/antigravity:review` ⭐

Cross-model review of your working tree. Read-only and sandboxed — `agy` reads the diff, it doesn't touch your files.

```text
/antigravity:review
/antigravity:review focus on error handling and edge cases
/antigravity:review --base main the auth refactor in this branch
```

Returns Gemini 3's review of the embedded diff. Pair it with your own review for two models on one change.

### `/antigravity:delegate` ⭐

Hand a task to Gemini 3. Write-capable by default — it can edit files and run commands — so contain it when you want to.

```text
/antigravity:delegate add a --json flag to the export command and update the tests
/antigravity:delegate --read-only explain how the retry logic in client.ts works
/antigravity:delegate --sandbox draft a migration script for the new schema
```

Background flow — kick it off, keep working, collect later:

```text
/antigravity:delegate --background port the utils module from CommonJS to ESM
   → returns a job id, e.g. agy-l3k9zf-a8x2qd

/antigravity:status
   → agy-l3k9zf-a8x2qd   running   "port the utils module…"

/antigravity:status agy-l3k9zf-a8x2qd
   → agy-l3k9zf-a8x2qd   done

/antigravity:result agy-l3k9zf-a8x2qd
   → final output + conversation id + a /antigravity:resume hint
```

> Job ids look like `agy-<id>`; conversation ids are UUIDs (e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479`). `status`/`result`/`cancel` accept a job id, and default to the latest job when you omit it.

### `/antigravity:resume`

Continue the last Antigravity conversation (or a specific one) with a follow-up.

```text
/antigravity:resume now add unit tests for the code you just wrote
/antigravity:resume --conversation f47ac10b-58cc-4372-a567-0e02b2c3d479 also handle the empty-input case
```

### `/antigravity:status` · `/antigravity:result` · `/antigravity:cancel`

```text
/antigravity:status                      # all jobs for this repo
/antigravity:result                      # latest finished job's output
/antigravity:cancel agy-l3k9zf-a8x2qd    # stop a running job
```

---

## How it works

The plugin is a thin layer over `agy`'s headless mode. Honestly, most of the value is in the plumbing:

- **Headless delegation.** Commands run `agy -p "<task>"` and stream the result back. `delegate` is write-capable; `review` is sandboxed and read-only.
- **Background jobs.** `--background` spawns a detached run, tracks it per-repo, and lets you poll with `status` / collect with `result` / stop with `cancel`.
- **Error surfacing — the differentiator.** On quota exhaustion, `agy` exits `0` with **empty stdout** — success-looking, but nothing happened. The companion scans `agy`'s `--log-file` to catch that case and surface the real signal: `RESOURCE_EXHAUSTED (429) … Resets in <duration>`, auth failures, and backend errors that the exit code hides. It also recovers the **conversation id** from the log so `resume` and `result` actually work.

**On model selection:** there is no `--model` flag on `agy`. The model (default Gemini 3.5 Flash) is chosen with `/model` *inside* `agy` and persisted in its `settings.json`. Run `! agy`, type `/model`, pick one — that choice sticks for headless runs too.

---

## Troubleshooting / FAQ

**"RESOURCE_EXHAUSTED" / quota exhausted.**
You've hit the free-preview limit. The quota is **per Google account** (`agy` reports *"Individual quota reached"*), and the companion tells you when it resets (e.g. *"Resets in 152h"*). Options: wait for the reset, or sign `agy` into a different Google account (`! agy`, then sign in). Claude Code can keep handling the task itself in the meantime. This is a preview-tier limit, not a bug.

**Empty output but no error.**
Almost always quota — `agy` exits `0` with empty stdout when exhausted. Re-run the command; the companion reads the log and should now report the `RESOURCE_EXHAUSTED` reset time.

**"Not authenticated" / setup says you're not signed in.**
Run `agy` once interactively to complete the Google browser OAuth: in Claude Code, type `! agy`, sign in, then quit. The plugin never authenticates for you.

**`agy` is in a custom path.**
The companion looks on `PATH`, then `~/.local/bin/agy`. To point it elsewhere, set `ANTIGRAVITY_CC_AGY_BIN` to the full path of your binary.

**Do I need a separate account or an API key?**
No. There's no API key for the preview tier. The plugin uses whatever local `agy` auth you already have — sign in once with your Google account and you're set.

**A background job is stuck.**
`/antigravity:status agy-<id>` to inspect it, `/antigravity:cancel agy-<id>` to stop it.

---

## Relationship to Antigravity's own plugins

`agy` has its own plugin system and can even import Claude-compatible plugins (`agy plugin import claude`). That's the *other* direction — extending Antigravity with Claude-shaped tooling.

This project lives on the **Claude Code side**: it lets Claude Code drive `agy`. The two are complementary; neither requires the other.

---

## Credits

Built and maintained by **[Idun Labs](https://github.com/Idun-Group)** — makers of an [open-source platform for governing AI agents in production](https://idunplatform.com).

- Antigravity CLI docs → https://antigravity.google/docs/cli-overview
- Inspiration → [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc)

Licensed under [MIT](./LICENSE). PRs welcome.

Independent project. Not affiliated with, endorsed by, or sponsored by Google or Anthropic. "Antigravity", "Gemini", and "Claude Code" belong to their respective owners.
