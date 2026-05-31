import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrintArgs, goDurationToMs } from "../plugins/antigravity/scripts/lib/agy.mjs";

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
