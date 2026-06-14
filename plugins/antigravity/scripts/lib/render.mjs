// Render companion output as Markdown that Claude relays to the user verbatim.

function ensureTrailingNewline(s) {
  return s.endsWith("\n") ? s : `${s}\n`;
}

function resumeFooter({ conversationId, jobId } = {}) {
  const lines = [];
  if (conversationId) {
    lines.push("", "---", `Antigravity conversation: \`${conversationId}\``);
    lines.push("Continue this thread: `/antigravity:resume <follow-up>`  ·  reopen in the TUI: `agy --conversation " + conversationId + "`");
  }
  if (jobId) {
    lines.push(`Job: \`${jobId}\``);
  }
  return lines;
}

/** Successful agy response (delegate / resume). The model text leads. */
export function renderResponse(responseText, meta = {}) {
  const body = (responseText || "").trim();
  const header = meta.title ? [`# 🛰️ Antigravity — ${meta.title}`, ""] : ["# 🛰️ Antigravity", ""];
  const lines = [...header, body || "_(Antigravity returned an empty response.)_", ...resumeFooter(meta)];
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

/** Quota / auth / backend error, with concrete next steps. */
export function renderError(error, meta = {}) {
  const lines = [`# 🛰️ Antigravity — ${meta.title || "error"}`, ""];
  if (!error) {
    lines.push(
      "**Antigravity returned no output** and no recognizable error was found in the log.",
      "",
      "This is usually a transient backend hiccup. What to do:",
      "- Retry the command — it often succeeds on the second try.",
      "- If it keeps happening, run `/antigravity:setup` to re-check auth, or `! agy` to re-verify sign-in.",
    );
    if (meta.conversationId) lines.push("", `Conversation: \`${meta.conversationId}\``);
    if (meta.logFile) lines.push(`Log: \`${meta.logFile}\``);
    return ensureTrailingNewline(lines.join("\n").trimEnd());
  }

  if (error.kind === "quota") {
    lines.push(`**Antigravity quota is exhausted.** ${error.message}`);
    if (error.resetsIn) lines.push("", `Quota resets in **${error.resetsIn}**.`);
    lines.push(
      "",
      "What to do:",
      "- Wait for the reset, or switch the active Google account used by `agy`.",
      "- Meanwhile, Claude Code can keep handling the task itself.",
    );
  } else if (error.kind === "auth") {
    lines.push("**Antigravity is not authenticated.**");
    lines.push("", "Run this once in your shell to sign in, then retry:", "", "```bash", "agy", "```");
    lines.push("(In Claude Code you can run it inline by typing `! agy`.)");
  } else {
    lines.push("**Antigravity backend error.**", "", "```text", error.message, "```");
  }

  if (meta.conversationId) lines.push("", `Conversation: \`${meta.conversationId}\``);
  if (meta.logFile) lines.push(`Log: \`${meta.logFile}\``);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

export function renderNotInstalled() {
  const lines = [
    "# 🛰️ Antigravity — not installed",
    "",
    "The `agy` binary was not found.",
    "",
    "Install it (official Google installer):",
    "",
    "```bash",
    "# macOS / Linux",
    "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    "# Windows (PowerShell)",
    "irm https://antigravity.google/cli/install.ps1 | iex",
    "```",
    "",
    "Then run `/antigravity:setup` again. If `agy` is installed in a custom path, set",
    "`ANTIGRAVITY_CC_AGY_BIN=/full/path/to/agy`.",
  ];
  return ensureTrailingNewline(lines.join("\n"));
}

export function renderSetup(report) {
  const lines = [
    "# 🛰️ Antigravity — setup",
    "",
    `Status: ${report.ready ? "✅ ready" : "⚠️ needs attention"}`,
    "",
    "Checks:",
    `- agy binary: ${report.binary.detail}`,
    `- version: ${report.version || "unknown"}`,
    `- config dir: ${report.configDir.detail}`,
    `- auth: ${report.auth.detail}`,
    `- review gate: ${report.gate ? "on (Gemini reviews each turn before it can stop)" : "off"} — toggle with \`/antigravity:setup --enable-gate\` / \`--disable-gate\``,
    "",
  ];
  if (report.nextSteps.length) {
    lines.push("Next steps:");
    for (const step of report.nextSteps) lines.push(`- ${step}`);
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

export function renderBackgroundStarted(job) {
  const lines = [
    `# 🛰️ Antigravity — started in background`,
    "",
    `Job \`${job.id}\` (${job.kind}) is running with Gemini 3.`,
    job.title ? `Task: ${job.title}` : "",
    "",
    "Check on it:",
    `- \`/antigravity:status ${job.id}\` — progress`,
    `- \`/antigravity:result ${job.id}\` — final output`,
    `- \`/antigravity:cancel ${job.id}\` — stop it`,
  ].filter(Boolean);
  return ensureTrailingNewline(lines.join("\n"));
}

function jobLine(job) {
  const bits = [`\`${job.id}\``, job.status];
  if (job.kind) bits.push(job.kind);
  if (job.title) bits.push(job.title);
  return `- ${bits.join(" · ")}`;
}

export function renderStatus(jobs) {
  const lines = ["# 🛰️ Antigravity — status", ""];
  const running = jobs.filter((j) => j.status === "running");
  const finished = jobs.filter((j) => j.status !== "running");

  if (running.length) {
    lines.push("Running:");
    for (const j of running) lines.push(jobLine(j));
    lines.push("");
  }
  if (finished.length) {
    lines.push("Recent:");
    for (const j of finished.slice(0, 8)) {
      lines.push(jobLine(j) + (j.conversationId ? ` · conv \`${j.conversationId}\`` : ""));
    }
  }
  if (!running.length && !finished.length) {
    lines.push("No Antigravity jobs recorded for this repository yet.");
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

export function renderJobStatus(job) {
  const lines = [
    `# 🛰️ Antigravity — job ${job.id}`,
    "",
    `Status: ${job.status}`,
    job.title ? `Task: ${job.title}` : "",
    job.conversationId ? `Conversation: \`${job.conversationId}\`` : "",
    `Started: ${job.startedAt}`,
    job.finishedAt ? `Finished: ${job.finishedAt}` : "",
    job.error ? `Error: ${job.error}` : "",
  ].filter(Boolean);
  if (job.status === "running") {
    lines.push("", `Get the result when done: \`/antigravity:result ${job.id}\``);
  } else {
    lines.push("", `See full output: \`/antigravity:result ${job.id}\``);
  }
  return ensureTrailingNewline(lines.join("\n"));
}

export function renderCancel(result, job) {
  const lines = [`# 🛰️ Antigravity — cancel`, ""];
  if (result.cancelled) lines.push(`Cancelled job \`${job.id}\`.`);
  else lines.push(`Could not cancel \`${job?.id ?? "?"}\`: ${result.reason}.`);
  return ensureTrailingNewline(lines.join("\n"));
}

export { ensureTrailingNewline };
