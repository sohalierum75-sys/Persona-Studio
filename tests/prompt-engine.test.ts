// Focused checks for the engine prompt formatters (src/utils/promptFormatter.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEnginePrompt } from "../src/utils/promptFormatter";
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

test("all three engines preserve character, outfit, location, action and camera data", () => {
  for (const engine of ["midjourney", "stable-diffusion", "flux"] as const) {
    const out = formatEnginePrompt(engine, { scene: sceneWithCustom, character, outfit, location, fieldConfigs });
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
  const mj = formatEnginePrompt("midjourney", { scene, character, outfit, location });
  const sd = formatEnginePrompt("stable-diffusion", { scene, character, outfit, location });
  const fx = formatEnginePrompt("flux", { scene, character, outfit, location });
  assert.notEqual(mj, sd);
  assert.notEqual(sd, fx);
  // Deterministic
  assert.equal(mj, formatEnginePrompt("midjourney", { scene, character, outfit, location }));
  assert.equal(fx, formatEnginePrompt("flux", { scene, character, outfit, location }));
  // Scene object untouched by formatting
  assert.equal(scene.sceneDescription, "leans on a railing, looking out over the city");
  assert.equal(scene.outfitId, "o1");
});

test("midjourney: --cref/--cw only on v6+ with a reference URL; --ar from aspect ratio", () => {
  const base = { scene, character, outfit, location };
  const refUrl = "https://example.com/ref.png";

  const v5 = formatEnginePrompt("midjourney", base, { mjModelVersion: "v5.2", mjCharacterRefUrl: refUrl, mjCharacterRefWeight: 60 });
  assert.ok(!v5.includes("--cref") && !v5.includes("--cw"), "v5.2 must omit reference params");

  const v7 = formatEnginePrompt("midjourney", base, { mjModelVersion: "v7", mjCharacterRefUrl: refUrl, mjCharacterRefWeight: 60 });
  assert.ok(v7.includes(`--cref ${refUrl}`));
  assert.ok(v7.includes("--cw 60"));

  const noUrl = formatEnginePrompt("midjourney", base, { mjModelVersion: "v7", mjCharacterRefWeight: 60 });
  assert.ok(!noUrl.includes("--cref") && !noUrl.includes("--cw"), "no compatible URL → omit reference params");

  const ar = formatEnginePrompt("midjourney", base, { aspectRatio: "16:9" });
  assert.ok(ar.includes("--ar 16:9"));
  const noAr = formatEnginePrompt("midjourney", base, {});
  assert.ok(!noAr.includes("--ar"));
});

test("stable diffusion: optional negative prompt and LoRA only with real name+weight", () => {
  const base = { scene, character, outfit, location };

  const plain = formatEnginePrompt("stable-diffusion", base, {});
  assert.ok(!plain.includes("Negative prompt"), "no negative section when unset");
  assert.ok(!plain.includes("<lora:"), "no LoRA tag when unset");

  const neg = formatEnginePrompt("stable-diffusion", base, { sdNegativePrompt: "blurry, low quality" });
  assert.ok(neg.includes("\n\nNegative prompt: blurry, low quality"));

  const nameOnly = formatEnginePrompt("stable-diffusion", base, { sdLoraName: "my-style" });
  assert.ok(!nameOnly.includes("<lora:"), "LoRA omitted without weight");
  const both = formatEnginePrompt("stable-diffusion", base, { sdLoraName: "my-style", sdLoraWeight: 0.8 });
  assert.ok(both.startsWith("<lora:my-style:0.8>"));

  const lowered = formatEnginePrompt("stable-diffusion", base, { sdLoraName: "   " });
  assert.ok(!lowered.includes("<lora:"), "whitespace name is not a real LoRA");

  // No hardcoded gender / quality tags
  assert.ok(!plain.includes("1girl") && !plain.includes("masterpiece") && !plain.includes("best quality"));
});

test("flux: natural language only — no MJ parameters, no LoRA tags", () => {
  const out = formatEnginePrompt("flux", { scene, character, outfit, location, fieldConfigs }, {
    mjModelVersion: "v7", mjCharacterRefUrl: "https://example.com/ref.png",
    aspectRatio: "16:9", sdLoraName: "my-style", sdLoraWeight: 0.8,
  });
  assert.ok(!out.includes("--"));
  assert.ok(!out.includes("<lora:"));
  assert.ok(out.includes('says: "We made it."'));
  assert.ok(out.includes("a paper map"));
});
