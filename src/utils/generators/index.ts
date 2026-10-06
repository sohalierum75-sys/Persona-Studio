// ============================================================
// Target Generator — public API.
// One unified selector system for every supported AI image and
// video generator. UI, options and prompt assembly all derive
// from GENERATORS; adding a generator needs no UI changes.
// ============================================================
export type {
  GeneratorId, GeneratorDef, GeneratorKind, GeneratorInput,
  GeneratorOptions, OptionChoice, OptionFieldDef, OptionFieldType,
  OptionValue, PromptFacts,
} from "./types";

export {
  GENERATORS,
  PRIMARY_GENERATORS,
  GENERATOR_STORAGE_KEY,
  getGenerator,
  readSavedGenerator,
  saveGenerator,
  readGeneratorOptions,
  saveGeneratorOptions,
  resolveOption,
} from "./registry";

export { formatGeneratorPrompt } from "./adapters";

// Named adapters — one per generator, each built on the shared
// primitives in shared.ts.
export {
  buildMidjourneyPrompt,
  buildStableDiffusionPrompt,
  buildFluxPrompt,
  buildVeoPrompt,
  buildKlingPrompt,
  buildRunwayPrompt,
  buildGptImagePrompt,
  buildNanoBananaPrompt,
  buildSeedreamPrompt,
  buildIdeogramPrompt,
  buildLeonardoPrompt,
  buildFireflyPrompt,
  buildHailuoPrompt,
  buildWanPrompt,
  buildLumaPrompt,
  buildPikaPrompt,
  buildCustomPrompt,
} from "./adapters";
