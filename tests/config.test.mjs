import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, setGate, isGateEnabled } from "../plugins/antigravity/scripts/lib/config.mjs";

function homeEnv() {
  return { ANTIGRAVITY_CC_HOME: mkdtempSync(join(tmpdir(), "agy-cfg-")) };
}

test("gate is off by default (no config file)", () => {
  const env = homeEnv();
  assert.equal(isGateEnabled(env), false);
  assert.deepEqual(readConfig(env), {});
});

test("setGate persists and isGateEnabled reflects it", () => {
  const env = homeEnv();
  setGate(true, env);
  assert.equal(isGateEnabled(env), true);
  assert.equal(readConfig(env).gate, true);
  setGate(false, env);
  assert.equal(isGateEnabled(env), false);
});

test("ANTIGRAVITY_CC_NO_GATE=1 hard-overrides a stored on-toggle", () => {
  const env = homeEnv();
  setGate(true, env);
  assert.equal(isGateEnabled({ ...env, ANTIGRAVITY_CC_NO_GATE: "1" }), false);
});
