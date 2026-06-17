// Minimal, dependency-free argument parser for the companion subcommands.
//
// Splits a raw argv tail into:
//   - boolean flags (e.g. --background, --yolo, --json)
//   - valued flags (e.g. --base main, --conversation <id>, --print-timeout 90s, repeatable --add-dir)
//   - free-text positionals (joined as the natural-language prompt / focus text)
//
// Unknown `--flags` are treated as booleans so stray flags never get swallowed
// into the prompt text.

const VALUED_FLAGS = new Set([
  "base",
  "conversation",
  "print-timeout",
  "model", // passed through when the agy build supports --model (probed via agySupportsModel)
]);

const REPEATABLE_VALUED_FLAGS = new Set(["add-dir"]);

const BOOLEAN_ALIASES = {
  c: "continue",
};

function isFlagToken(token) {
  return typeof token === "string" && token.startsWith("-") && token.length > 1 && !/^-\d/.test(token);
}

// The value for a valued flag is the next token — but only if it exists and isn't itself
// a flag. `--base --background` must NOT consume `--background` as base's value.
function consumeValue(argv, i) {
  const next = argv[i + 1];
  if (next === undefined || isFlagToken(next)) return undefined;
  return next;
}

export function parseArgs(argv) {
  const flags = {};
  const valued = {};
  const repeated = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token !== "string") continue;

    if (token === "--") {
      // Everything after `--` is positional prompt text.
      for (let j = i + 1; j < argv.length; j += 1) positionals.push(argv[j]);
      break;
    }

    if (token.startsWith("--")) {
      let name = token.slice(2);
      let inlineValue;
      const eq = name.indexOf("=");
      if (eq !== -1) {
        inlineValue = name.slice(eq + 1);
        name = name.slice(0, eq);
      }

      if (REPEATABLE_VALUED_FLAGS.has(name)) {
        const value = inlineValue ?? consumeValue(argv, i);
        if (value !== undefined) {
          (repeated[name] ||= []).push(value);
          if (inlineValue === undefined) i += 1;
        }
        continue;
      }

      if (VALUED_FLAGS.has(name)) {
        const value = inlineValue ?? consumeValue(argv, i);
        if (value !== undefined) {
          valued[name] = value;
          if (inlineValue === undefined) i += 1;
        }
        continue;
      }

      flags[name] = true;
      continue;
    }

    if (token.startsWith("-") && token.length > 1 && !/^-\d/.test(token)) {
      // Short flags; only the documented ones are mapped, rest become booleans.
      const short = token.slice(1);
      const mapped = BOOLEAN_ALIASES[short];
      flags[mapped || short] = true;
      continue;
    }

    positionals.push(token);
  }

  return {
    flags,
    valued,
    repeated,
    positionals,
    text: positionals.join(" ").trim(),
  };
}

/** True when any of the given boolean flag names is set. */
export function hasFlag(parsed, ...names) {
  return names.some((name) => parsed.flags[name] === true);
}
