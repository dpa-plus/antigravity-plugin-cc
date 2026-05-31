# Contributing to antigravity-plugin-cc

Thanks for helping out. This plugin lets Claude Code users drive Google's
Antigravity CLI (`agy`, powered by Gemini 3.5) without leaving Claude Code.
Contributions that keep it thin, honest, and dependency-free are very welcome.

## Repo layout

```
.claude-plugin/marketplace.json      # marketplace "idun-antigravity" -> the plugin
plugins/antigravity/
  commands/                          # /antigravity:<name> slash commands (.md)
  agents/                            # antigravity:antigravity-pair subagent (.md)
  skills/                            # internal skills (SKILL.md, user-invocable: false)
  scripts/antigravity.mjs            # the Node companion (entry point)
  scripts/lib/agy.mjs                # the agy contract: flags, log parsing, job state
docs/antigravity-cli-reference.md    # the companion contract, written down
tests/                               # npm test, with a fake `agy` fixture
```

The plugin is intentionally thin. Commands forward to the companion; the
`antigravity-pair` subagent makes exactly one Bash call to
`antigravity.mjs delegate` and returns stdout verbatim.

## Running tests

```bash
npm test
```

Tests run against a fake `agy` fixture, so you do **not** need a real install,
a Google account, or any network access. Everything is offline.

## Testing against real agy locally

1. Install the CLI:
   - macOS/Linux: `curl -fsSL https://antigravity.google/cli/install.sh | bash`
     (lands in `~/.local/bin/agy`)
   - Windows: `irm https://antigravity.google/cli/install.ps1 | iex`
2. Sign in once, interactively. Auth is keyring/browser OAuth — there is no API
   key for the preview tier. In Claude Code, type `! agy` and complete the
   Google login. The plugin never authenticates for you.
3. Add this checkout as a local marketplace:
   `/plugin marketplace add /absolute/path/to/antigravity-plugin-cc`
4. Try `/antigravity:setup`, then `/antigravity:delegate`, `/antigravity:review`,
   and `/antigravity:resume`.

Heads up: the preview tier has a quota. When it's exhausted, `agy` exits 0 with
empty stdout and the companion surfaces the `RESOURCE_EXHAUSTED (429)` line from
the `--log-file`. That's expected behavior, not a bug.

## Keep the contract in sync

`docs/antigravity-cli-reference.md` and `scripts/lib/agy.mjs` describe the same
thing: how we invoke `agy` and parse its output. If `agy` changes a flag, the
log format, or its quota behavior, update **both** in the same PR. A drift
between the doc and the code is the one thing that will quietly break this
plugin for everyone.

A few facts that must stay true (don't contradict them):

- The binary is `agy`. Print mode is `agy -p`.
- There is **no** `--model` / `-m` flag. The model is picked with `/model`
  inside `agy` and persisted in `settings.json`. Never tell users to pass one.
- `delegate` is write-capable by default; `--read-only` / `--sandbox` contain it.
- `review` is always read-only and sandboxed.

## Code style

- Node ESM (`.mjs`), targeting the Node bundled with Claude Code.
- **Stdlib only.** No runtime dependencies, no `package.json` `dependencies`.
  If you reach for a package, find another way.
- Match the surrounding style: small functions, early returns, clear names.
- Command/agent/skill files follow the Claude Code conventions already in the
  repo — copy the frontmatter shape from an existing file rather than inventing.
- Voice in user-facing text: crisp and concrete, lead with what the user gets,
  honest about limits (preview quota, browser auth), no hype words.

## Opening a PR

1. Fork and branch off `main` (`git checkout -b fix/clearer-quota-message`).
2. Make the change. Run `npm test`. Add or update a test when behavior changes.
3. If you touched the `agy` contract, update the doc and `lib/agy.mjs` together.
4. Keep the PR focused — one concern per PR is easiest to review.
5. Open the PR with a short description of what changed and why. Mention whether
   you tested against real `agy` or only the fixture.

Questions or ideas? Open an issue first — happy to talk it through.

Licensed MIT. Built and maintained by [Idun Labs](https://idunplatform.com).
