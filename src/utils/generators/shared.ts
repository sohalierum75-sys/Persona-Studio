// ============================================================
// Shared prompt-building primitives used by every adapter:
// fact collection, text helpers, consistency rules, camera
// phrasing, and the structured video section assembler.
// Keeping these in one place means every generator formats
// character consistency, camera and scene data the same way.
// ============================================================
import type { Scene, Character, Outfit, Location, FieldConfig } from "../../types";
import type { GeneratorOptions, OptionChoice, PromptFacts } from "./types";

// ─── Universal facts ──────────────────────────────────────────────────────────

export function collectFacts(
  scene: Scene,
  character: Pick<Character, "name" | "identityFields">,
  outfit?: Outfit,
  location?: Location,
  fieldConfigs?: FieldConfig[],
): PromptFacts {
  const identity = (character.identityFields ?? [])
    .filter((f) => f.value)
    .map((f) => f.value)
    .join(", ");

  const actionText = scene.sceneDescription || scene.action || "";
  // Existing custom scene fields supply universal details without a data migration.
  const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const values = new Map<string, string>();
  for (const field of character.identityFields ?? []) {
    if (field.value?.trim()) {
      values.set(normalize(field.key), field.value.trim());
      if (field.label) values.set(normalize(field.label), field.value.trim());
    }
  }
  for (const field of fieldConfigs ?? []) {
    const value = scene.customFieldValues?.[field.id]?.trim();
    if (field.isVisible && !field.isDefault && value) values.set(normalize(field.label), value);
  }
  const detail = (...keys: string[]) => keys.map((key) => values.get(normalize(key))).find(Boolean);

  return {
    characterName: character.name,
    appearance: detail("appearance", "character appearance"),
    face: detail("face", "face details"),
    hair: detail("hair", "hairstyle"),
    bodyProportions: detail("body", "body proportions"),
    accessories: outfit?.accessories || detail("accessories"),
    personality: detail("personality"),
    voiceNotes: detail("voice", "voice notes"),
    expression: detail("expression"),
    pose: detail("pose"),
    cameraMovement: detail("camera movement"),
    audio: detail("audio", "audio environment", "ambient audio"),
    characterConsistencyRules: detail("character consistency rules"),
    sceneContinuityRules: detail("scene continuity rules"),
    negative: detail("negative", "avoid", "negative avoid rules"),
    aspectRatio: detail("aspect ratio"),
    identity,
    outfit: outfit
      ? `${outfit.description}${outfit.accessories ? `. Accessories: ${outfit.accessories}` : ""}`
      : scene.outfitOverride || undefined,
    location: location?.setting || undefined,
    lighting: location?.lighting || undefined,
    action: actionText || undefined,
    dialogue: scene.dialogue || undefined,
    camera: detail("camera framing") || (scene.cameraAngle ? scene.cameraAngle.replace(/-/g, " ") : undefined),
    props: scene.props || undefined,
    duration: scene.duration || undefined,
    extras: collectExtras(scene, fieldConfigs),
  };
}

/** Location + lighting in one string — the pre-video image generators use this. */
export function locationWithLighting(facts: PromptFacts): string {
  return `${facts.location ?? ""}${facts.lighting ? `. Lighting: ${facts.lighting}` : ""}`;
}

/** Custom field values, ordered by config order. */
export function collectExtras(
  scene: Scene,
  fieldConfigs?: FieldConfig[],
): string[] {
  const extras: string[] = [];
  if (fieldConfigs) {
    for (const cfg of [...fieldConfigs].sort((a, b) => a.order - b.order)) {
      if (!cfg.isVisible || cfg.isDefault) continue;
      const val = scene.customFieldValues?.[cfg.id];
      if (val) extras.push(`${cfg.label}: ${val}`);
    }
  }
  return extras;
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

/** Collapse whitespace and strip trailing periods (adapters control punctuation). */
export function clean(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function stripQuotes(s: string): string {
  return s.trim().replace(/^"|"$/g, "");
}

// ─── Typed option reads ───────────────────────────────────────────────────────
// Adapters read raw option values: an unset option must never change the output.

export function str(o: GeneratorOptions, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function num(o: GeneratorOptions, key: string): number | undefined {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function flag(o: GeneratorOptions, key: string): boolean | undefined {
  const v = o[key];
  return typeof v === "boolean" ? v : undefined;
}

export function choices(values: string[]): OptionChoice[] {
  return values.map((v) => ({ value: v, label: v }));
}

// ─── Shared vocabulary ────────────────────────────────────────────────────────

export const CAMERA_MOVES = [
  "Static shot", "Slow push-in", "Pull-back", "Pan left", "Pan right",
  "Orbit around subject", "Handheld follow", "Crane up", "Tracking shot", "Dolly zoom",
];

// ─── Character consistency (one shared source of truth) ───────────────────────
// Adapters pick the phrasing that suits their generator; they never invent
// their own rules.

export function characterConsistencySentence(): string {
  return "Keep the same character throughout — identical face, hairstyle, skin tone, and body proportions — and keep the outfit and accessories exactly as described";
}

export function noDuplicatesSentence(): string {
  return "Show a single consistent version of the character, with no duplicate or altered versions";
}

export function sceneContinuitySentence(): string {
  return "Maintain continuity with the adjacent shots of the same sequence";
}

/** Sentence-form consistency block for natural-language image generators. */
export function nlConsistencySentences(on: boolean): string[] {
  return on
    ? [`${characterConsistencySentence()}.`, `${noDuplicatesSentence()}.`]
    : [];
}

/** CONTINUITY section text for structured video prompts. */
export function continuitySection(consistencyOn: boolean, sceneContinuityOn: boolean): string | undefined {
  const parts: string[] = [];
  if (consistencyOn) parts.push(`${characterConsistencySentence()}. ${noDuplicatesSentence()}.`);
  if (sceneContinuityOn) parts.push(`${sceneContinuitySentence()}.`);
  return parts.length ? parts.join(" ") : undefined;
}

export function avoidSentence(text: string): string {
  return `Avoid: ${clean(text)}.`;
}

/** "8s" → "8 seconds"; anything else passes through cleaned. */
export function formatDuration(d: string): string {
  const m = /^(\d+)\s*s?(?:ec(?:onds)?)?\.?$/i.exec(d.trim());
  return m ? `${m[1]} seconds` : clean(d);
}

// ─── Natural-language image core ──────────────────────────────────────────────
// The sentence flow shared by Flux and the natural-language image generators.

export function nlImageCore(
  facts: PromptFacts,
  opts?: { lead?: string; secondary?: boolean },
): string[] {
  const lead = opts?.lead ?? "A photo of";
  const secondary = opts?.secondary !== false;
  const sentences: string[] = [];

  const who = clean(facts.characterName + (facts.identity ? `, ${facts.identity}` : ""));
  sentences.push(`${lead} ${who}.`);

  if (facts.outfit)   sentences.push(`${capitalize(who)} is wearing ${lowerFirst(clean(facts.outfit))}.`);
  if (facts.location) sentences.push(`The scene takes place in ${lowerFirst(clean(locationWithLighting(facts)))}.`);
  if (facts.action)   sentences.push(`${facts.characterName} ${clean(facts.action)}.`);

  if (secondary) {
    if (facts.props)    sentences.push(`Visible props: ${clean(facts.props)}.`);
    if (facts.camera)   sentences.push(`Camera angle: ${facts.camera}.`);
    if (facts.dialogue) sentences.push(`${facts.characterName} says: "${stripQuotes(facts.dialogue)}"`);
    for (const e of facts.extras) sentences.push(`${clean(e)}.`);
  }
  return sentences;
}

// ─── Structured video prompt ──────────────────────────────────────────────────
// SUBJECT / SCENE / ACTION / CAMERA / MOVEMENT / LIGHTING / DIALOGUE / AUDIO /
// CONTINUITY / AVOID — empty sections are omitted, never printed as headings.

export interface VideoSettings {
  mode?: "text" | "image";
  aspectRatio?: string;
  cameraMove?: string;
  subjectMotion?: string;
  motionStrength?: string;
  effects?: string;
  /** Extra scene instructions appended to the SCENE section. */
  sceneExtra?: string;
  /** false suppresses DIALOGUE entirely; a string replaces the scene dialogue. */
  dialogue?: string | false;
  audio?: string | false;
  frames?: string;
  consistency?: boolean;
  sceneContinuity?: boolean;
  negative?: string;
  duration?: string;
}

export function buildVideoPrompt(facts: PromptFacts, s: VideoSettings): string {
  const consistencyOn = s.consistency !== false;

  const camBits = [
    facts.camera,
    s.cameraMove || facts.cameraMovement,
    (s.aspectRatio || facts.aspectRatio) ? `framed ${s.aspectRatio || facts.aspectRatio}` : undefined,
  ].filter(Boolean).join(", ");

  const movementBits = [
    s.subjectMotion ? clean(s.subjectMotion) : undefined,
    s.motionStrength ? `Motion strength: ${s.motionStrength.toLowerCase()}` : undefined,
    s.effects ? `Effects: ${clean(s.effects)}` : undefined,
  ].filter(Boolean).join(". ");

  const dialogueText = s.dialogue === false ? undefined : (s.dialogue ?? facts.dialogue);

  const sceneParts = [
    facts.location ? clean(facts.location) : undefined,
    s.sceneExtra ? clean(s.sceneExtra) : undefined,
  ].filter((p): p is string => !!p);

  const subject = clean(facts.characterName + (facts.identity ? `, ${facts.identity}` : ""))
    + (facts.outfit ? `, wearing ${lowerFirst(clean(facts.outfit))}` : "");

  const sections: Array<[string, string | undefined]> = [
    ["REFERENCE",   s.mode === "image" ? "Use the attached image as the first frame" : undefined],
    ["SUBJECT",     subject || undefined],
    ["SCENE",       sceneParts.map(capitalize).join(". ") || undefined],
    ["PROPS",       facts.props ? clean(facts.props) : undefined],
    ["DETAILS",     facts.extras.filter((entry) => !/^(audio|audio.environment|ambient audio|voice|voice notes|camera movement|character consistency rules|scene continuity rules|negative|avoid|negative.avoid rules|aspect ratio):/i.test(entry)).map(clean).filter(Boolean).join(". ") || undefined],
    ["ACTION",      facts.action ? capitalize(clean(facts.action)) : undefined],
    ["CAMERA",      camBits || undefined],
    ["MOVEMENT",    movementBits || undefined],
    ["LIGHTING",    facts.lighting ? capitalize(clean(facts.lighting)) : undefined],
    ["DIALOGUE",    dialogueText ? `${facts.characterName} says: "${stripQuotes(dialogueText)}"` : undefined],
    ["AUDIO",       s.audio === false ? undefined : ([s.audio || facts.audio, facts.voiceNotes].filter(Boolean).join(". ") || undefined)],
    ["FRAMES",      s.frames ? clean(s.frames) : undefined],
    ["CONTINUITY",  [continuitySection(consistencyOn, s.sceneContinuity === true),
      consistencyOn ? facts.characterConsistencyRules : undefined,
      s.sceneContinuity ? facts.sceneContinuityRules : undefined].filter(Boolean).join(" ") || undefined],
    ["AVOID",       [s.negative, facts.negative].filter(Boolean).join(", ") || undefined],
    ["DURATION",    (s.duration || facts.duration) ? formatDuration((s.duration || facts.duration)!) : undefined],
  ];

  return sections
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}: ${String(v).replace(/\.+$/, "")}.`)
    .join("\n");
}
