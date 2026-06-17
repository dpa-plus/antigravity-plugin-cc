// Build and run `agy` print-mode invocations.
//
// Flag ordering matters: we place ALL flags first and `-p <prompt>` LAST. This is
// robust whether agy treats `-p/--print` as a boolean mode flag (prompt is then a
// trailing positional) or as a string flag (prompt is its value). Either way,
// `... <flags> -p "<prompt>"` is parsed correctly.

import { spawn, spawnSync } from "node:child_process";
import { openSync, readFileSync, existsSync } from "node:fs";

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string[]} [opts.addDirs]
 * @param {boolean} [opts.yolo]            --dangerously-skip-permissions
 * @param {boolean} [opts.sandbox]         --sandbox
 * @param {string}  [opts.model]           --model <label> (agy 1.0.8+; ignored upstream if absent)
 * @param {boolean} [opts.continueLast]    --continue
 * @param {string}  [opts.conversationId]  --conversation <id>
 * @param {string}  [opts.logFile]         --log-file <path>
 * @param {string}  [opts.printTimeout]    --print-timeout <go-dur>, e.g. "10m"
 * @returns {string[]}
 */
export function buildPrintArgs(opts) {
  const args = [];
  if (opts.sandbox) args.push("--sandbox");
  if (opts.yolo) args.push("--dangerously-skip-permissions");
  if (opts.model) args.push("--model", opts.model);
  for (const dir of opts.addDirs || []) {
    if (dir) args.push("--add-dir", dir);
  }
  if (opts.continueLast) args.push("--continue");
  if (opts.conversationId) args.push("--conversation", opts.conversationId);
  if (opts.logFile) args.push("--log-file", opts.logFile);
  if (opts.printTimeout) args.push("--print-timeout", opts.printTimeout);
  args.push("-p", opts.prompt);
  return args;
}

/** Parse a Go duration string ("5m0s", "90s", "10m") to milliseconds. Fallback 5m. */
export function goDurationToMs(value, fallbackMs = 5 * 60 * 1000) {
  if (typeof value !== "string" || !value.trim()) return fallbackMs;
  let total = 0;
  let matched = false;
  // Longest unit first so "500ms" matches ms, not m (minutes) then a stray s.
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    matched = true;
    const n = parseFloat(m[1]);
    const unit = m[2];
    if (unit === "h") total += n * 3600000;
    else if (unit === "m") total += n * 60000;
    else if (unit === "s") total += n * 1000;
    else if (unit === "ms") total += n;
  }
  return matched ? total : fallbackMs;
}

function readLogSafe(logFile) {
  try {
    if (logFile && existsSync(logFile)) return readFileSync(logFile, "utf8");
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Run agy print mode synchronously (foreground) with a hard watchdog timeout in
 * addition to agy's own --print-timeout.
 *
 * @returns {{ stdout: string, stderr: string, code: number|null, signal: string|null,
 *             timedOut: boolean, logText: string, logFile: string|undefined, error?: string }}
 */
export function runForeground({ bin, args, cwd, logFile, watchdogMs }) {
  const res = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    timeout: watchdogMs,
    killSignal: "SIGKILL",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const timedOut = res.error && /ETIMEDOUT/i.test(String(res.error.code || res.error.message || ""));
  return {
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    code: res.status,
    signal: res.signal || null,
    timedOut: Boolean(timedOut),
    logText: readLogSafe(logFile),
    logFile,
    error: res.error && !timedOut ? String(res.error.message || res.error.code) : undefined,
  };
}

/**
 * Spawn agy print mode detached for background execution.
 * stdout -> outputFile, stderr -> errFile, agy log -> (its own --log-file).
 *
 * @returns {{ pid: number }}
 */
export function spawnBackground({ bin, args, cwd, outputFile, errFile }) {
  const out = openSync(outputFile, "a");
  const err = openSync(errFile, "a");
  const child = spawn(bin, args, {
    cwd,
    detached: true,
    stdio: ["ignore", out, err],
  });
  child.unref();
  return { pid: child.pid };
}

/**
 * Best-effort capability probe: does this agy build accept `--model`?
 * agy 1.0.8 does; older builds (≤1.0.3) don't and would error on an unknown flag.
 * Cached per binary path for the lifetime of the process.
 */
const _modelSupport = new Map();
export function agySupportsModel(bin) {
  if (_modelSupport.has(bin)) return _modelSupport.get(bin);
  try {
    const res = spawnSync(bin, ["--help"], { encoding: "utf8", timeout: 15000 });
    // Transient failure (spawn error / timeout): do NOT cache, so a one-off blip
    // doesn't silently disable --model for the rest of the process.
    if (res.error || res.status === null) return false;
    const supported = /(^|\s)--model\b/.test(`${res.stdout || ""}${res.stderr || ""}`);
    _modelSupport.set(bin, supported);
    return supported;
  } catch {
    return false;
  }
}

/** Quick `agy --version`. Returns version string or null. */
export function agyVersion(bin) {
  try {
    const res = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15000 });
    if (res.status === 0) return (res.stdout || res.stderr || "").trim().split(/\r?\n/)[0] || null;
  } catch {
    /* ignore */
  }
  return null;
}

export { readLogSafe };
