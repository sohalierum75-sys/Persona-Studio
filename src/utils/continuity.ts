// ============================================================
// Persona Studio — Continuity check engine
// ============================================================
import { v4 as uuid } from "uuid";
import type {
  Scene, Episode, Outfit, Location, UsageRecord,
  ContinuityWarning, AppSettings, FieldConfig, DefaultFieldKey,
} from "../types";

interface CheckParams {
  scene: Scene;
  episode: Episode;
  scenes: Scene[];
  outfits: Outfit[];
  locations: Location[];
  usageRecords: UsageRecord[];
  settings: AppSettings;
}

export function checkContinuity({
  scene, episode, scenes, outfits, locations, usageRecords, settings,
}: CheckParams): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  const { continuity } = settings;

  // Determine lookback episodes
  const allEpisodeIds = Array.from(new Set(usageRecords.map((r) => r.episodeId)));
  const relevantIds = continuity.lookbackWindow === -1
    ? allEpisodeIds
    : allEpisodeIds.slice(-continuity.lookbackWindow);

  const pastRecords = usageRecords.filter(
    (r) => relevantIds.includes(r.episodeId) && r.episodeId !== episode.id
  );

  // Filter to same character if applyPerCharacter is true
  const charPast = continuity.applyPerCharacter
    ? pastRecords.filter((r) => {
        return usageRecords.find(
          (ur) => ur.episodeId === r.episodeId && ur.sceneId === r.sceneId
        );
      })
    : pastRecords;

  // --- Outfit checks ---
  if (scene.outfitId) {
    const outfit = outfits.find((o) => o.id === scene.outfitId);
    if (outfit) {
      // Exact repeat
      if (continuity.avoidOutfitExactRepeat) {
        const match = charPast.find((r) => r.outfitId === outfit.id);
        if (match) {
          warnings.push({
            id: uuid(),
            type: "outfit-exact",
            message: "Exact outfit used recently",
            detail: `"${outfit.name}" appeared in a previous episode.`,
            sourceEpisodeId: match.episodeId,
            sourceEpisodeTitle: match.episodeTitle,
            resolved: false,
          });
        }
      }

      // Color family repeat
      if (continuity.avoidOutfitColorRepeat && !warnings.find((w) => w.type === "outfit-exact")) {
        const sameFamily = charPast.filter((r) => {
          if (!r.outfitId) return false;
          const o = outfits.find((x) => x.id === r.outfitId);
          return o && o.colorFamily === outfit.colorFamily;
        });
        if (sameFamily.length > 0) {
          const match = sameFamily[0];
          warnings.push({
            id: uuid(),
            type: "outfit-color-family",
            message: `${capitalize(outfit.colorFamily)} family worn recently`,
            detail: `A ${outfit.colorFamily}-toned outfit appeared in Episode "${match.episodeTitle}".`,
            sourceEpisodeId: match.episodeId,
            sourceEpisodeTitle: match.episodeTitle,
            resolved: false,
          });
        }
      }
    }
  }

  // --- Location checks ---
  if (scene.locationId && continuity.avoidLocationCategoryRepeat) {
    const location = locations.find((l) => l.id === scene.locationId);
    if (location) {
      const sameCategory = charPast.filter((r) => {
        if (!r.locationId) return false;
        const l = locations.find((x) => x.id === r.locationId);
        return l && l.category === location.category;
      });
      if (sameCategory.length > 0) {
        const match = sameCategory[0];
        warnings.push({
          id: uuid(),
          type: "location-category",
          message: `${capitalize(location.category)} setting used recently`,
          detail: `A ${location.category} location appeared in Episode "${match.episodeTitle}".`,
          sourceEpisodeId: match.episodeId,
          sourceEpisodeTitle: match.episodeTitle,
          resolved: false,
        });
      }
    }
  }

  return warnings;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
}

// Color family normalization map
export const COLOR_FAMILY_MAP: Record<string, string> = {
  red: "red", crimson: "red", scarlet: "red", coral: "red", burgundy: "red", maroon: "red",
  orange: "orange", amber: "orange", peach: "orange", terracotta: "orange",
  yellow: "yellow", gold: "gold", mustard: "yellow", cream: "yellow", beige: "yellow",
  green: "green", olive: "green", sage: "green", emerald: "green", lime: "green", mint: "green",
  teal: "teal", turquoise: "teal", cyan: "teal",
  blue: "blue", navy: "blue", cobalt: "blue", sky: "blue", denim: "blue", indigo: "blue",
  purple: "purple", violet: "purple", lavender: "purple", lilac: "purple", plum: "purple",
  pink: "pink", rose: "pink", blush: "pink", magenta: "pink", fuchsia: "pink",
  brown: "brown", tan: "brown", camel: "brown", chocolate: "brown", mocha: "brown",
  black: "black", charcoal: "black", onyx: "black",
  white: "white", ivory: "white", snow: "white", pearl: "white",
  gray: "gray", grey: "gray", silver: "silver",
};

export function normalizeColorFamily(colorName: string): string {
  const lower = colorName.toLowerCase();
  return COLOR_FAMILY_MAP[lower] ?? "other";
}

// Generate a prompt for a scene.
// fieldConfigs is optional for backward compat — when omitted, all default
// fields with non-empty values are included in their natural order.
export function buildPrompt(
  scene: Scene,
  character: { name: string; identityFields: Array<{ key: string; value: string; locked: boolean }> },
  outfit?: Outfit,
  location?: Location,
  fieldConfigs?: import("../types").FieldConfig[],
): string {
  const identity = character.identityFields
    .filter((f) => f.value)
    .map((f) => f.value)
    .join(", ");

  const lines: string[] = [];
  lines.push(identity ? `Character: ${character.name} \u2014 ${identity}` : `Character: ${character.name}`);

  // Use sceneDescription (new field) with fallback to action for old data
  const actionText = scene.sceneDescription || scene.action || "";

  if (fieldConfigs) {
    const sorted = [...fieldConfigs].sort((a, b) => a.order - b.order);
    for (const cfg of sorted) {
      if (!cfg.isVisible) continue;
      if (cfg.isDefault) {
        switch (cfg.defaultKey) {
          case "outfit": {
            if (outfit) {
              lines.push(
                `Wearing ${outfit.name}: ${outfit.description}.` +
                (outfit.accessories ? ` Accessories: ${outfit.accessories}.` : "")
              );
            } else if (scene.outfitOverride) {
              lines.push(`Wearing: ${scene.outfitOverride}.`);
            }
            break;
          }
          case "outfitOverride": {
            // Handled inline in "outfit" case above; skip standalone to avoid duplication
            break;
          }
          case "location": {
            if (location) {
              lines.push(
                `Setting: ${location.name} \u2014 ${location.setting}.` +
                (location.lighting ? ` Lighting: ${location.lighting}.` : "")
              );
            }
            break;
          }
          case "action":      if (actionText)          lines.push(`Action: ${actionText}.`); break;
          case "dialogue":    if (scene.dialogue)      lines.push(`Dialogue: "${scene.dialogue}"`); break;
          case "cameraAngle": if (scene.cameraAngle)   lines.push(`Camera: ${scene.cameraAngle.replace(/-/g, " ")}.`); break;
          case "duration":    if (scene.duration)      lines.push(`Duration: ${scene.duration}.`); break;
          case "props":       if (scene.props)         lines.push(`Props: ${scene.props}.`); break;
          case "notes":       if (scene.notes)         lines.push(`Notes: ${scene.notes}.`); break;
          // title / status are meta — excluded from prompt body
        }
      } else {
        const val = scene.customFieldValues?.[cfg.id];
        if (val) lines.push(`${cfg.label}: ${val}.`);
      }
    }
  } else {
    // Legacy path: no fieldConfigs provided
    if (outfit) {
      lines.push(`Wearing ${outfit.name}: ${outfit.description}.${outfit.accessories ? ` Accessories: ${outfit.accessories}.` : ""}`);
    } else if (scene.outfitOverride) {
      lines.push(`Wearing: ${scene.outfitOverride}.`);
    }
    if (location) {
      lines.push(`Setting: ${location.name} \u2014 ${location.setting}.${location.lighting ? ` Lighting: ${location.lighting}.` : ""}`);
    }
    if (actionText)       lines.push(`Action: ${actionText}.`);
    if (scene.dialogue)   lines.push(`Dialogue: "${scene.dialogue}"`);
    if (scene.cameraAngle) lines.push(`Camera: ${scene.cameraAngle.replace(/-/g, " ")}.`);
    if (scene.duration)   lines.push(`Duration: ${scene.duration}.`);
    if (scene.props)      lines.push(`Props: ${scene.props}.`);
  }

  return lines.filter(Boolean).join("\n");
}

/** Compute a lightweight hash of key scene fields.
 *  Used to detect whether a scene changed since a prompt was built. */
export function computeSceneHash(scene: Scene): string {
  return [
    scene.sceneDescription ?? scene.action ?? "",
    scene.outfitId ?? "",
    scene.outfitOverride ?? "",
    scene.locationId ?? "",
    scene.cameraAngle ?? "",
    scene.dialogue ?? "",
    scene.props ?? "",
  ].join("|");
}

// ── JSON prompt building ──────────────────────────────────────────────────

const KEY_TO_JSON: Partial<Record<DefaultFieldKey, string>> = {
  title: "scene", status: "status", duration: "duration",
  outfit: "outfit", outfitOverride: "outfitDescription",
  location: "location", action: "action", dialogue: "dialogue",
  cameraAngle: "camera", props: "props", notes: "notes",
};

export interface PromptCharacter {
  name: string;
  identityFields: Array<{ key: string; value: string }>;
}

/** Build the key-value JSON representation of a scene (used by the JSON prompt format) */
export function buildSceneJSON(
  scene: Scene,
  character: PromptCharacter | null | undefined,
  outfit: Outfit | undefined,
  location: Location | undefined,
  fieldConfigs: FieldConfig[],
): Record<string, string> {
  const result: Record<string, string> = {};
  if (character) {
    const identity = character.identityFields.filter((f) => f.value).map((f) => f.value).join(", ");
    result["character"] = identity ? `${character.name} \u2014 ${identity}` : character.name;
  }
  const sorted = [...fieldConfigs].sort((a, b) => a.order - b.order);
  for (const cfg of sorted) {
    if (!cfg.isVisible) continue;
    if (cfg.isDefault && cfg.defaultKey) {
      const key = KEY_TO_JSON[cfg.defaultKey];
      if (!key) continue;
      switch (cfg.defaultKey) {
        case "title":          result[key] = scene.title; break;
        case "status":         result[key] = scene.status; break;
        case "duration":       if (scene.duration)    result[key] = scene.duration; break;
        case "outfit":         if (outfit) result[key] = `${outfit.name}: ${outfit.description}${outfit.accessories ? `. Accessories: ${outfit.accessories}` : ""}`; break;
        case "outfitOverride": if (!outfit && scene.outfitOverride) result[key] = scene.outfitOverride; break;
        case "location":       if (location) result[key] = `${location.name} \u2014 ${location.setting}${location.lighting ? `. Lighting: ${location.lighting}` : ""}`; break;
        case "action":         if (scene.action)      result[key] = scene.action; break;
        case "dialogue":       if (scene.dialogue)    result[key] = scene.dialogue; break;
        case "cameraAngle":    if (scene.cameraAngle) result[key] = scene.cameraAngle.replace(/-/g, " "); break;
        case "props":          if (scene.props)       result[key] = scene.props; break;
        case "notes":          if (scene.notes)       result[key] = scene.notes; break;
      }
    } else if (!cfg.isDefault) {
      const val = scene.customFieldValues?.[cfg.id];
      if (val) {
        const key = cfg.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || cfg.id;
        result[key] = val;
      }
    }
  }
  return result;
}

