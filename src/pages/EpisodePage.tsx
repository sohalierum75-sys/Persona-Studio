import { confirmDelete } from "../lib/confirm-delete";
import { PlanLimitError } from "../lib/plan-guard";
import React, { useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Film,
  Upload, AlignLeft, X, Copy, Check,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { useStudio } from "../store";
import type { Scene, FieldConfig, Prompt } from "../types";
import { DEFAULT_FIELD_CONFIGS } from "../types";
import { buildPrompt } from "../utils/continuity";
import ImportPromptsModal from "../components/studio/ImportPromptsModal";
import SceneReferencesPanel from "../components/studio/SceneReferencesPanel";
import SceneWritingPanel from "../components/studio/SceneWritingPanel";
import PromptPreviewPanel from "../components/studio/PromptPreviewPanel";
import BulkSceneBuilder from "../components/studio/BulkSceneBuilder";

let _dragSrcIdx: number | null = null;

function resolveFieldConfigs(settings: { sceneFieldConfigs?: FieldConfig[] }): FieldConfig[] {
  const saved = settings.sceneFieldConfigs;
  if (saved && saved.length > 0) return [...saved].sort((a, b) => a.order - b.order);
  return DEFAULT_FIELD_CONFIGS.map((c) => ({ ...c }));
}

export default function EpisodePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    episodes, scenes, characters, outfits, locations, settings,
    addScene, updateScene, deleteScene,
    addScenePrompts, deleteScenePrompt, reorderScenes,
  } = useStudio();

  const episode       = episodes.find((e) => e.id === id);
  const character     = episode ? characters.find((c) => c.id === episode.characterId) ?? null : null;
  const episodeScenes = useMemo(
    () => episode ? scenes.filter((s) => s.episodeId === id).sort((a, b) => a.order - b.order) : [],
    [episode, scenes, id]
  );

  const [activeSceneId, setActiveSceneId] = useState<string|null>(episodeScenes[0]?.id ?? null);
  const [isBuilding,    setIsBuilding]    = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [showBulk,      setShowBulk]     = useState(false);
  const [showRefs,      setShowRefs]     = useState(false);
  const [dragOverIdx,   setDragOverIdx]  = useState<number|null>(null);
  const [exportCopied,  setExportCopied] = useState(false);

  const fieldConfigs   = resolveFieldConfigs(settings);
  const charOutfits    = character ? outfits.filter((o) => o.characterId === character.id) : [];
  const activeScene    = episodeScenes.find((s) => s.id === activeSceneId) ?? episodeScenes[0] ?? null;
  const activeIndex    = activeScene ? episodeScenes.indexOf(activeScene) : -1;
  const prevScene      = activeIndex > 0 ? episodeScenes[activeIndex - 1] : undefined;
  const activeOutfit   = activeScene ? charOutfits.find((o) => o.id === activeScene.outfitId) : undefined;
  const activeLocation = activeScene ? locations.find((l) => l.id === activeScene.locationId) : undefined;

  const livePrompt = useMemo(() => {
    if (!activeScene || !character) return "";
    return buildPrompt(activeScene, character, activeOutfit, activeLocation, fieldConfigs);
  }, [activeScene, character, activeOutfit, activeLocation, fieldConfigs]);

  // Continuity warnings: only for confirmed (saved) outfit/location, not free text.
  // Never warn for "continue previous scene" connections.
  const activeWarnings = useMemo(() => {
    if (!activeScene || activeScene.sceneConnection === "continue") return [];
    const warnings: Array<{id:string;message:string;detail?:string}> = [];
    if (activeScene.outfitId) {
      const others = episodeScenes.filter(
        (s) => s.id !== activeScene.id && s.outfitId === activeScene.outfitId && s.sceneConnection !== "continue"
      );
      if (others.length > 0) warnings.push({ id:"outfit-repeat",
        message: `This outfit was used in ${others.length} other scene${others.length>1?"s":""}`,
        detail: others.map((s) => s.title).join(", ") });
    }
    if (activeScene.locationId) {
      const others = episodeScenes.filter(
        (s) => s.id !== activeScene.id && s.locationId === activeScene.locationId && s.sceneConnection !== "continue"
      );
      if (others.length > 0) warnings.push({ id:"location-repeat",
        message: `This location was used in ${others.length} other scene${others.length>1?"s":""}`,
        detail: others.map((s) => s.title).join(", ") });
    }
    return warnings;
  }, [activeScene, episodeScenes]);

  // ── Scene CRUD ─────────────────────────────────────────────────────────────
  async function handleAddScene() {
    if (!episode) return;
    const n = episodeScenes.length + 1;
    const sc = await addScene({
      episodeId: episode.id, order: episodeScenes.length,
      title: `Scene ${String(n).padStart(2,"0")}`,
      status: "draft", action: "", dialogue: "", cameraAngle: "medium-shot",
      duration: "", props: "", notes: "", sceneDescription: "",
      format: "image", sceneConnection: "new",
      customFieldValues: {}, prompts: [], referenceImages: [],
    });
    setActiveSceneId(sc.id);
  }

  async function handleDeleteScene(sceneId: string) {
    const sc = episodeScenes.find((s) => s.id === sceneId);
    const n  = sc?.prompts?.length ?? 0;
    if (!sc || !await confirmDelete(sc.title, n > 0 ? `This will also remove its ${n} saved prompt${n > 1 ? "s" : ""}.` : undefined)) return;
    await deleteScene(sceneId);
    const remaining = episodeScenes.filter((s) => s.id !== sceneId);
    setActiveSceneId(remaining[0]?.id ?? null);
  }

  async function handleSceneUpdate(updates: Partial<Scene>) {
    if (activeScene) await updateScene(activeScene.id, updates);
  }

  // ── Build Prompt ───────────────────────────────────────────────────────────
  const handleBuildPrompt = useCallback(async () => {
    if (!activeScene || !livePrompt.trim()) return;
    setIsBuilding(true);
    try {
      const hash = [
        activeScene.sceneDescription ?? activeScene.action ?? "",
        activeScene.outfitId ?? "", activeScene.outfitOverride ?? "",
        activeScene.locationId ?? "", activeScene.cameraAngle ?? "",
        activeScene.dialogue ?? "", activeScene.props ?? "",
      ].join("|");
      const newPrompt: Prompt = {
        id: uuid(), text: livePrompt,
        label: `Prompt ${(activeScene.prompts?.length ?? 0) + 1}`,
        source: "generated", sceneHash: hash,
        createdAt: new Date().toISOString(),
      };
      await addScenePrompts(activeScene.id, [newPrompt]);
    } catch (error) { if (!(error instanceof PlanLimitError)) window.alert(error instanceof Error ? error.message : "Save failed"); } finally { setIsBuilding(false); }
  }, [activeScene, livePrompt, addScenePrompts]);

  // ── Prompt CRUD ────────────────────────────────────────────────────────────
  async function handleAddPrompt(p: Prompt | Prompt[]): Promise<boolean> {
    if (!activeScene) return false;
    try {
      await addScenePrompts(activeScene.id, Array.isArray(p) ? p : [p]);
      return true;
    } catch (error) {
      if (!(error instanceof PlanLimitError)) window.alert(error instanceof Error ? error.message : "Save failed");
      return false;
    }
  }
  async function handleUpdatePrompt(promptId: string, changes: Partial<Prompt>) {
    if (!activeScene) return;
    const updated = (activeScene.prompts ?? []).map((p) => p.id === promptId ? {...p,...changes} : p);
    await updateScene(activeScene.id, { prompts: updated });
  }
  async function handleDeletePrompt(promptId: string) {
    if (activeScene) await deleteScenePrompt(activeScene.id, promptId);
  }
  async function handleSetPrimary(promptId: string) {
    if (!activeScene) return;
    await updateScene(activeScene.id, {
      primaryPromptId: activeScene.primaryPromptId === promptId ? undefined : promptId,
    });
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport(sceneId: string, prompts: import("../types").Prompt[]) {
    await addScenePrompts(sceneId, prompts);
    setShowImport(false);
  }

  // ── Drag reorder ───────────────────────────────────────────────────────────
  function handleDragStart(idx: number) { _dragSrcIdx = idx; }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (_dragSrcIdx === null || _dragSrcIdx === idx) return;
    setDragOverIdx(idx);
    const arr = [...episodeScenes];
    const [moved] = arr.splice(_dragSrcIdx, 1);
    arr.splice(idx, 0, moved);
    _dragSrcIdx = idx;
    if (episode) reorderScenes(episode.id, arr.map((s) => s.id));
  }
  function handleDragEnd() { setDragOverIdx(null); _dragSrcIdx = null; }

  function handleExportScene() {
    if (!activeScene) return;
    const primary = activeScene.prompts?.find((p) => p.id === activeScene.primaryPromptId);
    const text = primary?.text ?? livePrompt;
    navigator.clipboard.writeText(text).catch(console.error);
    setExportCopied(true); setTimeout(() => setExportCopied(false), 1800);
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!episode) return (
    <div style={{ padding:48, textAlign:"center", color:"var(--text-muted)" }}>
      Episode not found. <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Go back</button>
    </div>
  );
  if (!character) return (
    <div style={{ padding:48, textAlign:"center", color:"var(--text-muted)" }}>Character not found.</div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="episode-layout">

      {/* LEFT: Scene list */}
      <div className="ep-sidebar">
        <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <button className="btn btn-ghost btn-sm" style={{ padding:"4px 6px" }} onClick={() => navigate(-1)}><ArrowLeft size={15}/></button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{episode.title}</div>
            <div style={{ fontSize:11, color:"var(--text-muted)" }}>{character.name}</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ padding:"4px 6px" }} title="Copy primary prompt" onClick={handleExportScene}>
            {exportCopied ? <Check size={14} style={{ color:"var(--success)" }}/> : <Copy size={14}/>}
          </button>
        </div>

        <div style={{ padding:"8px 10px", borderBottom:"1px solid var(--border)", display:"flex", gap:5, flexShrink:0 }}>
          <button className="btn btn-primary btn-sm" style={{ flex:1, justifyContent:"center" }} onClick={handleAddScene}><Plus size={12}/> Scene</button>
          <button className="btn btn-secondary btn-sm" style={{ flex:1, justifyContent:"center" }} onClick={() => setShowBulk(true)}><AlignLeft size={12}/> Paste</button>
          <button className="btn btn-ghost btn-sm" style={{ padding:"5px 7px" }} title="Import prompts" onClick={() => setShowImport(true)}><Upload size={13}/></button>
        </div>

        <div style={{ flex:1, overflowY:"auto" }}>
          {episodeScenes.length === 0 ? (
            <div style={{ padding:"32px 16px", textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>
              No scenes yet.<br/>Click "+ Scene" to start.
            </div>
          ) : episodeScenes.map((sc, idx) => {
            const isActive  = sc.id === activeScene?.id;
            const n         = sc.prompts?.length ?? 0;
            return (
              <div key={sc.id}
                className={`ep-scene-row${isActive?" ep-scene-row--active":""}${dragOverIdx===idx?" ep-scene-row--drop":""}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveSceneId(sc.id)}>
                <GripVertical size={12} style={{ color:"var(--text-muted)", flexShrink:0, opacity:0.35, cursor:"grab" }}/>
                <span style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", minWidth:18, flexShrink:0 }}>
                  {String(idx+1).padStart(2,"0")}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sc.title}</div>
                  <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2, display:"flex", gap:6, alignItems:"center" }}>
                    <span className={`status-pill status-${sc.status}`} style={{ fontSize:9, padding:"1px 5px" }}>{sc.status}</span>
                    {n > 0 && <span>{n} prompt{n>1?"s":""}</span>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm ep-del-btn" style={{ padding:"2px 4px" }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteScene(sc.id); }}>
                  <Trash2 size={11} style={{ color:"var(--error)" }}/>
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ padding:"8px 14px", borderTop:"1px solid var(--border)", fontSize:11, color:"var(--text-muted)", flexShrink:0 }}>
          {episodeScenes.length} scene{episodeScenes.length!==1?"s":""}
        </div>
      </div>

      {/* MIDDLE: Scene Writing Panel */}
      <div className="ep-middle">
        {activeScene ? (
          <>
            <SceneWritingPanel
              scene={activeScene} prevScene={prevScene} character={character}
              charOutfits={charOutfits} allLocations={locations} fieldConfigs={fieldConfigs}
              continuityWarnings={activeWarnings}
              sceneIndex={activeIndex}
              onUpdate={handleSceneUpdate} onBuildPrompt={handleBuildPrompt} isBuilding={isBuilding}
            />
            <div style={{ borderTop:"1px solid var(--border)", flexShrink:0 }}>
              <button style={{ width:"100%", padding:"7px 20px", background:"none", border:"none", cursor:"pointer", fontSize:11, fontWeight:600, color:"var(--text-muted)", display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}
                onClick={() => setShowRefs(v=>!v)}>
                <Film size={12}/> Reference images {activeScene.referenceImages?.length?`(${activeScene.referenceImages.length})`:""}
              </button>
              {showRefs && <div style={{ padding:"0 20px 16px" }}><SceneReferencesPanel scene={activeScene}/></div>}
            </div>
          </>
        ) : (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, color:"var(--text-muted)" }}>
            <Film size={40} style={{ opacity:0.2 }}/>
            <div style={{ fontSize:14, fontWeight:600 }}>No scene selected</div>
            <button className="btn btn-primary" onClick={handleAddScene}><Plus size={14}/> Add first scene</button>
          </div>
        )}
      </div>

      {/* RIGHT: Prompt Preview Panel */}
      <div className="ep-right">
        {activeScene ? (
          <PromptPreviewPanel
            scene={activeScene}
            outfit={activeOutfit} location={activeLocation}
            character={character} fieldConfigs={fieldConfigs}
            onAddPrompt={handleAddPrompt} onUpdatePrompt={handleUpdatePrompt}
            onDeletePrompt={handleDeletePrompt} onSetPrimary={handleSetPrimary}
          />
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--text-muted)", fontSize:12, textAlign:"center", padding:24 }}>
            Select a scene to see the live prompt preview.
          </div>
        )}
      </div>

      {/* Modals */}
      {showImport && (
        <ImportPromptsModal
          scenes={episodeScenes}
          defaultSceneId={activeScene?.id ?? null}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
      {showBulk && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target===e.currentTarget) setShowBulk(false); }}>
          <div className="modal" style={{ width:"min(1000px,95vw)", maxHeight:"90vh" }}>
            <div className="modal-header">
              <div style={{ fontWeight:700, fontSize:16 }}>Paste Multiple Scenes</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(false)}><X size={16}/></button>
            </div>
            <div className="modal-body" style={{ overflowY:"auto" }}>
              <BulkSceneBuilder
                episode={episode} character={character}
                charOutfits={charOutfits} locations={locations}
                fieldConfigs={fieldConfigs} existingSceneCount={episodeScenes.length}
                onCreated={(firstId) => { setShowBulk(false); setActiveSceneId(firstId); }}
                onClose={() => setShowBulk(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
