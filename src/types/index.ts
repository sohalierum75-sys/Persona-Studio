// ============================================================
// Persona Studio — Core Type Definitions
// ============================================================

// -------------------------------------------------------
// Scene Field Config
// -------------------------------------------------------
export type FieldType =
  | "short-text"   // single-line input
  | "long-text"    // textarea
  | "dropdown"     // select with custom options
  | "number";      // numeric input

/** Identifies a built-in default field by its Scene property key */
export type DefaultFieldKey =
  | "title" | "status" | "duration"
  | "outfit" | "outfitOverride"
  | "location" | "action" | "dialogue"
  | "cameraAngle" | "props" | "notes";

export interface FieldConfig {
  id: string;                    // stable unique id
  label: string;                 // display label in the form
  type: FieldType;
  options?: string[];            // for dropdown type
  placeholder?: string;
  isDefault: boolean;            // true = built-in, cannot be deleted
  isVisible: boolean;            // false = hidden from form (data kept)
  order: number;                 // render order (0-based)
  /** Only on default fields — maps to the Scene property name */
  defaultKey?: DefaultFieldKey;
}

/** The 11 built-in field configs shipped as defaults */
export const DEFAULT_FIELD_CONFIGS: FieldConfig[] = [
  { id: "_title",        label: "Scene title",       type: "short-text", isDefault: true, isVisible: true, order: 0,  defaultKey: "title"       },
  { id: "_status",       label: "Status",            type: "dropdown",   isDefault: true, isVisible: true, order: 1,  defaultKey: "status",      options: ["draft","ready","used"] },
  { id: "_duration",     label: "Duration",          type: "short-text", isDefault: true, isVisible: true, order: 2,  defaultKey: "duration",    placeholder: "e.g. 30s" },
  { id: "_outfit",       label: "Outfit",            type: "dropdown",   isDefault: true, isVisible: true, order: 3,  defaultKey: "outfit"      },
  { id: "_outfitOverride",label: "Outfit description",type: "short-text",isDefault: true, isVisible: true, order: 4,  defaultKey: "outfitOverride", placeholder: "Describe the outfit freely…" },
  { id: "_location",     label: "Location",          type: "dropdown",   isDefault: true, isVisible: true, order: 5,  defaultKey: "location"    },
  { id: "_action",       label: "Action",            type: "long-text",  isDefault: true, isVisible: true, order: 6,  defaultKey: "action",      placeholder: "What is the character doing?" },
  { id: "_dialogue",     label: "Dialogue / caption",type: "long-text",  isDefault: true, isVisible: true, order: 7,  defaultKey: "dialogue",    placeholder: "What is she saying?" },
  { id: "_cameraAngle",  label: "Camera",            type: "dropdown",   isDefault: true, isVisible: true, order: 8,  defaultKey: "cameraAngle", options: ["selfie","close-up","medium-shot","wide-shot","overhead","low-angle","over-shoulder","pov","cinematic"] },
  { id: "_props",        label: "Props",             type: "short-text", isDefault: true, isVisible: true, order: 9,  defaultKey: "props",       placeholder: "e.g. coffee cup, oversized bag" },
  { id: "_notes",        label: "Notes",             type: "long-text",  isDefault: true, isVisible: true, order: 10, defaultKey: "notes",       placeholder: "Director notes, mood, references…" },
];

export type Status = "draft" | "ready" | "used";
export type ColorFamily =
  | "red" | "orange" | "yellow" | "green" | "teal"
  | "blue" | "purple" | "pink" | "brown" | "black"
  | "white" | "gray" | "gold" | "silver";

export type GarmentType =
  | "top" | "bottom" | "dress" | "jumpsuit" | "outerwear"
  | "swimwear" | "activewear" | "formal" | "lingerie" | "accessories" | "other";

export type LocationCategory =
  | "beach" | "urban" | "nature" | "indoor-home" | "indoor-public"
  | "studio" | "fantasy" | "vehicle" | "rooftop" | "other";

export type CameraAngle =
  | "selfie" | "close-up" | "medium-shot" | "wide-shot"
  | "overhead" | "low-angle" | "over-shoulder" | "pov" | "cinematic";

// -------------------------------------------------------
// Reference Asset
// -------------------------------------------------------
export interface ReferenceAsset {
  id: string;
  label: string;           // e.g. "front face", "side profile"
  dataUrl: string;         // stored in IndexedDB as base64 data URL
  thumbnailUrl?: string;
  createdAt: string;
}

// -------------------------------------------------------
// Character Identity
// -------------------------------------------------------
export interface IdentityField {
  key: string;
  label: string;
  value: string;
  locked: boolean;         // locked fields cannot silently change
}

export interface Character {
  id: string;
  name: string;
  tagline?: string;
  portraitAssetId?: string;   // id of main ReferenceAsset
  referenceAssetIds: string[];
  identityFields: IdentityField[];  // skin tone, hair, body, etc.
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------
// Wardrobe / Outfit
// -------------------------------------------------------
export interface Outfit {
  id: string;
  characterId: string;
  name: string;
  description: string;
  garmentType: GarmentType;
  primaryColor: string;       // e.g. "navy blue"
  colorFamily: ColorFamily;
  accessories: string;
  referenceAssetId?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------
// Location
// -------------------------------------------------------
export interface Location {
  id: string;
  name: string;
  category: LocationCategory;
  setting: string;            // detailed description
  lighting: string;
  mood: string;
  referenceAssetId?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------
// Prompt — one prompt stored on a scene (added manually,
// generated from scene fields, or bulk-imported)
// -------------------------------------------------------
export interface Prompt {
  id: string;
  text: string;         // the prompt content
  label?: string;       // optional human label
  /** Where this prompt came from */
  source: "generated" | "manual" | "imported";
  /** Hash of key scene fields at build time — used to detect "scene changed since built" */
  sceneHash?: string;
  createdAt: string;
}

/** @deprecated Pre-multi-prompt field — read only during migration to `Scene.prompts` */
export interface ImportedPrompt {
  id: string;
  text: string;
  label?: string;
  createdAt: string;
}

// -------------------------------------------------------
// Scene Reference Image — unlimited per scene.
// The binary lives in the existing `referenceAssets`
// IndexedDB store (same as character/wardrobe/location
// images); `assetId` is the reference to it.
// -------------------------------------------------------
export interface SceneImage {
  id: string;
  assetId: string;      // ReferenceAsset id (IndexedDB blob reference)
  caption?: string;
  addedAt: string;
}

// -------------------------------------------------------
// Scene
// -------------------------------------------------------
export interface Scene {
  id: string;
  episodeId: string;
  continuityGroupId?: string;
  order: number;
  title: string;
  status: Status;

  /**
   * Primary writing field — the main scene description / action.
   * Replaces the old `action` field in the UI; both are kept in sync
   * for backward compatibility with buildPrompt.
   */
  sceneDescription?: string;

  /** Image or Video format */
  format?: "image" | "video";

  /** Scene connection — continue inherits outfit/location from prev scene */
  sceneConnection?: "continue" | "new";

  /** The prompt that Export Scene uses by default */
  primaryPromptId?: string;

  outfitId?: string;
  locationId?: string;
  outfitOverride?: string;    // free-text override if no outfit selected

  action: string;
  dialogue: string;
  cameraAngle: CameraAngle;
  duration: string;           // e.g. "30s", "2min"
  props: string;
  notes: string;

  customFieldValues?: Record<string, string>;

  prompts?: Prompt[];

  /** @deprecated Pre-multi-prompt field — migrated to `prompts` on load. */
  importedPrompts?: ImportedPrompt[];

  referenceImages?: SceneImage[];
  promptSnapshot?: PromptSnapshot;

  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------
// Continuity Group — scenes that share the same outing
// -------------------------------------------------------
export interface ContinuityGroup {
  id: string;
  episodeId: string;
  label: string;              // e.g. "Morning Shoot"
  sceneIds: string[];
}

// -------------------------------------------------------
// Episode
// -------------------------------------------------------
export interface Episode {
  id: string;
  characterId: string;
  title: string;
  description: string;
  order: number;
  status: Status;
  sceneIds: string[];
  continuityGroupIds: string[];
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------
// Usage Record — tracks what was used across episodes
// -------------------------------------------------------
export interface UsageRecord {
  id: string;
  characterId: string;
  episodeId: string;
  sceneId: string;
  episodeTitle: string;
  outfitId?: string;
  locationId?: string;
  recordedAt: string;
}

// -------------------------------------------------------
// Prompt Snapshot — frozen copy of details at export
// -------------------------------------------------------

/** A reference image frozen into a snapshot — dataUrl copied at export time */
export interface SnapshotImage {
  id: string;
  dataUrl: string;
  caption?: string;
  addedAt: string;
}

export interface PromptSnapshot {
  version: string;
  sceneTitle: string;
  characterName: string;
  identityFields: IdentityField[];
  outfitDescription?: string;
  locationDescription?: string;
  action: string;
  dialogue: string;
  cameraAngle: CameraAngle;
  duration: string;
  generatedPrompt: string;
  /** Frozen copy of the scene's prompt list at export time */
  prompts?: Prompt[];
  /** Frozen copy of the scene's reference images (dataUrls) at export time */
  referenceImages?: SnapshotImage[];
  exportedAt: string;
}

// -------------------------------------------------------
// Continuity Warning
// -------------------------------------------------------
export type WarningType =
  | "outfit-exact" | "outfit-color-family" | "location-category" | "identity-drift";

export interface ContinuityWarning {
  id: string;
  type: WarningType;
  message: string;
  detail: string;
  sourceEpisodeId?: string;
  sourceEpisodeTitle?: string;
  resolved: boolean;
  resolution?: "keep-anyway" | "choose-another";
}

// -------------------------------------------------------
// Settings
// -------------------------------------------------------
export interface ContinuitySettings {
  avoidOutfitColorRepeat: boolean;
  avoidOutfitExactRepeat: boolean;
  avoidLocationCategoryRepeat: boolean;
  lookbackWindow: 5 | 10 | -1;   // -1 = all
  applyPerCharacter: boolean;
}

export interface AppSettings {
  theme: "dark" | "light";
  continuity: ContinuitySettings;
  reducedMotion: boolean;
  /**
   * Ordered list of field configs for the Scene Details form.
   * Stored globally (applies to every scene in the workspace).
   * Falls back to DEFAULT_FIELD_CONFIGS when absent.
   */
  sceneFieldConfigs?: FieldConfig[];
}

// -------------------------------------------------------
// Root Project (used for backup/restore)
// -------------------------------------------------------
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: AppSettings;
}
