// Resolve the code-review target and produce a diff to hand to agy.
// Stdlib only (spawns git synchronously).

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { devNull } from "node:os";

function git(args, cwd) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };
}

const UNTRACKED_MAX_FILE_BYTES = 64 * 1024;
const UNTRACKED_TOTAL_BUDGET_BYTES = 200 * 1024;

/**
 * Produce real patches for untracked (new) files so reviews and the stop-gate actually
 * SEE new code, not just filenames. Uses `git diff --no-index /dev/null <file>` (which
 * exits non-zero by design — we read stdout regardless). Guards against binary and large
 * files, and caps the total embedded size.
 */
function untrackedDiffs(cwd, names) {
  const parts = [];
  let budget = UNTRACKED_TOTAL_BUDGET_BYTES;
  for (const file of names) {
    if (!file) continue;
    let size = 0;
    try {
      const st = statSync(join(cwd, file));
      if (!st.isFile()) continue;
      size = st.size;
    } catch {
      continue;
    }
    if (size > UNTRACKED_MAX_FILE_BYTES) {
      parts.push(`# (untracked ${file}: ${size} bytes — too large to embed)`);
      continue;
    }
    const patch = git(["diff", "--no-index", "--no-color", "--", devNull, file], cwd).stdout;
    if (!patch || /^Binary files /m.test(patch)) {
      parts.push(`# (untracked ${file}: binary or empty — not shown)`);
      continue;
    }
    if (patch.length > budget) {
      parts.push(`# (untracked ${file}: omitted — total untracked budget exceeded)`);
      continue;
    }
    budget -= patch.length;
    parts.push(patch);
  }
  return parts.join("\n");
}

export function isGitRepo(cwd) {
  return git(["rev-parse", "--is-inside-work-tree"], cwd).stdout === "true";
}

/**
 * Resolve what to review.
 *  - base provided  -> diff base...HEAD (branch review) + any uncommitted changes
 *  - no base        -> uncommitted changes (staged + unstaged) vs HEAD
 *
 * @returns {{ ok: boolean, label: string, diff: string, stat: string, reason?: string }}
 */
export function resolveReviewTarget(cwd, base) {
  if (!isGitRepo(cwd)) {
    return { ok: false, label: "(not a git repo)", diff: "", stat: "", reason: "not a git repository" };
  }

  if (base) {
    const exists = git(["rev-parse", "--verify", "--quiet", base], cwd).ok;
    if (!exists) {
      return { ok: false, label: base, diff: "", stat: "", reason: `base ref "${base}" not found` };
    }
    const range = `${base}...HEAD`;
    const diff = git(["diff", "--no-color", range], cwd).stdout;
    const stat = git(["diff", "--stat", range], cwd).stdout;
    const working = git(["diff", "--no-color", "HEAD"], cwd).stdout;
    const combined = [diff, working ? `\n# Uncommitted working-tree changes:\n${working}` : ""].join("");
    return {
      ok: combined.trim().length > 0,
      label: `${base}...HEAD (+ working tree)`,
      diff: combined,
      stat,
      reason: combined.trim().length === 0 ? "no changes against base" : undefined,
    };
  }

  // Uncommitted changes against HEAD (staged + unstaged), plus untracked file CONTENT.
  const tracked = git(["diff", "--no-color", "HEAD"], cwd).stdout;
  const staged = git(["diff", "--no-color", "--cached"], cwd).stdout;
  const stat = git(["diff", "--stat", "HEAD"], cwd).stdout;
  const untrackedNames = git(["ls-files", "--others", "--exclude-standard"], cwd).stdout;

  const parts = [];
  if (tracked) parts.push(tracked);
  if (staged && staged !== tracked) parts.push(`\n# Staged changes:\n${staged}`);
  if (untrackedNames) {
    const ud = untrackedDiffs(cwd, untrackedNames.split(/\r?\n/).filter(Boolean));
    if (ud) parts.push(`\n# Untracked (new) files:\n${ud}`);
  }
  const diff = parts.join("\n");

  return {
    ok: diff.trim().length > 0,
    label: "uncommitted changes (HEAD)",
    diff,
    stat,
    reason: diff.trim().length === 0 ? "no uncommitted changes to review" : undefined,
  };
}
