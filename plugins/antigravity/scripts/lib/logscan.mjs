// Scan an `agy` --log-file to recover what print mode hides on stdout.
//
// Grounded in real runtime behavior (agy 1.0.3): print mode exits 0 with EMPTY
// stdout when the backend call fails (e.g. quota exhausted). The conversation ID
// and the real error are only in the log. We parse both here.

/**
 * @param {string} logText raw contents of the agy log file (may be "")
 * @returns {{
 *   conversationId: string|null,
 *   error: { kind: "quota"|"auth"|"backend", message: string, resetsIn: string|null } | null,
 *   errorLines: string[]
 * }}
 */
export function scanAgyLog(logText) {
  const text = typeof logText === "string" ? logText : "";

  const conversationId = extractConversationId(text);
  const errorLines = extractErrorLines(text);
  const error = classifyError(errorLines);

  return { conversationId, error, errorLines };
}

function extractConversationId(text) {
  // Prefer the explicit "Created conversation <uuid>" then "conversation=<uuid>".
  const created = text.match(/Created conversation ([0-9a-fA-F-]{8,})/);
  if (created) return created[1];
  const eq = text.match(/conversation=([0-9a-fA-F-]{8,})/);
  if (eq) return eq[1];
  return null;
}

function extractErrorLines(text) {
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // glog/klog style: severity letter prefix E/F at the very start.
    const isErrorSeverity = /^[EF]\d{4}\s/.test(line);
    const looksLikeError =
      /RESOURCE_EXHAUSTED|UNAUTHENTICATED|PERMISSION_DENIED|agent executor error|code 4\d{2}|code 5\d{2}|quota|not authenticated|login required/i.test(
        line,
      );
    if (isErrorSeverity || looksLikeError) {
      out.push(line);
    }
  }
  // De-duplicate consecutive repeats (agy logs the same error twice).
  return dedupe(out);
}

function classifyError(errorLines) {
  if (errorLines.length === 0) return null;
  const joined = errorLines.join("\n");

  if (/RESOURCE_EXHAUSTED|Individual quota reached|quota/i.test(joined)) {
    const reset = joined.match(/Resets in ([0-9hms]+)/i);
    return {
      kind: "quota",
      message: "Antigravity quota exhausted (RESOURCE_EXHAUSTED 429).",
      resetsIn: reset ? reset[1] : null,
    };
  }

  if (/UNAUTHENTICATED|not authenticated|login required|PERMISSION_DENIED/i.test(joined)) {
    return {
      kind: "auth",
      message: "Antigravity is not authenticated. Run `! agy` once to sign in.",
      resetsIn: null,
    };
  }

  // Generic backend failure: surface the most informative line.
  const informative =
    errorLines.find((l) => /agent executor error|code \d{3}/i.test(l)) || errorLines[errorLines.length - 1];
  return {
    kind: "backend",
    message: stripGlogPrefix(informative),
    resetsIn: null,
  };
}

function stripGlogPrefix(line) {
  // Turn "E0531 16:30:43.195032 38848 log.go:398] message" into "message".
  return String(line)
    .replace(/^[EFIW]\d{4}\s[\d:.]+\s+\d+\s+\S+\]\s*/, "")
    .trim();
}

function dedupe(lines) {
  // Strip glog prefixes, then drop any line whose message is a substring of a
  // longer kept line. agy logs the same error twice — once wrapped in
  // "agent executor error: <X>" and once as the bare "<X>" — so exact-key
  // de-duplication is not enough; we collapse to the most informative line.
  const keyed = lines.map((line) => ({ line, key: stripGlogPrefix(line) }));
  keyed.sort((a, b) => b.key.length - a.key.length);
  const kept = [];
  for (const item of keyed) {
    if (kept.some((k) => k.key === item.key || k.key.includes(item.key))) continue;
    kept.push(item);
  }
  return kept.map((k) => k.line);
}

export { stripGlogPrefix };
