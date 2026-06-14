// Plugin config: the opt-in stop-review-gate toggle lives here.
// Stored at ~/.antigravity-cc/config.json (override base with ANTIGRAVITY_CC_HOME).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { configPath } from "./paths.mjs";

export function readConfig(env = process.env) {
  try {
    return JSON.parse(readFileSync(configPath(env), "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(cfg, env = process.env) {
  const p = configPath(env);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2));
  return cfg;
}

/**
 * Is the stop-review-gate active? Off by default. The ANTIGRAVITY_CC_NO_GATE=1 env
 * is a hard kill-switch that overrides the stored toggle (escape hatch).
 */
export function isGateEnabled(env = process.env) {
  if (env.ANTIGRAVITY_CC_NO_GATE === "1") return false;
  return readConfig(env).gate === true;
}

export function setGate(enabled, env = process.env) {
  const cfg = readConfig(env);
  cfg.gate = Boolean(enabled);
  return writeConfig(cfg, env);
}
