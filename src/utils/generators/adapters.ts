// ============================================================
// Generator prompt adapters — deterministic template logic.
//
// NO AI API calls: each buildXxxPrompt converts the shared
// universal facts into one generator's ready-to-paste format
// using plain string building. Adapters read the raw options
// only — an option the user never set must never change the
// output (existing MJ/SD/Flux outputs stay byte-identical).
// ============================================================
import type { GeneratorId, GeneratorInput, GeneratorOptions, PromptFacts } from "./types";
import { mergeOptionDefaults } from "./registry";
import {
  avoidSentence, buildVideoPrompt, capitalize, clean, collectFacts,
  flag, locationWithLighting, nlConsistencySentences, nlImageCore,
  num, str,
} from "./shared";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── Midjourney ───────────────────────────────────────────────────────────────
// Concise visual description + supported --parameters.

export function buildMidjourneyPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const parts: string[] = [];
  parts.push(clean(facts.characterName + (facts.identity ? `, ${facts.identity}` : "")));
  if (facts.outfit)   parts.push(`wearing ${clean(facts.outfit)}`);
  if (facts.location) parts.push(clean(locationWithLighting(facts)));
  if (facts.action)   parts.push(clean(facts.action));
  if (facts.props)    parts.push(clean(facts.props));
  if (facts.camera)   parts.push(facts.camera);
  for (const e of facts.extras) parts.push(clean(e));
  parts.push(...nlConsistencySentences(flag(o, "characterConsistency") === true));

  const params: string[] = [];
  const ar = str(o, "aspectRatio");
  if (ar) params.push(`--ar ${ar}`);
  const stylize = num(o, "mjStylize");
  if (stylize !== undefined) params.push(`--stylize ${Math.round(clamp(stylize, 0, 1000))}`);
  const chaos = num(o, "mjChaos");
  if (chaos !== undefined) params.push(`--chaos ${Math.round(clamp(chaos, 0, 100))}`);
  const quality = str(o, "mjQuality");
  if (quality) params.push(`--q ${quality}`);
  if (flag(o, "mjRawMode") === true) params.push("--raw");
  const seed = num(o, "mjSeed");
  if (seed !== undefined) params.push(`--seed ${Math.round(clamp(seed, 0, 4294967295))}`);
  const no = str(o, "mjNoText");
  if (no) params.push(`--no ${no}`);
  const refUrl = str(o, "mjCharacterRefUrl");
  const version = str(o, "mjModelVersion");
  if (version) params.push(`--v ${version.replace(/^v/, "")}`);
  if (refUrl && (version === "v6" || version === "v6.1" || version === "v7")) {
    const omni = version === "v7";
    params.push(`${omni ? "--oref" : "--cref"} ${refUrl}`);
    const cw = num(o, "mjCharacterRefWeight");
    if (cw !== undefined) params.push(`${omni ? "--ow" : "--cw"} ${Math.round(clamp(cw, omni ? 1 : 0, 100))}`);
  }

  return [parts.filter(Boolean).join(", "), params.join(" ")].filter(Boolean).join(" ");
}

// ─── Stable Diffusion ─────────────────────────────────────────────────────────
// Positive prompt + separate optional negative prompt + an optional settings
// line. LoRA tag only when a real name and weight are supplied.

export function buildStableDiffusionPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const tags: string[] = [];
  tags.push(clean(facts.characterName));
  if (facts.identity)     tags.push(clean(facts.identity));
  if (facts.outfit)       tags.push(clean(facts.outfit));
  if (facts.location)     tags.push(clean(locationWithLighting(facts)));
  if (facts.action)       tags.push(clean(facts.action));
  if (facts.props)        tags.push(clean(facts.props));
  if (facts.camera)       tags.push(facts.camera);
  for (const e of facts.extras) tags.push(clean(e));
  const positiveNotes = str(o, "sdPositivePrompt");
  if (positiveNotes) tags.push(clean(positiveNotes));
  tags.push(...nlConsistencySentences(flag(o, "characterConsistency") === true));

  const positive: string[] = [];
  const name = str(o, "sdLoraName");
  const weight = num(o, "sdLoraWeight");
  if (name && weight !== undefined) positive.push(`<lora:${name}:${weight}>`);
  positive.push(tags.join(", "));

  const lines: string[] = [positive.join(" ")];

  const negative = str(o, "sdNegativePrompt");
  if (negative) lines.push(`Negative prompt: ${negative}`);

  const settings: string[] = [];
  const steps = num(o, "sdSteps");
  if (steps !== undefined) settings.push(`Steps ${Math.round(clamp(steps, 1, 150))}`);
  const cfg = num(o, "sdCfg");
  if (cfg !== undefined) settings.push(`CFG ${clamp(cfg, 1, 30)}`);
  const sampler = str(o, "sdSampler");
  if (sampler) settings.push(`Sampler ${sampler}`);
  const seed = num(o, "sdSeed");
  if (seed !== undefined) settings.push(`Seed ${Math.round(clamp(seed, 0, 4294967295))}`);
  const ar = str(o, "aspectRatio");
  if (ar) settings.push(`Aspect ${ar}`);
  const model = str(o, "sdModel");
  if (model) settings.push(`Model ${model}`);
  if (settings.length) lines.push(`Settings: ${settings.join(", ")}`);

  return lines.join("\n\n");
}

// ─── Flux ─────────────────────────────────────────────────────────────────────
// Clean natural-language description; no Midjourney parameters, no LoRA tags.

export function buildFluxPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const concise = str(o, "fluxDetail") === "concise";
  const sentences = nlImageCore(facts, { secondary: !concise });

  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") === true));
  const ar = str(o, "aspectRatio");
  if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);
  const avoid = str(o, "fluxNegative");
  if (avoid) sentences.push(avoidSentence(avoid));
  const seed = num(o, "fluxSeed");
  if (seed !== undefined) sentences.push(`Generation setting: seed ${Math.round(clamp(seed, 0, 4294967295))} (where supported).`);

  return sentences.join(" ");
}

// ─── Video generators (shared structured format) ──────────────────────────────

export function buildVeoPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  return buildVideoPrompt(facts, {
    mode: str(o, "veoMode") === "image" ? "image" : "text",
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "veoCamera"),
    subjectMotion: str(o, "veoSubjectMotion"),
    dialogue: flag(o, "veoDialogue") === false ? false : undefined,
    audio: flag(o, "veoAmbient") === false
      ? false
      : str(o, "veoAudio"),
    consistency: flag(o, "characterConsistency") !== false,
    sceneContinuity: flag(o, "sceneContinuity") === true,
    negative: str(o, "negativeText"),
    duration: str(o, "veoDuration"),
  });
}

export function buildKlingPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const mode = str(o, "klingMode") === "image" ? "image" : "text";
  const frames = flag(o, "klingFrames") === true
    ? (mode === "image"
      ? "Start frame attached; transition smoothly toward the end frame"
      : "Start frame attached; animate outward from it")
    : undefined;
  return buildVideoPrompt(facts, {
    mode,
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "klingCamera"),
    motionStrength: str(o, "klingMotion"),
    frames,
    consistency: flag(o, "characterConsistency") !== false,
    negative: str(o, "negativeText"),
    duration: str(o, "klingDuration"),
  });
}

export function buildRunwayPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  return buildVideoPrompt(facts, {
    mode: str(o, "runwayMode") === "image" ? "image" : "text",
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "runwayCamera"),
    subjectMotion: str(o, "runwayMotion"),
    consistency: flag(o, "characterConsistency") !== false,
    sceneContinuity: flag(o, "sceneContinuity") === true,
    negative: str(o, "negativeText"),
    duration: str(o, "runwayDuration"),
  });
}

export function buildHailuoPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  return buildVideoPrompt(facts, {
    mode: str(o, "hailuoMode") === "image" ? "image" : "text",
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "hailuoCamera"),
    subjectMotion: str(o, "hailuoMotion"),
    consistency: flag(o, "characterConsistency") !== false,
    duration: str(o, "hailuoDuration"),
  });
}

export function buildWanPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  return buildVideoPrompt(facts, {
    mode: str(o, "wanMode") === "image" ? "image" : "text",
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "wanCamera"),
    subjectMotion: str(o, "wanMotion"),
    consistency: flag(o, "characterConsistency") !== false,
    negative: str(o, "negativeText"),
    duration: str(o, "wanDuration"),
  });
}

export function buildLumaPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  return buildVideoPrompt(facts, {
    mode: str(o, "lumaMode") === "image" ? "image" : "text",
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "lumaCamera"),
    subjectMotion: str(o, "lumaMotion"),
    sceneExtra: str(o, "lumaSceneNotes"),
    consistency: flag(o, "characterConsistency") !== false,
  });
}

export function buildPikaPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  return buildVideoPrompt(facts, {
    mode: str(o, "pikaMode") === "image" ? "image" : "text",
    aspectRatio: str(o, "aspectRatio"),
    cameraMove: str(o, "pikaCamera"),
    motionStrength: str(o, "pikaMotion"),
    effects: str(o, "pikaEffects"),
    consistency: flag(o, "characterConsistency") !== false,
    duration: str(o, "pikaDuration"),
  });
}

// ─── Natural-language image generators ────────────────────────────────────────

export function buildGptImagePrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const sentences = nlImageCore(facts);
  const style = str(o, "gptStyle");         if (style) sentences.push(`Style: ${clean(style)}.`);
  const composition = str(o, "gptComposition"); if (composition) sentences.push(`Composition: ${clean(composition)}.`);
  const background = str(o, "gptBackground");   if (background) sentences.push(`Background: ${clean(background)}.`);
  const size = str(o, "gptSize");           if (size && size !== "auto") sentences.push(`Image size: ${size}.`);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") !== false));
  const avoid = str(o, "gptAvoid");         if (avoid) sentences.push(avoidSentence(avoid));
  return sentences.join(" ");
}

export function buildNanoBananaPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const isEdit = str(o, "nbMode") === "edit";
  const sentences: string[] = [];
  if (isEdit) {
    sentences.push("Using the attached reference image as the base, keep the same subject and identity.");
    const keep = str(o, "nbReferenceNote");
    if (keep) sentences.push(`Preserve from the reference: ${clean(keep)}.`);
  }
  sentences.push(...nlImageCore(facts));

  const composition = str(o, "nbComposition"); if (composition) sentences.push(`Composition: ${clean(composition)}.`);
  const background = str(o, "nbBackground");   if (background) sentences.push(`Background: ${clean(background)}.`);
  const ar = str(o, "aspectRatio");            if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") !== false));
  return sentences.join(" ");
}

export function buildSeedreamPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const sentences = nlImageCore(facts);
  const style = str(o, "seedreamStyle");         if (style) sentences.push(`Style: ${clean(style)}.`);
  const composition = str(o, "seedreamComposition"); if (composition) sentences.push(`Composition: ${clean(composition)}.`);
  const ar = str(o, "aspectRatio");              if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") !== false));
  const avoid = str(o, "seedreamNegative");      if (avoid) sentences.push(avoidSentence(avoid));
  return sentences.join(" ");
}

export function buildIdeogramPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const sentences = nlImageCore(facts);

  const style = str(o, "ideogramStyle");
  if (style && style !== "auto") sentences.push(`Style: ${capitalize(style)}.`);
  const renderText = str(o, "ideogramText");
  if (renderText) sentences.push(`Render the text "${clean(renderText)}" exactly as written, clearly legible.`);
  const ar = str(o, "aspectRatio");
  if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") !== false));
  const avoid = str(o, "ideogramNegative");
  if (avoid) sentences.push(avoidSentence(avoid));
  return sentences.join(" ");
}

export function buildLeonardoPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const sentences = nlImageCore(facts);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") === true));
  const preset = str(o, "leonardoStyle");
  if (preset && preset !== "none") sentences.push(`Style preset: ${preset}.`);
  const ar = str(o, "aspectRatio");
  if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);

  let out = sentences.join(" ");
  const negative = str(o, "leonardoNegative");
  if (negative) out += `\n\nNegative prompt: ${negative}`;

  const settings: string[] = [];
  const guidance = num(o, "leonardoGuidance");
  if (guidance !== undefined) settings.push(`Guidance ${clamp(guidance, 1, 20)}`);
  const seed = num(o, "leonardoSeed");
  if (seed !== undefined) settings.push(`Seed ${Math.round(clamp(seed, 0, 4294967295))}`);
  if (settings.length) out += `\n\nSettings: ${settings.join(", ")}`;
  return out;
}

export function buildFireflyPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const isArt = str(o, "fireflyContent") === "art";
  const sentences = nlImageCore(facts, { lead: isArt ? "An artistic image of" : "A photo of" });

  sentences.push(`Content type: ${isArt ? "art" : "photo"}.`);
  const effects = str(o, "fireflyEffects");       if (effects) sentences.push(`Style and effects: ${clean(effects)}.`);
  const composition = str(o, "fireflyComposition"); if (composition) sentences.push(`Composition: ${clean(composition)}.`);
  const ar = str(o, "aspectRatio");               if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") !== false));
  const avoid = str(o, "fireflyAvoid");           if (avoid) sentences.push(avoidSentence(avoid));
  return sentences.join(" ");
}

// ─── Generic fallback ─────────────────────────────────────────────────────────
// For future tools that simply take a clean natural-language prompt.

export function buildCustomPrompt(facts: PromptFacts, o: GeneratorOptions): string {
  const sentences = nlImageCore(facts);
  sentences.push(...nlConsistencySentences(flag(o, "characterConsistency") !== false));
  const ar = str(o, "aspectRatio");
  if (ar) sentences.push(`Framed for a ${ar} aspect ratio.`);
  const avoid = str(o, "customNegative");
  if (avoid) sentences.push(avoidSentence(avoid));
  return sentences.join(" ");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function formatGeneratorPrompt(
  generator: GeneratorId,
  input: GeneratorInput,
  options: GeneratorOptions = {},
): string {
  const facts = collectFacts(input.scene, input.character, input.outfit, input.location, input.fieldConfigs);
  const o = mergeOptionDefaults(generator, options);
  switch (generator) {
    case "midjourney":       return buildMidjourneyPrompt(facts, o);
    case "stable-diffusion": return buildStableDiffusionPrompt(facts, o);
    case "flux":             return buildFluxPrompt(facts, o);
    case "veo":              return buildVeoPrompt(facts, o);
    case "kling":            return buildKlingPrompt(facts, o);
    case "runway":           return buildRunwayPrompt(facts, o);
    case "gpt-image":        return buildGptImagePrompt(facts, o);
    case "nano-banana":      return buildNanoBananaPrompt(facts, o);
    case "seedream":         return buildSeedreamPrompt(facts, o);
    case "ideogram":         return buildIdeogramPrompt(facts, o);
    case "leonardo":         return buildLeonardoPrompt(facts, o);
    case "firefly":          return buildFireflyPrompt(facts, o);
    case "hailuo":           return buildHailuoPrompt(facts, o);
    case "wan":              return buildWanPrompt(facts, o);
    case "luma":             return buildLumaPrompt(facts, o);
    case "pika":             return buildPikaPrompt(facts, o);
    case "custom":           return buildCustomPrompt(facts, o);
    default:                 return buildCustomPrompt(facts, o);
  }
}
