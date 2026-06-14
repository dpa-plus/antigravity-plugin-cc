import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPrintArgs, goDurationToMs, agySupportsModel } from "../plugins/antigravity/scripts/lib/agy.mjs";

const FAKE_AGY = fileURLToPath(new URL("./fake-agy.mjs", import.meta.url));

test("buildPrintArgs puts -p <prompt> LAST", () => {
  const args = buildPrintArgs({
    prompt: "do the thing",
    yolo: true,
    logFile: "/tmp/x.log",
    printTimeout: "10m",
    addDirs: ["/repo"],
  });
  assert.equal(args[args.length - 2], "-p");
  assert.equal(args[args.length - 1], "do the thing");
});

test("buildPrintArgs includes expected flags in order (flags before prompt)", () => {
  const args = buildPrintArgs({
    prompt: "p",
    sandbox: true,
    yolo: true,
    addDirs: ["/a", "/b"],
    conversationId: "conv-1",
    logFile: "/l",
    printTimeout: "5m",
  });
  assert.deepEqual(args, [
    "--sandbox",
    "--dangerously-skip-permissions",
    "--add-dir",
    "/a",
    "--add-dir",
    "/b",
    "--conversation",
    "conv-1",
    "--log-file",
    "/l",
    "--print-timeout",
    "5m",
    "-p",
    "p",
  ]);
});

test("continueLast adds --continue", () => {
  const args = buildPrintArgs({ prompt: "x", continueLast: true });
  assert.ok(args.includes("--continue"));
});

test("buildPrintArgs threads --model <label> before the prompt", () => {
  const args = buildPrintArgs({ prompt: "p", model: "Gemini 3.5 Flash (High)", logFile: "/l" });
  const i = args.indexOf("--model");
  assert.ok(i !== -1, "--model present");
  assert.equal(args[i + 1], "Gemini 3.5 Flash (High)");
  assert.ok(i < args.indexOf("-p"), "--model comes before -p");
});

test("buildPrintArgs omits --model when none given", () => {
  const args = buildPrintArgs({ prompt: "p" });
  assert.ok(!args.includes("--model"));
});

test("agySupportsModel detects --model from the binary's help (cached)", () => {
  chmodSync(FAKE_AGY, 0o755);
  // fake-agy --help advertises --model
  assert.equal(agySupportsModel(FAKE_AGY), true);
  // a non-existent binary => false, never throws
  assert.equal(agySupportsModel("/nonexistent/agy-xyz"), false);
});

test("goDurationToMs parses composite and simple durations", () => {
  assert.equal(goDurationToMs("5m0s"), 300000);
  assert.equal(goDurationToMs("90s"), 90000);
  assert.equal(goDurationToMs("10m"), 600000);
  assert.equal(goDurationToMs("1h"), 3600000);
});

test("goDurationToMs falls back on garbage", () => {
  assert.equal(goDurationToMs("not-a-duration", 123), 123);
  assert.equal(goDurationToMs("", 456), 456);
});
