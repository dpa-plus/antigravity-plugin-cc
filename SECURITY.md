# Security Policy

## Supported versions

The latest released `0.x` version is supported. This is a pre-1.0 project; please
test against the newest release before reporting.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

- Preferred: open a [private security advisory](https://github.com/dpa-plus/antigravity-plugin-cc/security/advisories/new).
- Or email **security@dpa.plus** with details and a reproduction.

We aim to acknowledge within a few days.

## Scope & threat model

This plugin drives the local `agy` (Antigravity / Gemini) CLI from Claude Code on the
user's own machine, under the user's own credentials. Relevant hardening already in place:

- The opt-in **stop-review gate** and the review prompts wrap untrusted diffs in
  per-call nonce delimiters and treat them strictly as data; the gate parses only the
  first verdict line and fail-safes to BLOCK.
- Read-only reviews never pass `--dangerously-skip-permissions`.
- `agy` is spawned with explicit argv arrays (no shell), so prompt/flag values can't
  inject shell commands.

Out of scope: anything requiring an already-compromised local environment (e.g. an
attacker who can set `ANTIGRAVITY_CC_AGY_BIN` to a malicious binary, or modify the repo's
git config). `delegate` is write-capable by default by design — see the README Privacy
section.
