// ============================================================
// Target Generator registry.
//
// Every supported generator is one GeneratorDef: label, a few
// metadata flags, and its declarative option fields. The
// selector UI (primary tabs + "More ▾") and the options panel
// render straight from GENERATORS — image and video generators
// deliberately live in ONE list with no separation.
//
// Adding a future generator = one entry here + one adapter in
// adapters.ts. The generic "custom" fallback already covers
// tools that just take a clean natural-language prompt.
// ============================================================
import type { GeneratorDef, GeneratorId, GeneratorOptions, OptionFieldDef, OptionValue } from "./types";
import { CAMERA_MOVES, choices, flag, str } from "./shared";

/** Remembered generator selection — key kept from the original MJ/SD/Flux switcher. */
export const GENERATOR_STORAGE_KEY = "ps_prompt_engine";
/** Per-generator options are stored as one JSON blob each. */
const OPTS_KEY_PREFIX = "ps_gen_opts:";

// ─── Shared choice sets ───────────────────────────────────────────────────────

const ASPECT_IMAGE = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];
/** Aspect list that starts with a "Default" (unset) choice. */
const ASPECT_SELECT = [{ value: "", label: "Default" }, ...choices(ASPECT_IMAGE)];
const CAMERA_SELECT = [{ value: "", label: "Default" }, ...choices(CAMERA_MOVES)];
const MODE_VIDEO = [
  { value: "text", label: "Text → Video" },
  { value: "image", label: "Image → Video" },
];
const MOTION_STRENGTH = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// ─── Option field shorthand ───────────────────────────────────────────────────

const opt = (def: OptionFieldDef): OptionFieldDef => def;

// ─── Registry ─────────────────────────────────────────────────────────────────

export const GENERATORS: GeneratorDef[] = [
  // ── Primary generators (top-level tabs) ──
  {
    id: "midjourney", label: "Midjourney", kind: "image", promptStyle: "parameter-based",
    hint: "Concise visual prompt with --parameters", primary: true,
    options: [
      opt({ id: "mjModelVersion", label: "Model version", type: "select",
        choices: choices(["v5.2", "v6", "v6.1", "v7"]), defaultValue: "v7" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT,
        tooltip: "Appends --ar" }),
      opt({ id: "mjStylize", label: "Stylize", type: "number", min: 0, max: 1000, step: 10,
        placeholder: "e.g. 100", tooltip: "Appends --stylize (0 = literal, 1000 = very stylized)" }),
      opt({ id: "mjChaos", label: "Chaos", type: "number", min: 0, max: 100, step: 1,
        placeholder: "e.g. 20", tooltip: "Appends --chaos (0–100, more varied compositions)" }),
      opt({ id: "mjQuality", label: "Quality", type: "select",
        choices: [{ value: "", label: "Default" }, ...choices(["0.25", "0.5", "1", "2", "4"])],
        tooltip: "Appends --q (0.25–1 on v5/v6, 1–4 on v7)" }),
      opt({ id: "mjRawMode", label: "Raw mode", type: "toggle",
        tooltip: "Appends --raw (v5.1+), less opinionated default styling" }),
      opt({ id: "mjSeed", label: "Seed", type: "number", min: 0, max: 4294967295, step: 1,
        placeholder: "e.g. 42", tooltip: "Appends --seed (reproducible starting point)" }),
      opt({ id: "mjNoText", label: "Exclude", type: "text",
        placeholder: "e.g. text, watermark", tooltip: "Appends --no with these exclusions" }),
      opt({ id: "mjCharacterRefUrl", label: "Char. ref URL", type: "text",
        placeholder: "https://…" }),
      opt({ id: "mjCharacterRefWeight", label: "Ref weight", type: "number", min: 0, max: 100, step: 1,
        placeholder: "100" }),
      opt({ id: "_mj_note", label: "", type: "note",
        note: "Reference URL uses --cref/--cw on v6 and --oref/--ow on v7." }),
    ],
  },
  {
    id: "stable-diffusion", label: "Stable Diffusion", kind: "image", promptStyle: "tag-based",
    hint: "Tag-style prompt + negative prompt", primary: true,
    options: [
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT,
        tooltip: "Shown in the settings line" }),
      opt({ id: "sdNegativePrompt", label: "Negative prompt", type: "textarea",
        placeholder: "Optional — e.g. blurry, extra limbs" }),
      opt({ id: "sdPositivePrompt", label: "Positive notes", type: "textarea", placeholder: "Additional positive prompt details" }),
      opt({ id: "sdSteps", label: "Steps", type: "number", min: 1, max: 150, step: 1,
        placeholder: "e.g. 30", tooltip: "Sampling steps — shown in the settings line" }),
      opt({ id: "sdCfg", label: "CFG / guidance", type: "number", min: 1, max: 30, step: 0.5,
        placeholder: "e.g. 7", tooltip: "How strictly the prompt is followed" }),
      opt({ id: "sdSampler", label: "Sampler", type: "select",
        choices: [{ value: "", label: "Default" },
          ...choices(["DPM++ 2M Karras", "DPM++ SDE Karras", "Euler a", "Euler", "UniPC", "DDIM"])] }),
      opt({ id: "sdSeed", label: "Seed", type: "number", min: 0, step: 1, placeholder: "e.g. 12345" }),
      opt({ id: "sdModel", label: "Checkpoint", type: "text",
        placeholder: "e.g. sdxl_base_1.0", tooltip: "Model/checkpoint note for the settings line" }),
      opt({ id: "sdLoraName", label: "LoRA name", type: "text", placeholder: "e.g. my-style-lora" }),
      opt({ id: "sdLoraWeight", label: "LoRA weight", type: "number", min: -2, max: 2, step: 0.1,
        placeholder: "0.8" }),
      opt({ id: "_sd_note", label: "", type: "note",
        note: "<lora:name:weight> is added only when both a name and a weight are provided." }),
    ],
  },
  {
    id: "flux", label: "Flux", kind: "image", promptStyle: "natural-language",
    hint: "Clean natural-language description", primary: true,
    options: [
      opt({ id: "fluxDetail", label: "Detail level", type: "segmented",
        choices: [{ value: "standard", label: "Standard" }, { value: "concise", label: "Concise" }],
        defaultValue: "standard", tooltip: "Concise keeps only subject, outfit, scene and action" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT,
        tooltip: "Added as a natural sentence, not a parameter" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle",
        tooltip: "Adds a sentence asking for an identical character" }),
      opt({ id: "fluxNegative", label: "Avoid", type: "textarea",
        placeholder: "Optional — things to avoid" }),
      opt({ id: "fluxSeed", label: "Seed", type: "number", min: 0, step: 1,
        tooltip: "Copy into the target tool's seed setting, where available" }),
    ],
  },
  {
    id: "veo", label: "Veo", kind: "video", promptStyle: "video-structured",
    hint: "Google Veo — structured video prompt", primary: true,
    options: [
      opt({ id: "veoMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "segmented",
        choices: choices(["16:9", "9:16"]), defaultValue: "16:9" }),
      opt({ id: "veoDuration", label: "Duration", type: "segmented",
        choices: choices(["5s", "8s"]), defaultValue: "5s" }),
      opt({ id: "veoCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "veoSubjectMotion", label: "Subject motion", type: "text",
        placeholder: "e.g. she walks slowly toward the window" }),
      opt({ id: "veoDialogue", label: "Dialogue", type: "toggle", defaultValue: true,
        tooltip: "Include the scene dialogue in the prompt" }),
      opt({ id: "veoAmbient", label: "Ambient audio", type: "toggle", defaultValue: true,
        tooltip: "Veo generates audio — describe the sound of the scene" }),
      opt({ id: "veoAudio", label: "Sound notes", type: "text", placeholder: "e.g. café chatter, soft jazz",
        showIf: (o) => flag(o, "veoAmbient") !== false }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "sceneContinuity", label: "Scene continuity", type: "toggle",
        tooltip: "Ask for continuity with adjacent shots" }),
      opt({ id: "negativeText", label: "Avoid", type: "textarea",
        placeholder: "Optional — things to avoid" }),
    ],
  },
  {
    id: "kling", label: "Kling", kind: "video", promptStyle: "video-structured",
    hint: "Kling AI — structured video prompt", primary: true,
    options: [
      opt({ id: "klingMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "segmented",
        choices: choices(["16:9", "9:16", "1:1"]), defaultValue: "16:9" }),
      opt({ id: "klingDuration", label: "Duration", type: "segmented",
        choices: choices(["5s", "10s"]), defaultValue: "5s" }),
      opt({ id: "klingMotion", label: "Motion strength", type: "segmented", choices: MOTION_STRENGTH,
        defaultValue: "medium" }),
      opt({ id: "klingCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "klingFrames", label: "Start/end frames", type: "toggle",
        tooltip: "Notes that a start frame (and optionally an end frame) is attached" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "negativeText", label: "Avoid", type: "textarea",
        placeholder: "Optional — things to avoid" }),
    ],
  },
  {
    id: "runway", label: "Runway", kind: "video", promptStyle: "video-structured",
    hint: "Runway — structured video prompt", primary: true,
    options: [
      opt({ id: "runwayMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "segmented",
        choices: choices(["16:9", "9:16", "1:1"]), defaultValue: "16:9" }),
      opt({ id: "runwayDuration", label: "Duration", type: "segmented",
        choices: choices(["5s", "10s"]), defaultValue: "5s" }),
      opt({ id: "runwayCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "runwayMotion", label: "Motion direction", type: "text",
        placeholder: "e.g. subject drifts left, background parallax" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "sceneContinuity", label: "Scene continuity", type: "toggle" }),
      opt({ id: "negativeText", label: "Avoid", type: "textarea",
        placeholder: "Optional — things to avoid" }),
    ],
  },

  // ── Under "More ▾" ──
  {
    id: "gpt-image", label: "GPT Image", kind: "image", promptStyle: "natural-language",
    hint: "ChatGPT / GPT-Image natural-language prompt",
    options: [
      opt({ id: "gptSize", label: "Size", type: "select", defaultValue: "auto",
        choices: [
          { value: "auto", label: "Auto" },
          { value: "1024x1024", label: "Square 1024×1024" },
          { value: "1536x1024", label: "Landscape 1536×1024" },
          { value: "1024x1536", label: "Portrait 1024×1536" },
        ] }),
      opt({ id: "gptStyle", label: "Style", type: "text", placeholder: "e.g. editorial photo, soft pastel palette" }),
      opt({ id: "gptComposition", label: "Composition", type: "text", placeholder: "e.g. rule of thirds, subject off-center" }),
      opt({ id: "gptBackground", label: "Background", type: "text", placeholder: "e.g. plain studio backdrop" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "gptAvoid", label: "Avoid", type: "textarea", placeholder: "Optional — unwanted elements" }),
    ],
  },
  {
    id: "nano-banana", label: "Nano Banana", kind: "image", promptStyle: "natural-language",
    hint: "Gemini image — reference-aware editing",
    options: [
      opt({ id: "nbMode", label: "Mode", type: "segmented", defaultValue: "generate",
        choices: [{ value: "generate", label: "Generate new" }, { value: "edit", label: "Edit reference" }] }),
      opt({ id: "nbReferenceNote", label: "Keep from reference", type: "textarea",
        placeholder: "e.g. same face, same outfit, same lighting",
        showIf: (o) => str(o, "nbMode") === "edit" }),
      opt({ id: "nbComposition", label: "Composition", type: "text", placeholder: "e.g. centered portrait, shallow depth" }),
      opt({ id: "nbBackground", label: "Background", type: "text", placeholder: "e.g. same room as the reference" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT,
        tooltip: "Only if the target tool supports it" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
    ],
  },
  {
    id: "seedream", label: "Seedream", kind: "image", promptStyle: "natural-language",
    hint: "Seedream — natural-language image prompt",
    options: [
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT }),
      opt({ id: "seedreamStyle", label: "Style", type: "text", placeholder: "e.g. cinematic, golden hour warmth" }),
      opt({ id: "seedreamComposition", label: "Composition", type: "text", placeholder: "e.g. full-body shot, centered" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "seedreamNegative", label: "Avoid", type: "textarea", placeholder: "Optional — things to avoid" }),
    ],
  },
  {
    id: "ideogram", label: "Ideogram", kind: "image", promptStyle: "natural-language",
    hint: "Ideogram — strong text rendering",
    options: [
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", defaultValue: "1:1",
        choices: choices(["1:1", "16:9", "9:16", "4:3", "3:4"]) }),
      opt({ id: "ideogramStyle", label: "Style", type: "select", defaultValue: "auto",
        choices: [
          { value: "auto", label: "Auto" },
          { value: "realistic", label: "Realistic" },
          { value: "design", label: "Design" },
          { value: "3d", label: "3D" },
          { value: "anime", label: "Anime" },
        ] }),
      opt({ id: "ideogramText", label: "Text to render", type: "text",
        placeholder: "Exact wording to render in the image" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "ideogramNegative", label: "Avoid", type: "textarea", placeholder: "Optional — things to avoid" }),
    ],
  },
  {
    id: "leonardo", label: "Leonardo", kind: "image", promptStyle: "natural-language",
    hint: "Leonardo.Ai — style preset + negative prompt",
    options: [
      opt({ id: "leonardoStyle", label: "Style preset", type: "select", defaultValue: "none",
        choices: [
          { value: "none", label: "None" },
          ...choices(["Cinematic", "Photographic", "Stock Photo", "Dynamic", "Anime", "Illustration"]),
        ] }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT }),
      opt({ id: "leonardoNegative", label: "Negative prompt", type: "textarea",
        placeholder: "Optional — e.g. blurry, low quality" }),
      opt({ id: "leonardoGuidance", label: "Guidance", type: "number", min: 1, max: 20, step: 0.5,
        placeholder: "e.g. 7", tooltip: "How strictly the prompt is followed" }),
      opt({ id: "leonardoSeed", label: "Seed", type: "number", min: 0, step: 1, placeholder: "e.g. 12345" }),
    ],
  },
  {
    id: "firefly", label: "Adobe Firefly", kind: "image", promptStyle: "natural-language",
    hint: "Adobe Firefly — content type + style settings",
    options: [
      opt({ id: "fireflyContent", label: "Content type", type: "segmented", defaultValue: "photo",
        choices: [{ value: "photo", label: "Photo" }, { value: "art", label: "Art" }] }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", defaultValue: "1:1",
        choices: choices(["1:1", "4:3", "3:4", "16:9", "9:16"]) }),
      opt({ id: "fireflyEffects", label: "Style / effects", type: "text",
        placeholder: "e.g. bokeh, film grain, watercolor" }),
      opt({ id: "fireflyComposition", label: "Camera / composition", type: "text",
        placeholder: "e.g. 50mm, eye-level, subject centered" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "fireflyAvoid", label: "Avoid", type: "textarea", placeholder: "Optional — things to avoid" }),
    ],
  },
  {
    id: "hailuo", label: "Hailuo / MiniMax", kind: "video", promptStyle: "video-structured",
    hint: "Hailuo / MiniMax — structured video prompt",
    options: [
      opt({ id: "hailuoMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "hailuoDuration", label: "Duration", type: "segmented",
        choices: choices(["6s", "10s"]), defaultValue: "6s" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "segmented",
        choices: choices(["16:9", "9:16"]), defaultValue: "16:9" }),
      opt({ id: "hailuoCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "hailuoMotion", label: "Motion", type: "text",
        placeholder: "e.g. hair and dress move in the breeze" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
    ],
  },
  {
    id: "wan", label: "WAN", kind: "video", promptStyle: "video-structured",
    hint: "WAN — open video model prompt",
    options: [
      opt({ id: "wanMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "segmented",
        choices: choices(["16:9", "9:16", "1:1"]), defaultValue: "16:9" }),
      opt({ id: "wanDuration", label: "Duration", type: "segmented",
        choices: choices(["5s", "10s"]), defaultValue: "5s" }),
      opt({ id: "wanCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "wanMotion", label: "Motion", type: "text",
        placeholder: "e.g. slow turn toward the camera, fabric sway" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "negativeText", label: "Avoid", type: "textarea", placeholder: "Optional — things to avoid" }),
    ],
  },
  {
    id: "luma", label: "Luma", kind: "video", promptStyle: "video-structured",
    hint: "Luma Dream Machine — structured video prompt",
    options: [
      opt({ id: "lumaMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", defaultValue: "16:9",
        choices: choices(["16:9", "9:16", "4:3", "3:4", "1:1"]) }),
      opt({ id: "lumaCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "lumaMotion", label: "Motion", type: "text",
        placeholder: "e.g. she turns, light flickers softly" }),
      opt({ id: "lumaSceneNotes", label: "Scene notes", type: "text",
        placeholder: "e.g. keep the café background stable" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
    ],
  },
  {
    id: "pika", label: "Pika", kind: "video", promptStyle: "video-structured",
    hint: "Pika — expressive motion and effects",
    options: [
      opt({ id: "pikaMode", label: "Mode", type: "segmented", choices: MODE_VIDEO, defaultValue: "text" }),
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "segmented",
        choices: choices(["16:9", "9:16", "1:1", "4:5"]), defaultValue: "16:9" }),
      opt({ id: "pikaDuration", label: "Duration", type: "segmented",
        choices: choices(["3s", "5s"]), defaultValue: "3s" }),
      opt({ id: "pikaMotion", label: "Motion strength", type: "segmented", choices: MOTION_STRENGTH,
        defaultValue: "medium" }),
      opt({ id: "pikaCamera", label: "Camera movement", type: "select", choices: CAMERA_SELECT }),
      opt({ id: "pikaEffects", label: "Effects", type: "text",
        placeholder: "e.g. inflate, melt, explode (Pikaffects)" }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
    ],
  },
  {
    id: "custom", label: "Custom", kind: "custom", promptStyle: "natural-language",
    hint: "Plain natural-language prompt for any tool",
    options: [
      opt({ id: "aspectRatio", label: "Aspect ratio", type: "select", choices: ASPECT_SELECT }),
      opt({ id: "characterConsistency", label: "Character consistency", type: "toggle", defaultValue: true }),
      opt({ id: "customNegative", label: "Avoid", type: "textarea", placeholder: "Optional — things to avoid" }),
      opt({ id: "_custom_note", label: "", type: "note",
        note: "Clean natural-language prompt that works with most text-prompt tools." }),
    ],
  },
];

// Consistency is opt-in for the original parameter/tag adapters and Leonardo.
for (const generator of GENERATORS) {
  if (!generator.options.some((field) => field.id === "characterConsistency")) {
    generator.options.push(opt({ id: "characterConsistency", label: "Character consistency", type: "toggle" }));
  }
}

/** Generators that get a top-level tab; everything else lives under "More ▾". */
export const PRIMARY_GENERATORS = GENERATORS.filter((g) => g.primary);

export function getGenerator(id: string): GeneratorDef {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS.find((g) => g.id === "custom")!;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
// The active generator is remembered across sessions; each generator keeps its
// own options blob, so switching Veo → Flux → Veo restores the Veo options.

export function readSavedGenerator(): GeneratorId {
  try {
    const saved = localStorage.getItem(GENERATOR_STORAGE_KEY);
    if (saved && GENERATORS.some((g) => g.id === saved)) return saved as GeneratorId;
  } catch { /* storage unavailable */ }
  return "midjourney";
}

export function saveGenerator(id: GeneratorId): void {
  try { localStorage.setItem(GENERATOR_STORAGE_KEY, id); } catch { /* storage unavailable */ }
}

export function readGeneratorOptions(id: GeneratorId): GeneratorOptions {
  try {
    const raw = localStorage.getItem(OPTS_KEY_PREFIX + id);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as GeneratorOptions;
      }
    }
  } catch { /* corrupted or unavailable — fall through to empty */ }
  return {};
}

export function saveGeneratorOptions(id: GeneratorId, options: GeneratorOptions): void {
  try { localStorage.setItem(OPTS_KEY_PREFIX + id, JSON.stringify(options)); } catch { /* storage unavailable */ }
}

/** Raw option value with the definition's default applied — for UI display. */
export function resolveOption(def: OptionFieldDef, options: GeneratorOptions): OptionValue {
  const v = options[def.id];
  return v !== undefined ? v : def.defaultValue;
}

/**
 * Stored options overlaid on the generator's declared defaults, so a prompt
 * built before the user touches anything matches what the options panel
 * already displays (e.g. Veo 16:9 / 5s). Explicit user values — including
 * "" (Default) and false — always win over the declared default.
 */
export function mergeOptionDefaults(id: GeneratorId, options: GeneratorOptions): GeneratorOptions {
  const merged: GeneratorOptions = {};
  for (const def of getGenerator(id).options) {
    if (def.defaultValue !== undefined) merged[def.id] = def.defaultValue;
  }
  return { ...merged, ...options };
}
