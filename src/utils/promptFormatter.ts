// ============================================================
// Engine prompt formatters — deterministic, no AI API calls.
// Three adapters over the same scene facts:
//   Midjourney | Stable Diffusion | Flux
// Switching engines only changes the generated output text;
// scene fields are read, never written.
// ============================================================
import type { Scene, Character, Outfit, Location, FieldConfig } from "../types";

export type EngineId = "midjourney" | "stable-diffusion" | "flux";

export const ENGINES: Array<{ id: EngineId; label: string }> = [
  { id: "midjourney",      label: "Midjourney" },
  { id: "stable-diffusion", label: "Stable Diffusion" },
  { id: "flux",            label: "Flux" },
];

/** Remembered engine selection, shared between the studio prompt tab and the extension sidepanel. */
export const ENGINE_STORAGE_KEY = "ps_prompt_engine";

export function readSavedEngine(): EngineId {
  try {
    const saved = localStorage.getItem(ENGINE_STORAGE_KEY);
    if (saved && ENGINES.some((e) => e.id === saved)) return saved as EngineId;
  } catch { /* storage unavailable */ }
  return "midjourney";
}

export function saveEngine(id: EngineId): void {
  try { localStorage.setItem(ENGINE_STORAGE_KEY, id); } catch { /* storage unavailable */ }
}

/** Per-engine options (all optional; adapters omit missing pieces). */
export interface EngineOptions {
  /** Midjourney model version, e.g. "v5.2" | "v6" | "v6.1" | "v7" */
  mjModelVersion?: string;
  /** Character-reference image URL (--cref) */
  mjCharacterRefUrl?: string;
  /** Character-reference weight 0–100 (--cw) */
  mjCharacterRefWeight?: number;
  /** Aspect ratio "W:H" (--ar) */
  aspectRatio?: string;
  /** Stable Diffusion negative prompt (separate output section) */
  sdNegativePrompt?: string;
  /** Stable Diffusion LoRA name */
  sdLoraName?: string;
  /** Stable Diffusion LoRA weight */
  sdLoraWeight?: number;
}

/** Minimum Midjourney major version that supports --cref / --cw */
const CREF_MIN_MAJOR = 6;

function mjSupportsCharacterRef(version: string | undefined): boolean {
  if (!version) return false;
  const m = /v(\d+)/i.exec(version);
  return !!m && parseInt(m[1], 10) >= CREF_MIN_MAJOR;
}

// ─── Shared scene facts ───────────────────────────────────────────────────────

interface SceneFacts {
  characterName: string;
  identity: string;        // comma-joined identity field values
  outfit?: string;         // outfit description incl. accessories, or override
  location?: string;       // setting incl. lighting
  action?: string;
  dialogue?: string;
  camera?: string;
  props?: string;
  extras: string[];        // custom field "label: value" strings
}

function collectFacts(
  scene: Scene,
  character: Pick<Character, "name" | "identityFields">,
  outfit?: Outfit,
  location?: Location,
  fieldConfigs?: FieldConfig[],
): SceneFacts {
  const identity = (character.identityFields ?? [])
    .filter((f) => f.value)
    .map((f) => f.value)
    .join(", ");

  const actionText = scene.sceneDescription || scene.action || "";

  const facts: SceneFacts = {
    characterName: character.name,
    identity,
    outfit: outfit
      ? `${outfit.description}${outfit.accessories ? `. Accessories: ${outfit.accessories}` : ""}`
      : scene.outfitOverride || undefined,
    location: location
      ? `${location.setting}${location.lighting ? `. Lighting: ${location.lighting}` : ""}`
      : undefined,
    action: actionText || undefined,
    dialogue: scene.dialogue || undefined,
    camera: scene.cameraAngle ? scene.cameraAngle.replace(/-/g, " ") : undefined,
    props: scene.props || undefined,
    extras: [],
  };

  if (fieldConfigs) {
    for (const cfg of [...fieldConfigs].sort((a, b) => a.order - b.order)) {
      if (!cfg.isVisible || cfg.isDefault) continue;
      const val = scene.customFieldValues?.[cfg.id];
      if (val) facts.extras.push(`${cfg.label}: ${val}`);
    }
  }
  return facts;
}

function clean(text: string): string {
  // Collapse whitespace, strip trailing periods (adapters control punctuation)
  return text.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
}

function splitSentences(text: string): string[] {
  return clean(text).split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
}

// ─── Midjourney ───────────────────────────────────────────────────────────────
// Concise descriptive prompt + supported parameters.

function formatMidjourney(facts: SceneFacts, opts: EngineOptions): string {
  const parts: string[] = [];
  parts.push(clean(facts.characterName + (facts.identity ? `, ${facts.identity}` : "")));
  if (facts.outfit)   parts.push(`wearing ${clean(facts.outfit)}`);
  if (facts.location) parts.push(clean(facts.location));
  if (facts.action)   parts.push(clean(facts.action));
  if (facts.props)    parts.push(clean(facts.props));
  if (facts.camera)   parts.push(facts.camera);
  for (const e of facts.extras) parts.push(clean(e));

  const params: string[] = [];
  if (opts.aspectRatio) params.push(`--ar ${opts.aspectRatio}`);
  if (mjSupportsCharacterRef(opts.mjModelVersion) && opts.mjCharacterRefUrl?.trim()) {
    params.push(`--cref ${opts.mjCharacterRefUrl.trim()}`);
    if (typeof opts.mjCharacterRefWeight === "number" &&
        Number.isFinite(opts.mjCharacterRefWeight)) {
      params.push(`--cw ${Math.round(opts.mjCharacterRefWeight)}`);
    }
  }

  return [...parts, ...params].join(", ");
}

// ─── Stable Diffusion ─────────────────────────────────────────────────────────
// Positive prompt + separate optional negative prompt. LoRA tag only when a
// real name and weight are supplied.

function formatStableDiffusion(facts: SceneFacts, opts: EngineOptions): string {
  const tags: string[] = [];
  tags.push(clean(facts.characterName));
  if (facts.identity)     tags.push(clean(facts.identity));
  if (facts.outfit)       tags.push(clean(facts.outfit));
  if (facts.location)     tags.push(clean(facts.location));
  if (facts.action)       tags.push(clean(facts.action));
  if (facts.props)        tags.push(clean(facts.props));
  if (facts.camera)       tags.push(facts.camera);
  for (const e of facts.extras) tags.push(clean(e));

  const positive: string[] = [];
  const name = opts.sdLoraName?.trim();
  const weight = opts.sdLoraWeight;
  if (name && typeof weight === "number" && Number.isFinite(weight)) {
    positive.push(`<lora:${name}:${weight}>`);
  }
  positive.push(tags.join(", "));

  const negative = opts.sdNegativePrompt?.trim();
  return negative
    ? `${positive.join(" ")}\n\nNegative prompt: ${negative}`
    : positive.join(" ");
}

// ─── Flux ─────────────────────────────────────────────────────────────────────
// Clear natural-language description; no Midjourney parameters, no LoRA tags.

function formatFlux(facts: SceneFacts): string {
  const sentences: string[] = [];

  const who = clean(facts.characterName + (facts.identity ? `, ${facts.identity}` : ""));
  sentences.push(`A photo of ${who}.`);

  if (facts.outfit)   sentences.push(`${capitalize(who)} is wearing ${lowerFirst(clean(facts.outfit))}.`);
  if (facts.location) sentences.push(`The scene takes place in ${lowerFirst(clean(facts.location))}.`);
  if (facts.action)   sentences.push(`${facts.characterName} ${clean(facts.action)}.`);
  if (facts.props)    sentences.push(`Visible props: ${clean(facts.props)}.`);
  if (facts.camera)   sentences.push(`Camera angle: ${facts.camera}.`);
  if (facts.dialogue) sentences.push(`${facts.characterName} says: "${facts.dialogue.trim().replace(/^"|"$/g, "")}"`);
  for (const e of facts.extras) sentences.push(`${clean(e)}.`);

  return sentences.join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export interface FormatPromptInput {
  scene: Scene;
  character: Pick<Character, "name" | "identityFields">;
  outfit?: Outfit;
  location?: Location;
  fieldConfigs?: FieldConfig[];
}

export function formatEnginePrompt(
  engine: EngineId,
  input: FormatPromptInput,
  options: EngineOptions = {},
): string {
  const facts = collectFacts(input.scene, input.character, input.outfit, input.location, input.fieldConfigs);
  switch (engine) {
    case "midjourney":       return formatMidjourney(facts, options);
    case "stable-diffusion": return formatStableDiffusion(facts, options);
    case "flux":             return formatFlux(facts);
  }
}
