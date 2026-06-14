---
description: Check whether the Antigravity CLI (agy, Gemini 3.5) is installed and signed in, install it if missing, and toggle the stop-review-gate.
argument-hint: '[--json] [--enable-gate | --disable-gate]'
allowed-tools: Bash(node:*), Bash(curl:*), Bash(bash:*), AskUserQuestion
---

Detect the state of the Antigravity CLI. Run exactly this (forward `$ARGUMENTS` so any gate toggle is applied):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity.mjs" setup --json $ARGUMENTS
```

Read the JSON: `{ ready, installed, binaryPath, version, authedGuess, configDir, gate }`.

## Stop-review-gate toggle

`--enable-gate` / `--disable-gate` turn the optional stop-review-gate on or off (persisted in
`~/.antigravity-cc/config.json`). When **on**, every time Claude tries to finish a turn that
changed code, Antigravity (Gemini 3.5) reviews the working-tree diff and can **block** stopping
until issues are addressed — a cross-model safety net. It is **off by default**. It fails safe:
if agy is missing, rate-limited, times out, or returns anything that isn't an explicit `BLOCK`,
the stop is allowed. Hard kill-switch: `ANTIGRAVITY_CC_NO_GATE=1`.

**If `installed` is `false`** — the `agy` binary wasn't found:
- Use `AskUserQuestion` exactly once to offer installing it. Two options, install first:
  - `Install Antigravity CLI (Recommended)`
  - `Skip for now`
- If the user picks install, run:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

- Then rerun the detection:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity.mjs" setup --json $ARGUMENTS
```

- If the user picks skip, don't install. Move on to the output step with the original result.

**If `installed` is `true`** — don't ask about installation.

**If `installed` is `true` but `authedGuess` is `false`** — `agy` is here but you're probably not signed in. Sign-in is browser OAuth with your Google account; there's no API key for the preview tier, and this command never authenticates for you. Tell the user to run `agy` once interactively to finish the browser sign-in — in Claude Code, type `! agy` and complete the Google flow, then come back and run `/antigravity:setup` again.

**Final output** — present the human-readable setup by running the same command without `--json`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity.mjs" setup $ARGUMENTS
```

Show that output to the user. If installation was skipped, show the original detection result instead. Don't invent flags or claim a sign-in you didn't verify.
