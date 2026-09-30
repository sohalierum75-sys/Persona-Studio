/**
 * parseSceneText
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses a free-text paste into structured draft scenes.
 *
 * Separator:  a line that is exactly `---` (ignoring surrounding whitespace).
 * Without a separator the whole input is treated as a single scene.
 *
 * Within each block the parser recognises:
 *   - First non-empty line that looks like a title (short, no field prefix) → title
 *   - Dialogue: <text>      (may be multi-line until next field)
 *   - Duration: <text>
 *   - Camera:   <text>
 *   - Outfit:   <text>
 *   - Location: <text>
 *   Remaining lines → scene description
 */

export interface ParsedScene {
  /** Raw block text (preserved for undo / re-parse) */
  raw: string;
  /** Extracted or auto-generated title */
  title: string;
  /** Main scene description (everything that isn't a recognised field) */
  description: string;
  /** Extracted dialogue/caption */
  dialogue: string;
  /** Extracted duration string e.g. "8s" */
  duration: string;
  /** Extracted camera hint */
  camera: string;
  /** Extracted outfit hint */
  outfit: string;
  /** Extracted location hint */
  location: string;
}

export interface ParseResult {
  scenes: ParsedScene[];
  /** Indices of blocks that were empty / unparseable */
  skippedIndices: number[];
  /** Total block count before skipping */
  totalBlocks: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEP_RE  = /^[ \t]*---[ \t]*$/;
const FIELD_RE = /^(Dialogue|Duration|Camera|Outfit|Location|Scene)\s*:\s*/i;

/** Normalise Windows / Mac / Unix line endings to \n */
function normalise(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** True if a line looks like a standalone scene title
 *  (short, no colon, not a separator, not empty) */
function looksLikeTitle(line: string): boolean {
  if (!line) return false;
  if (SEP_RE.test(line)) return false;
  if (FIELD_RE.test(line)) return false;
  // Heuristic: ≤ 80 chars, does not end with a full sentence punctuation
  return line.length <= 80 && !/[,;]$/.test(line);
}

/** Extract a labelled field value that may span multiple lines until the next field. */
function extractField(
  lines: string[],
  startIdx: number
): { value: string; nextIdx: number } {
  // First line: strip the "Field: " prefix
  const firstVal = lines[startIdx].replace(FIELD_RE, "").trim();
  let idx = startIdx + 1;
  const parts: string[] = firstVal ? [firstVal] : [];
  // Continuation lines (indented or not starting a new field / separator)
  while (idx < lines.length && !FIELD_RE.test(lines[idx]) && !SEP_RE.test(lines[idx])) {
    const l = lines[idx].trim();
    if (l) parts.push(l);
    idx++;
  }
  return { value: parts.join(" "), nextIdx: idx };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseSceneText(raw: string, startN = 1): ParseResult {
  const text = normalise(raw.trim());
  if (!text) return { scenes: [], skippedIndices: [], totalBlocks: 0 };

  // Split on separator lines
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (SEP_RE.test(line)) {
      blocks.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  blocks.push(current.join("\n"));

  const scenes: ParsedScene[] = [];
  const skippedIndices: number[] = [];
  let autoN = startN;

  for (let bi = 0; bi < blocks.length; bi++) {
    const blockRaw = blocks[bi].trim();
    if (!blockRaw) { skippedIndices.push(bi); continue; }

    const lines = blockRaw.split("\n").map((l) => l.trimEnd());
    let i = 0;

    // --- Title detection ---
    let title = "";
    // Check if first non-empty line is a title
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && looksLikeTitle(lines[i].trim())) {
      title = lines[i].trim();
      i++;
    }

    // --- Field parsing ---
    let description = "";
    let dialogue = "";
    let duration = "";
    let camera = "";
    let outfit = "";
    let location = "";

    const descLines: string[] = [];

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) { i++; continue; }

      if (FIELD_RE.test(trimmed)) {
        const key = trimmed.split(/\s*:/)[0].toLowerCase();
        const { value, nextIdx } = extractField(lines, i);
        i = nextIdx;
        switch (key) {
          case "dialogue":  dialogue  = value; break;
          case "duration":  duration  = value; break;
          case "camera":    camera    = value; break;
          case "outfit":    outfit    = value; break;
          case "location":  location  = value; break;
          case "scene":
            // "Scene 1" / "Scene: Title text" at start of block = title
            if (!title) title = value;
            break;
        }
      } else {
        descLines.push(trimmed);
        i++;
      }
    }

    description = descLines.join("\n").trim();

    // Auto-title if missing
    if (!title) { title = `Scene ${String(autoN).padStart(2, "0")}`; }
    autoN++;

    scenes.push({ raw: blockRaw, title, description, dialogue, duration, camera, outfit, location });
  }

  return { scenes, skippedIndices, totalBlocks: blocks.length };
}

// ---------------------------------------------------------------------------
// Example text for the "Load Example" button
// ---------------------------------------------------------------------------
export const EXAMPLE_PASTE = `Scene 1
She enters a flower shop, filming an arm's-length selfie.
Dialogue: "Today I'm picking flowers for someone special."
Duration: 8s
Camera: selfie

---

Scene 2
She picks up a bouquet and smiles at the camera.
Dialogue: "That someone might be me."
Duration: 8s

---

Scene 3
She pays at the counter, winking at the shopkeeper.
Dialogue: "They love surprises."
Duration: 6s
Camera: medium-shot`;
