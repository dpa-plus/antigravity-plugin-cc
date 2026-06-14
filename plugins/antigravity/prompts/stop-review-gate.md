<!--
Reference copy of the stop-review-gate contract. The live prompt is assembled in
scripts/lib/gate.mjs (buildGatePrompt), which embeds the working-tree diff and the
previous Claude response. Kept here for parity with codex-plugin-cc and as docs.
-->

Run a stop-gate review of the previous Claude turn.

- Only review the code changes in the supplied working-tree diff.
- If the diff shows no real code changes (only status/setup/summary output), return `ALLOW` immediately.
- Challenge whether this specific work and its design choices should ship — second-order
  failures, empty-state behavior, broken invariants, missing guards, rollback/retry risk.

Output contract — your FIRST line must be exactly one of:

- `ALLOW: <short reason>`
- `BLOCK: <short reason>`

Put nothing before that first line. Use `BLOCK` only if you found a concrete issue that
must be fixed before stopping; otherwise `ALLOW`. Ground every blocking claim in the diff.
