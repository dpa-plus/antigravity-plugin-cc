// Prompt size clamp. agy print mode chokes on enormous prompts, so we cap the bytes.

export const MAX_PROMPT_BYTES = 100 * 1024;

/**
 * Truncate `prompt` to at most MAX_PROMPT_BYTES, cutting on a UTF-8 character boundary
 * so a multi-byte character that straddles the limit isn't split into mojibake.
 */
export function clampPrompt(prompt) {
  const buf = Buffer.from(prompt, "utf8");
  if (buf.length <= MAX_PROMPT_BYTES) return prompt;
  // Walk back off any UTF-8 continuation byte (10xxxxxx) so we don't slice mid-character.
  let end = MAX_PROMPT_BYTES;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return `${buf.subarray(0, end).toString("utf8")}\n\n[...truncated by antigravity-plugin-cc: prompt exceeded ${MAX_PROMPT_BYTES} bytes...]`;
}
