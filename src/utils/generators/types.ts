// ============================================================
// Target Generator — type definitions.
//
// One unified generator system covering every supported AI
// image and video generator. The selector UI, the options
// panel and the prompt assembly all render from these defs,
// so adding a generator later means:
//   1. a config entry in registry.ts
//   2. a prompt adapter in adapters.ts
//   3. option field definitions on the config
// — no selector/UI changes required.
// ============================================================
import type { Scene, Character, Outfit, Location, FieldConfig } from "../../types";

export type GeneratorId =
  | "midjourney" | "stable-diffusion" | "flux"
  | "veo" | "kling" | "runway"
  | "gpt-image" | "nano-banana" | "seedream" | "ideogram" | "leonardo" | "firefly"
  | "hailuo" | "wan" | "luma" | "pika"
  | "custom";

/** A single stored option value. */
export type OptionValue = string | number | boolean | undefined;

/** All options for one generator, keyed by OptionFieldDef.id. */
export type GeneratorOptions = Record<string, OptionValue>;

export interface OptionChoice {
  value: string;
  label: string;
}

export type OptionFieldType =
  | "segmented"  // row of pill buttons (mode / aspect / duration)
  | "select"     // dropdown
  | "text"       // single-line input
  | "textarea"   // multi-line input
  | "number"     // numeric input
  | "toggle"     // checkbox row
  | "note";      // static helper text

export interface OptionFieldDef {
  id: string;
  label: string;
  type: OptionFieldType;
  /** Choices for segmented / select fields. */
  choices?: OptionChoice[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Shown/applied when the user has not set this option yet. */
  defaultValue?: OptionValue;
  /** Tooltip for advanced controls. */
  tooltip?: string;
  /** Static text for type "note". */
  note?: string;
  /** Only render the field when this returns true. */
  showIf?: (options: GeneratorOptions) => boolean;
}

/** Internal classification — never surfaced as a UI grouping. */
export type GeneratorKind = "image" | "video" | "custom";

export interface GeneratorDef {
  id: GeneratorId;
  label: string;
  kind: GeneratorKind;
  promptStyle: "parameter-based" | "tag-based" | "natural-language" | "video-structured";
  /** One-line description shown in the "More" menu. */
  hint: string;
  /** Primary generators get a top-level tab; the rest live under "More ▾". */
  primary?: boolean;
  options: OptionFieldDef[];
}

/**
 * Universal, generator-agnostic snapshot of everything the kit knows
 * about the shot. Adapters read this — they never write to it.
 */
export interface GeneratorInput {
  scene: Scene;
  character: Pick<Character, "name" | "identityFields">;
  outfit?: Outfit;
  location?: Location;
  fieldConfigs?: FieldConfig[];
}

/** Flat facts extracted from GeneratorInput — the adapter input. */
export interface PromptFacts {
  characterName: string;
  appearance?: string;
  face?: string;
  hair?: string;
  bodyProportions?: string;
  accessories?: string;
  personality?: string;
  voiceNotes?: string;
  expression?: string;
  pose?: string;
  cameraMovement?: string;
  audio?: string;
  characterConsistencyRules?: string;
  sceneContinuityRules?: string;
  negative?: string;
  aspectRatio?: string;
  identity: string;       // comma-joined identity field values (face, hair, body, …)
  outfit?: string;        // outfit description incl. accessories, or override
  location?: string;      // setting description (without lighting)
  lighting?: string;      // lighting only — separate LIGHTING section for video
  action?: string;
  dialogue?: string;
  camera?: string;        // camera angle, humanized
  props?: string;
  duration?: string;      // scene duration metadata, e.g. "8s"
  extras: string[];       // custom field "label: value" strings
}
