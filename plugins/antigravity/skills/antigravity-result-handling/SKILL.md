---
name: antigravity-result-handling
description: "How to interpret Antigravity companion output — successful responses, quota/auth/backend errors, and applying file changes"
user-invocable: false
---

# Reading Antigravity companion output

The companion (`scripts/antigravity.mjs`) wraps the `agy` binary and returns Markdown on stdout. Your job is to read that output and turn it into something useful for the developer. This is what to do for each case.

Two things to remember before anything else:

- **`delegate` is write-capable.** Unless the call used `--read-only` or `--sandbox`, Antigravity (Gemini 3.5) may have already edited files or run commands in the repo. Changes can be on disk right now. Verify with `git diff` / `git status` before you describe or trust them.
- **Every finished response carries a conversation id footer.** That id is what enables `/antigravity:resume` and the raw `agy --conversation <id>`. Always surface it when present.

---

## Case 1 — Normal response

The common case: Gemini 3.5 answered.

1. **Lead with Gemini's answer.** Put the substance first. Don't bury it under your own preamble or restate the contract. The developer asked Antigravity a question — give them the answer.
2. **If it touched files, verify before you summarize.** Run `git diff` (or `git status` for new/deleted files) and describe what actually changed, not what the output claims changed. If the diff is large, summarize by file and intent. If a change looks wrong or risky, say so plainly and point at the exact hunk.
3. **If it ran commands**, note what ran and the outcome.
4. **Surface the conversation id footer.** Tell the developer they can continue this thread with `/antigravity:resume` (or `agy --conversation <id>` directly). This matters most when the task is half-done or worth iterating on.

If `delegate` ran with `--read-only` or `--sandbox`, there are no on-disk changes to verify — the response is advisory only. Say that, so the developer knows nothing was applied.

---

## Case 2 — Quota exhausted (RESOURCE_EXHAUSTED / 429)

On the preview tier, `agy` exits 0 with **empty stdout** when quota runs out. The companion catches this by scanning the log file and surfaces a line like:

```
RESOURCE_EXHAUSTED (429) ... Resets in <dur>
```

When you see this:

- Tell the developer their Antigravity quota is exhausted, and quote the reset window (`Resets in <dur>`).
- Offer the realistic options: **wait** for the reset, or **switch to another Google account** and re-auth (`! agy`, then `/model` if needed).
- Make clear **Claude can keep working in the meantime** — the quota limit is on Antigravity/Gemini, not on you. Don't stall the developer waiting on a second model.

There is no API key and no paid override for the preview tier, so don't suggest one.

---

## Case 3 — Not authenticated

Auth is Google OAuth via keyring/browser — there's no key the plugin can set, and the plugin never logs anyone in. If the output indicates the user has never signed in (or `setup` reported `authedGuess: false` and a call produced an auth error):

- Tell the developer to run **`agy` once interactively**. Inside Claude Code that means typing **`! agy`** to drop into the Antigravity TUI, completing the browser sign-in, then exiting.
- After that, `delegate` / `review` / `resume` will work headlessly. Re-run the original command.

Don't try to authenticate for them and don't ask for credentials.

---

## Case 4 — Backend or timeout error

Other failures — backend errors, network issues, or a print run that hit `--print-timeout` before finishing — should be surfaced verbatim, not swallowed.

- Show the error the companion reported.
- If it timed out, suggest a longer budget: re-run with **`--print-timeout`** set higher (Go duration, e.g. `10m`, `20m`), or run it **`--background`** and pick the result up later with `/antigravity:status` and `/antigravity:result`.
- If a conversation id is present in the output, mention that `/antigravity:resume` can pick the thread back up rather than starting over.

---

## The conversation id footer

When the companion can recover a conversation id (it pulls this from `agy`'s log even when stdout is empty), it prints it in a footer. Treat it as the thread handle:

- `/antigravity:resume <follow-up>` continues the most recent conversation, or a specific one with `--conversation <id>`.
- `agy --conversation <id>` opens the same thread directly in the TUI.

Pass the id along whenever the work isn't obviously finished — it's the cheapest way for the developer to keep going with the same context.

---

## Quick reference

| Signal in output | What it means | What you do |
|---|---|---|
| Answer text + (maybe) diff | Normal response | Lead with the answer; `git diff` to verify any file edits; surface conversation id |
| `RESOURCE_EXHAUSTED (429) ... Resets in <dur>` | Preview quota gone | Report reset window; suggest wait or switch account; note Claude can continue |
| Auth error / never signed in | Not logged into Google | Tell them to run `! agy` once, then re-run |
| Backend error / timeout | Run failed or ran out of time | Surface verbatim; suggest higher `--print-timeout` or `--background` |
| Conversation id footer | Thread handle | Offer `/antigravity:resume` or `agy --conversation <id>` |

Always remember `delegate` writes by default — when in doubt, check `git diff`.
