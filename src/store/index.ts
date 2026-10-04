// ============================================================
// Persona Studio — Zustand Store
// ============================================================
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import type {
  Character, Episode, Scene, Outfit, Location,
  ReferenceAsset, UsageRecord, ContinuityGroup,
  AppSettings, ContinuityWarning, FieldConfig, Prompt, SceneImage,
} from "../types";
import { DEFAULT_FIELD_CONFIGS } from "../types";
import {
  localMutations, characterDB, episodeDB, sceneDB, outfitDB, locationDB,
  referenceAssetDB, usageRecordDB, continuityGroupDB, settingsDB,
} from "../db";
import { SETTINGS_ID } from "../lib/sync";
import { checkContinuity } from "../utils/continuity";

interface StudioState {
  // Data
  characters: Character[];
  episodes: Episode[];
  scenes: Scene[];
  outfits: Outfit[];
  locations: Location[];
  referenceAssets: ReferenceAsset[];
  usageRecords: UsageRecord[];
  continuityGroups: ContinuityGroup[];

  // Selection
  activeCharacterId: string | null;
  activeEpisodeId: string | null;
  activeSceneId: string | null;

  // UI
  settings: AppSettings;
  continuityWarnings: ContinuityWarning[];
  isSaving: boolean;
  isLoaded: boolean;

  // Actions
  loadAll: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  saveFieldConfigs: (configs: FieldConfig[]) => Promise<void>;

  // Characters
  addCharacter: (c: Omit<Character, "id" | "createdAt" | "updatedAt">) => Promise<Character>;
  updateCharacter: (id: string, updates: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;

  // Episodes
  addEpisode: (e: Omit<Episode, "id" | "createdAt" | "updatedAt">) => Promise<Episode>;
  updateEpisode: (id: string, updates: Partial<Episode>) => Promise<void>;
  deleteEpisode: (id: string) => Promise<void>;

  // Scenes
  addScene: (s: Omit<Scene, "id" | "createdAt" | "updatedAt">) => Promise<Scene>;
  addScenes: (scenes: Scene[]) => Promise<void>;
  updateScene: (id: string, updates: Partial<Scene>) => Promise<void>;
  deleteScene: (id: string) => Promise<void>;
  reorderScenes: (episodeId: string, orderedIds: string[]) => Promise<void>;
  addScenePrompts: (sceneId: string, prompts: Prompt[]) => Promise<void>;
  deleteScenePrompt: (sceneId: string, promptId: string) => Promise<void>;
  addSceneImages: (sceneId: string, files: { dataUrl: string; name?: string }[]) => Promise<void>;
  removeSceneImage: (sceneId: string, imageId: string) => Promise<void>;
  updateSceneImageCaption: (sceneId: string, imageId: string, caption: string) => Promise<void>;

  // Outfits
  addOutfit: (o: Omit<Outfit, "id" | "createdAt" | "updatedAt">) => Promise<Outfit>;
  updateOutfit: (id: string, updates: Partial<Outfit>) => Promise<void>;
  deleteOutfit: (id: string) => Promise<void>;

  // Locations
  addLocation: (l: Omit<Location, "id" | "createdAt" | "updatedAt">) => Promise<Location>;
  updateLocation: (id: string, updates: Partial<Location>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;

  // Reference Assets
  addReferenceAsset: (a: Omit<ReferenceAsset, "id" | "createdAt">) => Promise<ReferenceAsset>;
  deleteReferenceAsset: (id: string) => Promise<void>;

  // Continuity
  runContinuityCheck: (sceneId: string) => void;
  resolveWarning: (warningId: string, resolution: "keep-anyway" | "choose-another") => void;

  // Selection
  setActiveCharacter: (id: string | null) => void;
  setActiveEpisode: (id: string | null) => void;
  setActiveScene: (id: string | null) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  continuity: {
    avoidOutfitColorRepeat: true,
    avoidOutfitExactRepeat: true,
    avoidLocationCategoryRepeat: true,
    lookbackWindow: 5,
    applyPerCharacter: true,
  },
  reducedMotion: false,
};

let promptSave: Promise<void> = Promise.resolve();
const now = () => new Date().toISOString();

export const useStudio = create<StudioState>()(
  immer((set, get) => ({
    characters: [],
    episodes: [],
    scenes: [],
    outfits: [],
    locations: [],
    referenceAssets: [],
    usageRecords: [],
    continuityGroups: [],
    activeCharacterId: null,
    activeEpisodeId: null,
    activeSceneId: null,
    settings: DEFAULT_SETTINGS,
    continuityWarnings: [],
    isSaving: false,
    isLoaded: false,

    loadAll: async () => {
      const [
        characters, rawEpisodes, rawScenes, outfits, locations,
        referenceAssets, usageRecords, continuityGroups, settings,
      ] = await Promise.all([
        characterDB.getAll(),
        episodeDB.getAll(),
        sceneDB.getAll(),
        outfitDB.getAll(),
        locationDB.getAll(),
        referenceAssetDB.getAll(),
        usageRecordDB.getAll(),
        continuityGroupDB.getAll(),
        settingsDB.get(),
      ]);

      // ── Migrate scenes to the multi-prompt / reference-image model ──
      // Pre-multi-prompt scenes stored bulk-imported prompts in
      // `importedPrompts` — fold that list into `prompts` (never dropped)
      // and make sure both new collections exist.
      const migrated: Scene[] = [];
      const episodes = rawEpisodes;
      const scenes = rawScenes.map((sc) => {
        if (sc.importedPrompts !== undefined || sc.prompts === undefined || sc.referenceImages === undefined) {
          const { importedPrompts, ...rest } = sc;
          const next: Scene = {
            ...rest,
            prompts: sc.prompts ?? importedPrompts?.map(p => ({...p, source: "imported" as const})) ?? [],
            referenceImages: sc.referenceImages ?? [],
          };
          migrated.push(next);
          return next;
        }
        return sc;
      });
      if (migrated.length > 0) {
        await Promise.all(migrated.map((s) => sceneDB.put(s)));
      }

      set((s) => {
        s.characters = characters;
        s.episodes = episodes;
        s.scenes = scenes;
        s.outfits = outfits;
        s.locations = locations;
        s.referenceAssets = referenceAssets;
        s.usageRecords = usageRecords;
        s.continuityGroups = continuityGroups;
        s.settings = settings ?? DEFAULT_SETTINGS;
        s.isLoaded = true;
        if (characters.length > 0 && !characters.some(c => c.id === s.activeCharacterId)) {
          s.activeCharacterId = characters[0].id;
        }
      });
    },

    saveSettings: async (s) => {
      const record = { ...s, id: SETTINGS_ID };
      await settingsDB.put(s);
      set((state) => { state.settings = s; });
    },

    saveFieldConfigs: async (configs: FieldConfig[]) => {
      const current = get().settings;
      const updated = { ...current, sceneFieldConfigs: configs };
      const record = { ...updated, id: SETTINGS_ID };
      await settingsDB.put(updated);
      set((state) => { state.settings = updated; });
    },

    // Characters
    addCharacter: async (data) => {
      const c: Character = { ...data, id: uuid(), createdAt: now(), updatedAt: now() };
      await characterDB.put(c);
      set((s) => { s.characters.push(c); });
      return c;
    },
    updateCharacter: async (id, updates) => {
      const c = get().characters.find((x) => x.id === id);
      if (!c) return;
      const updated = { ...c, ...updates, updatedAt: now() };
      await characterDB.put(updated);
      set((s) => {
        const idx = s.characters.findIndex((x) => x.id === id);
        if (idx >= 0) s.characters[idx] = updated;
      });
    },
    deleteCharacter: async (id) => {
      await characterDB.delete(id);
      set((s) => { s.characters = s.characters.filter((x) => x.id !== id); });
    },

    // Episodes
    addEpisode: async (data) => {
      const e: Episode = { ...data, id: uuid(), createdAt: now(), updatedAt: now() };
      await episodeDB.put(e);
      set((s) => { s.episodes.push(e); });
      return e;
    },
    updateEpisode: async (id, updates) => {
      const e = get().episodes.find((x) => x.id === id);
      if (!e) return;
      const updated = { ...e, ...updates, updatedAt: now() };
      await episodeDB.put(updated);
      set((s) => {
        const idx = s.episodes.findIndex((x) => x.id === id);
        if (idx >= 0) s.episodes[idx] = updated;
      });
    },
    deleteEpisode: async (id) => {
      await episodeDB.delete(id);
      set((s) => { s.episodes = s.episodes.filter((x) => x.id !== id); });
    },

    // Scenes
    addScene: async (data) => {
      const sc: Scene = {
        prompts: [],
        referenceImages: [],
        ...data,
        id: uuid(), createdAt: now(), updatedAt: now(),
      };
      await sceneDB.put(sc);
      set((s) => { s.scenes.push(sc); });
      return sc;
    },
    addScenes: async (scenes) => {
      const episodes = get().episodes.filter(ep => scenes.some(sc => sc.episodeId === ep.id)).map(ep => ({
        ...ep, sceneIds:[...ep.sceneIds,...scenes.filter(sc => sc.episodeId === ep.id).map(sc => sc.id)], updatedAt:now(),
      }));
      await localMutations([
        ...episodes.map(value => ({store:"episodes" as const,type:"put" as const,value})),
        ...scenes.map(value => ({store:"scenes" as const,type:"put" as const,value})),
      ]);
      set(s => {
        s.scenes.push(...scenes);
        for (const episode of episodes) {
          const index = s.episodes.findIndex(ep => ep.id === episode.id);
          if (index >= 0) s.episodes[index] = episode;
        }
      });
    },
    updateScene: async (id, updates) => {
      const sc = get().scenes.find((x) => x.id === id);
      if (!sc) return;
      const updated = { ...sc, ...updates, updatedAt: now() };
      await sceneDB.put(updated);
      set((s) => {
        const idx = s.scenes.findIndex((x) => x.id === id);
        if (idx >= 0) s.scenes[idx] = updated;
      });
    },
    deleteScene: async (id) => {
      const sc = get().scenes.find((x) => x.id === id);
      // Clean up this scene's reference image assets (they belong to no one else)
      if (sc?.referenceImages?.length) {
        await Promise.all(sc.referenceImages.map((img) => referenceAssetDB.delete(img.assetId)));
      }
      await sceneDB.delete(id);
      set((s) => {
        s.scenes = s.scenes.filter((x) => x.id !== id);
        if (sc?.referenceImages?.length) {
          const removedAssetIds = new Set(sc.referenceImages.map((i) => i.assetId));
          s.referenceAssets = s.referenceAssets.filter((a) => !removedAssetIds.has(a.id));
        }
      });
    },
    reorderScenes: async (episodeId, orderedIds) => {
      const updates = orderedIds.map((id, idx) => {
        const sc = get().scenes.find((x) => x.id === id);
        return sc ? { ...sc, order: idx, updatedAt: now() } : null;
      }).filter(Boolean) as Scene[];
      await Promise.all(updates.map((u) => sceneDB.put(u)));
      set((s) => {
        updates.forEach((u) => {
          const idx = s.scenes.findIndex((x) => x.id === u.id);
          if (idx >= 0) s.scenes[idx] = u;
        });
      });
      const ep = get().episodes.find((x) => x.id === episodeId);
      if (ep) {
        const updated = { ...ep, sceneIds: orderedIds, updatedAt: now() };
        await episodeDB.put(updated);
        set((s) => {
          const idx = s.episodes.findIndex((x) => x.id === episodeId);
          if (idx >= 0) s.episodes[idx] = updated;
        });
      }
    },
    addScenePrompts: (sceneId, prompts) => {
      const save = promptSave.catch(() => {}).then(async () => {
        const sc = get().scenes.find((x) => x.id === sceneId);
        if (!sc || prompts.length === 0) return;
        const updated = {
          ...sc,
          prompts: [...(sc.prompts ?? []), ...prompts],
          updatedAt: now(),
        };
        await sceneDB.put(updated);
        set((s) => {
          const idx = s.scenes.findIndex((x) => x.id === sceneId);
          if (idx >= 0) s.scenes[idx] = updated;
        });
      });
      promptSave = save;
      return save;
    },
    deleteScenePrompt: async (sceneId, promptId) => {
      const sc = get().scenes.find((x) => x.id === sceneId);
      if (!sc) return;
      const updated = {
        ...sc,
        prompts: (sc.prompts ?? []).filter((p) => p.id !== promptId),
        updatedAt: now(),
      };
      await sceneDB.put(updated);
      set((s) => {
        const idx = s.scenes.findIndex((x) => x.id === sceneId);
        if (idx >= 0) s.scenes[idx] = updated;
      });
    },
    addSceneImages: async (sceneId, files) => {
      const sc = get().scenes.find((x) => x.id === sceneId);
      if (!sc || files.length === 0) return;
      // Store each file as a ReferenceAsset (same store/pattern as character,
      // wardrobe and location images) and append a SceneImage entry per asset.
      const assets: ReferenceAsset[] = [];
      for (const f of files) {
        const a: ReferenceAsset = {
          id: uuid(),
          label: (f.name ?? "").replace(/\.[^/.]+$/, "") || "Scene reference",
          dataUrl: f.dataUrl,
          createdAt: now(),
        };
        await referenceAssetDB.put(a);
        assets.push(a);
      }
      const ts = now();
      const entries: SceneImage[] = assets.map((a) => ({ id: uuid(), assetId: a.id, addedAt: ts }));
      const updated = { ...sc, referenceImages: [...(sc.referenceImages ?? []), ...entries], updatedAt: ts };
      await sceneDB.put(updated);
      set((s) => {
        s.referenceAssets.push(...assets);
        const idx = s.scenes.findIndex((x) => x.id === sceneId);
        if (idx >= 0) s.scenes[idx] = updated;
      });
    },
    removeSceneImage: async (sceneId, imageId) => {
      const sc = get().scenes.find((x) => x.id === sceneId);
      if (!sc) return;
      const entry = (sc.referenceImages ?? []).find((i) => i.id === imageId);
      if (!entry) return;
      await referenceAssetDB.delete(entry.assetId);
      const updated = {
        ...sc,
        referenceImages: (sc.referenceImages ?? []).filter((i) => i.id !== imageId),
        updatedAt: now(),
      };
      await sceneDB.put(updated);
      set((s) => {
        const idx = s.scenes.findIndex((x) => x.id === sceneId);
        if (idx >= 0) s.scenes[idx] = updated;
        s.referenceAssets = s.referenceAssets.filter((a) => a.id !== entry.assetId);
      });
    },
    updateSceneImageCaption: async (sceneId, imageId, caption) => {
      const sc = get().scenes.find((x) => x.id === sceneId);
      if (!sc) return;
      const updated = {
        ...sc,
        referenceImages: (sc.referenceImages ?? []).map((i) =>
          i.id === imageId ? { ...i, caption: caption || undefined } : i
        ),
        updatedAt: now(),
      };
      await sceneDB.put(updated);
      set((s) => {
        const idx = s.scenes.findIndex((x) => x.id === sceneId);
        if (idx >= 0) s.scenes[idx] = updated;
      });
    },

    // Outfits
    addOutfit: async (data) => {
      const o: Outfit = { ...data, id: uuid(), createdAt: now(), updatedAt: now() };
      await outfitDB.put(o);
      set((s) => { s.outfits.push(o); });
      return o;
    },
    updateOutfit: async (id, updates) => {
      const o = get().outfits.find((x) => x.id === id);
      if (!o) return;
      const updated = { ...o, ...updates, updatedAt: now() };
      await outfitDB.put(updated);
      set((s) => {
        const idx = s.outfits.findIndex((x) => x.id === id);
        if (idx >= 0) s.outfits[idx] = updated;
      });
    },
    deleteOutfit: async (id) => {
      await outfitDB.delete(id);
      set((s) => { s.outfits = s.outfits.filter((x) => x.id !== id); });
    },

    // Locations
    addLocation: async (data) => {
      const l: Location = { ...data, id: uuid(), createdAt: now(), updatedAt: now() };
      await locationDB.put(l);
      set((s) => { s.locations.push(l); });
      return l;
    },
    updateLocation: async (id, updates) => {
      const l = get().locations.find((x) => x.id === id);
      if (!l) return;
      const updated = { ...l, ...updates, updatedAt: now() };
      await locationDB.put(updated);
      set((s) => {
        const idx = s.locations.findIndex((x) => x.id === id);
        if (idx >= 0) s.locations[idx] = updated;
      });
    },
    deleteLocation: async (id) => {
      await locationDB.delete(id);
      set((s) => { s.locations = s.locations.filter((x) => x.id !== id); });
    },

    // Reference Assets
    addReferenceAsset: async (data) => {
      const a: ReferenceAsset = { ...data, id: uuid(), createdAt: now() };
      await referenceAssetDB.put(a);
      set((s) => { s.referenceAssets.push(a); });
      return a;
    },
    deleteReferenceAsset: async (id) => {
      await referenceAssetDB.delete(id);
      set((s) => { s.referenceAssets = s.referenceAssets.filter((x) => x.id !== id); });
    },

    // Continuity
    runContinuityCheck: (sceneId) => {
      const { scenes, outfits, locations, usageRecords, episodes, settings } = get();
      const scene = scenes.find((x) => x.id === sceneId);
      if (!scene) return;
      const episode = episodes.find((x) => x.id === scene.episodeId);
      if (!episode) return;
      const warnings = checkContinuity({ scene, episode, scenes, outfits, locations, usageRecords, settings });
      set((s) => { s.continuityWarnings = warnings; });
    },
    resolveWarning: (warningId, resolution) => {
      set((s) => {
        const w = s.continuityWarnings.find((x) => x.id === warningId);
        if (w) { w.resolved = true; w.resolution = resolution; }
      });
    },

    // Selection
    setActiveCharacter: (id) => set((s) => { s.activeCharacterId = id; }),
    setActiveEpisode: (id) => set((s) => { s.activeEpisodeId = id; }),
    setActiveScene: (id) => set((s) => { s.activeSceneId = id; }),
  }))
);
