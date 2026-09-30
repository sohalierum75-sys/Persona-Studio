/**
 * promptParser.ts
 * Parses pasted text into an array of prompt blocks.
 * Supports three formats:
 *   1. Plain text — blocks separated by blank lines (≥2 \n) or lines with only "---"
 *   2. JSON array of strings
 *   3. JSON array of objects: { text: string; label?: string }
 */

export interface ParsedPrompt {
  text: string;
  label?: string;
}

export type ParseResult =
  | { ok: true;  prompts: ParsedPrompt[] }
  | { ok: false; error: string };

export function parsePrompts(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Nothing pasted yet." };

  // ── Try JSON first ────────────────────────────────────────────────────────
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // fall through to plain-text parsing
    }

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return { ok: false, error: "JSON array is empty." };
      }

      // Array of strings
      if (typeof parsed[0] === "string") {
        const prompts: ParsedPrompt[] = (parsed as string[])
          .map((s) => ({ text: String(s).trim() }))
          .filter((p) => p.text.length > 0);
        return prompts.length > 0
          ? { ok: true, prompts }
          : { ok: false, error: "All JSON string entries were empty." };
      }

      // Array of objects
      if (typeof parsed[0] === "object" && parsed[0] !== null) {
        const prompts: ParsedPrompt[] = [];
        for (const item of parsed as Record<string, unknown>[]) {
          const text = typeof item["text"] === "string" ? item["text"].trim() : "";
          if (!text) continue;
          const label = typeof item["label"] === "string" ? item["label"].trim() : undefined;
          prompts.push({ text, label: label || undefined });
        }
        return prompts.length > 0
          ? { ok: true, prompts }
          : { ok: false, error: "No valid { text } entries found in JSON array." };
      }

      return { ok: false, error: "JSON array must contain strings or { text, label? } objects." };
    }
  }

  // ── Plain-text splitting ───────────────────────────────────────────────────
  // Split on: a line containing only "---" (with optional whitespace), OR two+
  // consecutive newlines (blank line between paragraphs).
  const blocks = trimmed
    .split(/\n[ \t]*---[ \t]*\n|\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  if (blocks.length === 0) {
    return { ok: false, error: "Could not detect any prompt blocks." };
  }

  return {
    ok: true,
    prompts: blocks.map((text) => ({ text })),
  };
}
