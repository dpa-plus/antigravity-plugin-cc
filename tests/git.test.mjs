import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveReviewTarget } from "../plugins/antigravity/scripts/lib/git.mjs";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "agy-gittest-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const g = (a) => execFileSync("git", a, { cwd: dir, env, encoding: "utf8" });
  g(["init", "-q"]);
  writeFileSync(join(dir, "a.txt"), "base\n");
  g(["add", "."]);
  g(["commit", "-q", "-m", "init"]);
  return dir;
}

test("resolveReviewTarget embeds untracked (new) file CONTENT, not just the name", () => {
  const dir = repo();
  writeFileSync(join(dir, "new.js"), "export const secret = 42; // brand new file\n");
  const t = resolveReviewTarget(dir, null);
  assert.equal(t.ok, true);
  assert.match(t.diff, /Untracked \(new\) files/);
  assert.match(t.diff, /new\.js/);
  assert.match(t.diff, /brand new file/); // the actual content reached the review payload
});

test("resolveReviewTarget reports nothing to review on a clean tree", () => {
  const t = resolveReviewTarget(repo(), null);
  assert.equal(t.ok, false);
});
