// Focused checks for the Target Generator prompt adapters
// (src/utils/generators) — legacy MJ/SD/Flux behavior must stay identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatGeneratorPrompt, GENERATORS, getGenerator,
} from "../src/utils/generators";
import type { Scene, Character, Outfit, Location, FieldConfig } from "../src/types";

const scene: Scene = {
  id: "s1", episodeId: "e1", order: 0, title: "Scene 01", status: "draft",
  sceneDescription: "leans on a railing, looking out over the city",
  action: "leans on a railing, looking out over the city",
  dialogue: "We made it.",
  cameraAngle: "wide-shot",
  duration: "", props: "a paper map", notes: "",
  outfitId: "o1", locationId: "l1",
  customFieldValues: {},
  prompts: [], createdAt: "", updatedAt: "",
};

const character: Character = {
  id: "c1", name: "Aria", identityFields: [
    { key: "hair", value: "long silver hair", locked: false },
    { key: "eyes", value: "green eyes", locked: false },
  ],
  episodes: [], settings: { lockIdentity: false }, createdAt: "", updatedAt: "",
} as unknown as Character;

const outfit = {
  id: "o1", characterId: "c1", name: "Red dress", description: "a long red silk dress",
  accessories: "gold earrings", createdAt: "", updatedAt: "",
} as unknown as Outfit;

const location = {
  id: "l1", name: "Rooftop", setting: "a moonlit rooftop garden", lighting: "cool blue night light",
  createdAt: "", updatedAt: "",
} as unknown as Location;

const fieldConfigs = [
  { id: "f1", label: "Mood", type: "text", isDefault: false, isVisible: true, order: 10 },
] as unknown as FieldConfig[];
const sceneWithCustom = { ...scene, customFieldValues: { f1: "melancholic" } };

test("all three original engines preserve character, outfit, location, action and camera data", () => {
  for (const engine of ["midjourney", "stable-diffusion", "flux"] as const) {
    const out = formatGeneratorPrompt(engine, { scene: sceneWithCustom, character, outfit, location, fieldConfigs });
    assert.ok(out.includes("Aria"), `${engine}: character name missing`);
    assert.ok(out.includes("long silver hair"), `${engine}: identity missing`);
    assert.ok(out.includes("red silk dress"), `${engine}: outfit missing`);
    assert.ok(out.includes("moonlit rooftop garden"), `${engine}: location missing`);
    assert.ok(out.includes("leans on a railing"), `${engine}: action missing`);
    assert.ok(out.includes("wide shot"), `${engine}: camera missing`);
    assert.ok(out.includes("Mood: melancholic"), `${engine}: custom field missing`);
  }
});


test("switching engines changes only the output format, not the inputs", () => {
  const mj = formatGeneratorPrompt("midjourney", { scene, character, outfit, location });
  const sd = formatGeneratorPrompt("stable-diffusion", { scene, character, outfit, location });
  const fx = formatGeneratorPrompt("flux", { scene, character, outfit, location });
  assert.notEqual(mj, sd);
  assert.notEqual(sd, fx);
  // Deterministic
  assert.equal(mj, formatGeneratorPrompt("midjourney", { scene, character, outfit, location }));
  assert.equal(fx, formatGeneratorPrompt("flux", { scene, character, outfit, location }));
  // Scene object untouched by formatting
  assert.equal(scene.sceneDescription, "leans on a railing, looking out over the city");
  assert.equal(scene.outfitId, "o1");
});

test("midjourney: version-specific reference parameters and aspect ratio", () => {
  const base = { scene, character, outfit, location };
  const refUrl = "https://example.com/ref.png";

  const v5 = formatGeneratorPrompt("midjourney", base, { mjModelVersion: "v5.2", mjCharacterRefUrl: refUrl, mjCharacterRefWeight: 60 });
  assert.ok(!v5.includes("--cref") && !v5.includes("--cw"), "v5.2 must omit reference params");

  const v7 = formatGeneratorPrompt("midjourney", base, { mjModelVersion: "v7", mjCharacterRefUrl: refUrl, mjCharacterRefWeight: 60 });
  assert.ok(v7.includes(`--oref ${refUrl}`));
  assert.ok(v7.includes("--ow 60"));
  assert.ok(v7.includes("--v 7"));
  assert.ok(!v7.includes(", --"), "parameters must be space separated");
  const v6 = formatGeneratorPrompt("midjourney", base, { mjModelVersion: "v6.1", mjCharacterRefUrl: refUrl, mjCharacterRefWeight: 60 });
  assert.ok(v6.includes(`--cref ${refUrl} --cw 60`));

  const noUrl = formatGeneratorPrompt("midjourney", base, { mjModelVersion: "v7", mjCharacterRefWeight: 60 });
  assert.ok(!noUrl.includes("--cref") && !noUrl.includes("--cw"), "no compatible URL → omit reference params");

  const ar = formatGeneratorPrompt("midjourney", base, { aspectRatio: "16:9" });
  assert.ok(ar.includes("--ar 16:9"));
  const noAr = formatGeneratorPrompt("midjourney", base, {});
  assert.ok(!noAr.includes("--ar"));
});

test("stable diffusion: optional negative prompt and LoRA only with real name+weight", () => {
  const base = { scene, character, outfit, location };

  const plain = formatGeneratorPrompt("stable-diffusion", base, {});
  assert.ok(!plain.includes("Negative prompt"), "no negative section when unset");
  assert.ok(!plain.includes("<lora:"), "no LoRA tag when unset");
  assert.ok(!plain.includes("Settings:"), "no settings line when unset");

  const neg = formatGeneratorPrompt("stable-diffusion", base, { sdNegativePrompt: "blurry, low quality" });
  assert.ok(neg.includes("\n\nNegative prompt: blurry, low quality"));

  const nameOnly = formatGeneratorPrompt("stable-diffusion", base, { sdLoraName: "my-style" });
  assert.ok(!nameOnly.includes("<lora:"), "LoRA omitted without weight");
  const both = formatGeneratorPrompt("stable-diffusion", base, { sdLoraName: "my-style", sdLoraWeight: 0.8 });
  assert.ok(both.startsWith("<lora:my-style:0.8>"));

  const lowered = formatGeneratorPrompt("stable-diffusion", base, { sdLoraName: "   " });
  assert.ok(!lowered.includes("<lora:"), "whitespace name is not a real LoRA");

  const settings = formatGeneratorPrompt("stable-diffusion", base, { sdSteps: 30, sdCfg: 7, sdSampler: "DPM++ 2M Karras", sdSeed: 12345, aspectRatio: "16:9", sdModel: "sdxl" });
  assert.ok(settings.includes("Settings: Steps 30, CFG 7, Sampler DPM++ 2M Karras, Seed 12345, Aspect 16:9, Model sdxl"));

  // No hardcoded gender / quality tags
  assert.ok(!plain.includes("1girl") && !plain.includes("masterpiece") && !plain.includes("best quality"));
});

test("flux: natural language only — no MJ parameters, no LoRA tags", () => {
  const out = formatGeneratorPrompt("flux", { scene, character, outfit, location, fieldConfigs }, {
    mjModelVersion: "v7", mjCharacterRefUrl: "https://example.com/ref.png",
    aspectRatio: "16:9", sdLoraName: "my-style", sdLoraWeight: 0.8,
  });
  assert.ok(!out.includes("--"));
  assert.ok(!out.includes("<lora:"));
  assert.ok(out.includes('says: "We made it."'));
  assert.ok(out.includes("a paper map"));
});

test("flux: concise detail drops secondary details; consistency stays opt-in", () => {
  const base = { scene, character, outfit, location, fieldConfigs };
  const std = formatGeneratorPrompt("flux", base, {});
  const concise = formatGeneratorPrompt("flux", base, { fluxDetail: "concise" });
  assert.ok(std.includes("a paper map") && !concise.includes("a paper map"), "concise trims props");
  const consistencyOff = formatGeneratorPrompt("flux", base, {});
  assert.ok(!consistencyOff.includes("identical face"), "consistency must stay opt-in for Flux");
  const consistencyOn = formatGeneratorPrompt("flux", base, { characterConsistency: true });
  assert.ok(consistencyOn.includes("identical face"));
});

// ─── New generators ───────────────────────────────────────────────────────────

test("every registered generator produces a non-empty prompt with default options", () => {
  const base = { scene: sceneWithCustom, character, outfit, location, fieldConfigs };
  for (const g of GENERATORS) {
    const out = formatGeneratorPrompt(g.id, base, {});
    assert.ok(typeof out === "string" && out.trim().length > 0, `${g.id}: empty output`);
    assert.ok(out.includes("Aria"), `${g.id}: character name missing`);
  }
  assert.ok(GENERATORS.length >= 17, "registry should cover all requested generators");
});

test("video generators: structured sections, no empty headings", () => {
  const base = { scene, character, outfit, location };
  const veo = formatGeneratorPrompt("veo", base, { veoDuration: "8s", veoCamera: "Slow push-in", negativeText: "no captions", veoDialogue: false });
  for (const heading of ["SUBJECT:", "SCENE:", "ACTION:", "CAMERA:", "LIGHTING:", "CONTINUITY:", "AVOID:", "DURATION: 8 seconds."]) {
    assert.ok(veo.includes(heading), `veo missing "${heading}"`);
  }
  assert.ok(!veo.includes("DIALOGUE:"), "dialogue toggle off must omit the DIALOGUE section");
  assert.ok(veo.includes("AVOID: no captions"));
  assert.ok(veo.includes("framed 16:9"), "aspect ratio lands in the CAMERA section");
  // Character consistency on by default for video generators.
  assert.ok(veo.includes("identical face"));
  // No REFERENCE section in text mode.
  assert.ok(!veo.includes("REFERENCE:"));

  const kling = formatGeneratorPrompt("veo", base, { veoMode: "image" });
  assert.ok(kling.includes("REFERENCE: Use the attached image as the first frame."));
});

test("kling: motion strength and start/end frames notes", () => {
  const base = { scene, character, outfit, location };
  const out = formatGeneratorPrompt("kling", base, { klingMotion: "high", klingFrames: true, klingDuration: "10s" });
  assert.ok(out.includes("Motion strength: high"));
  assert.ok(out.includes("FRAMES: Start frame attached; animate outward from it."));
  assert.ok(out.includes("DURATION: 10 seconds."));
});

test("image generators: natural language with per-generator sentences", () => {
  const base = { scene, character, outfit, location };

  const gpt = formatGeneratorPrompt("gpt-image", base, { gptStyle: "editorial", gptSize: "1536x1024", gptAvoid: "text overlays" });
  assert.ok(gpt.includes("Style: editorial."));
  assert.ok(gpt.includes("Image size: 1536x1024."));
  assert.ok(gpt.includes("Avoid: text overlays."));
  assert.ok(!gpt.includes("--"), "no CLI-style parameters in GPT Image output");

  const ideogram = formatGeneratorPrompt("ideogram", base, { ideogramText: "SUMMER 2026", ideogramStyle: "design" });
  assert.ok(ideogram.includes('Render the text "SUMMER 2026" exactly as written, clearly legible.'));
  assert.ok(ideogram.includes("Style: Design."));

  const firefly = formatGeneratorPrompt("firefly", base, { fireflyContent: "art" });
  assert.ok(firefly.includes("An artistic image of Aria"));
  assert.ok(firefly.includes("Content type: art."));
});

test("custom fallback: plain natural-language prompt", () => {
  const out = formatGeneratorPrompt("custom", { scene, character, outfit, location }, { aspectRatio: "9:16" });
  assert.ok(out.includes("A photo of Aria"));
  assert.ok(out.includes("Framed for a 9:16 aspect ratio."));
  assert.ok(!out.includes("--ar") && !out.includes("<lora:"));
});

test("registry: primary set matches the top tabs, ids are unique", () => {
  const ids = GENERATORS.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate generator id");
  const primary = GENERATORS.filter(g => g.primary).map(g => g.id);
  assert.deepEqual(primary, ["midjourney", "stable-diffusion", "flux", "veo", "kling", "runway"]);
  assert.ok(getGenerator("veo").label === "Veo");
  // Options ids must be unique within each generator.
  for (const g of GENERATORS) {
    const optIds = g.options.map(o => o.id);
    assert.equal(new Set(optIds).size, optIds.length, `${g.id}: duplicate option id`);
  }
});

test("video adapters preserve props and custom scene details without mutating saved data", () => {
  const input = { scene: sceneWithCustom, character, outfit, location, fieldConfigs };
  const before = JSON.stringify(input);
  for (const generator of GENERATORS.filter(g => g.kind === "video")) {
    const output = formatGeneratorPrompt(generator.id, input);
    assert.ok(output.includes("a paper map"), generator.id);
    assert.ok(output.includes("Mood: melancholic"), generator.id);
    assert.ok(!/^\w+:\s*\.$/m.test(output), "no empty sections");
  }
  assert.equal(JSON.stringify(input), before);
});

test("saved universal audio fields respect Veo audio toggle", () => {
  const configs: FieldConfig[] = [{ id: "audio", label: "Ambient audio", type: "short-text", isDefault: false, isVisible: true, order: 0 }];
  const input = { scene: { ...scene, customFieldValues: { audio: "rain on the roof" } }, character, fieldConfigs: configs };
  assert.ok(formatGeneratorPrompt("veo", input).includes("AUDIO: rain on the roof."));
  assert.ok(!formatGeneratorPrompt("veo", input, { veoAmbient: false }).includes("rain on the roof"));
  assert.ok(!formatGeneratorPrompt("veo", { scene, character }).includes("AUDIO:"), "do not invent audio");
});

test("Flux seed and SD positive notes stay generator-specific", () => {
  const input = { scene, character };
  assert.ok(formatGeneratorPrompt("flux", input, { fluxSeed: 0 }).includes("seed 0"));
  assert.ok(formatGeneratorPrompt("stable-diffusion", input, { sdPositivePrompt: "watercolor wash" }).includes("watercolor wash"));
  assert.ok(!formatGeneratorPrompt("flux", input, { sdPositivePrompt: "watercolor wash" }).includes("watercolor wash"));
});

test("unknown generator falls back to natural language", () => {
  const unknown = "future-tool" as Parameters<typeof formatGeneratorPrompt>[0];
  assert.equal(getGenerator(unknown).id, "custom");
  const output = formatGeneratorPrompt(unknown, { scene, character });
  assert.ok(output.startsWith("A photo of Aria"));
});
