---
description: Check whether the Antigravity CLI (agy, Gemini 3.5) is installed and signed in, and install it if it's missing.
argument-hint: '[--json]'
allowed-tools: Bash(node:*), Bash(curl:*), Bash(bash:*), AskUserQuestion
---

Detect the state of the Antigravity CLI. Run exactly this:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity.mjs" setup --json $ARGUMENTS
```

Read the JSON: `{ ready, installed, binaryPath, version, authedGuess, configDir }`.

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
