import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Pencil, Check, Image, Video, Link2, Unlink2,
  Shirt, MapPin, Camera, Settings2, Plus, X,
  AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import type { Scene, Character, Outfit, Location, FieldConfig, CameraAngle } from "../../types";

const CAMERA_ANGLES: CameraAngle[] = [
  "selfie","close-up","medium-shot","wide-shot","overhead","low-angle","over-shoulder","pov","cinematic",
];
const VIDEO_DURATIONS = ["4s","5s","6s","8s","10s","15s","20s","30s","1min"];

interface ContinuityWarning {
  id: string;
  message: string;
  detail?: string;
  sourceTitle?: string;
}

interface Props {
  scene: Scene;
  prevScene?: Scene;
  character: Character;
  charOutfits: Outfit[];
  allLocations: Location[];
  fieldConfigs: FieldConfig[];
  continuityWarnings?: ContinuityWarning[];
  sceneIndex: number;
  onUpdate: (u: Partial<Scene>) => void;
  onBuildPrompt: () => Promise<void>;
  isBuilding: boolean;
}

export default function SceneWritingPanel({
  scene, prevScene, character, charOutfits, allLocations,
  fieldConfigs, continuityWarnings = [], sceneIndex, onUpdate, onBuildPrompt, isBuilding,
}: Props) {
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft,   setTitleDraft]   = useState(scene.title);
  const [showDialogue, setShowDialogue] = useState(!!scene.dialogue);
  const [showCustomize,setShowCustomize]= useState(false);
  const [activeChip,   setActiveChip]   = useState<null|"outfit"|"location"|"camera">(null);
  const [outfitMode,   setOutfitMode]   = useState<"saved"|"custom">(scene.outfitId ? "saved" : "custom");
  const [justSaved,    setJustSaved]    = useState(false);
  const [showNewOpts,  setShowNewOpts]  = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer= useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync title draft when scene changes
  useEffect(() => { setTitleDraft(scene.title); }, [scene.id, scene.title]);
  useEffect(() => { setShowDialogue(!!scene.dialogue); }, [scene.id]);
  useEffect(() => { setOutfitMode(scene.outfitId ? "saved" : "custom"); }, [scene.id, scene.outfitId]);

  // Ctrl+Enter = Build Prompt (only when focus is inside the panel)
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); onBuildPrompt(); }
  }, [onBuildPrompt]);
  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  // Derived values
  const sceneDesc   = scene.sceneDescription ?? scene.action ?? "";
  const format      = scene.format      ?? "image";
  const sceneConn   = scene.sceneConnection ?? "new";
  const camera      = scene.cameraAngle ?? "medium-shot";
  const activeOutfit  = charOutfits.find(o => o.id === scene.outfitId);
  const activeLocation= allLocations.find(l => l.id === scene.locationId);

  function triggerSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1600);
    }, 500);
  }
  function update(u: Partial<Scene>) { onUpdate(u); triggerSave(); }

  function commitTitle() {
    if (titleDraft.trim()) update({ title: titleDraft.trim() });
    else setTitleDraft(scene.title);
    setTitleEditing(false);
  }

  function toggleSceneConn(conn: "continue"|"new") {
    if (conn === "continue" && prevScene) {
      update({ sceneConnection: "continue", outfitId: prevScene.outfitId,
        locationId: prevScene.locationId, outfitOverride: prevScene.outfitOverride });
      setShowNewOpts(false);
    } else {
      update({ sceneConnection: "new" });
      setShowNewOpts(true);
    }
  }

  function toggleChip(chip: "outfit"|"location"|"camera") {
    setActiveChip(a => a === chip ? null : chip);
    setShowCustomize(false);
  }

  // Chip labels
  const inherited = sceneConn === "continue" && !!prevScene;
  const outfitLabel = inherited && prevScene?.outfitId
    ? "\u21a9 " + (charOutfits.find(o => o.id === prevScene.outfitId)?.name ?? "Prev outfit")
    : activeOutfit?.name ?? (scene.outfitOverride ? "Custom outfit" : "Outfit");
  const locationLabel = inherited && prevScene?.locationId
    ? "\u21a9 " + (allLocations.find(l => l.id === prevScene.locationId)?.name ?? "Prev location")
    : activeLocation?.name ?? "Location";
  const outfitSet   = !!(scene.outfitId || scene.outfitOverride);
  const locationSet = !!scene.locationId;

  const cycleStatus = () => {
    const next: Record<Scene["status"], Scene["status"]> = { draft:"ready", ready:"used", used:"draft" };
    update({ status: next[scene.status] });
  };

  return (
    <div className="swp" style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── Title bar ──────────────────────────────────────────────────── */}
      <div className="swp-titlebar">
        <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", minWidth:22 }}>
          {String(sceneIndex + 1).padStart(2,"0")}
        </span>
        {titleEditing ? (
          <input ref={titleRef} className="input" style={{ flex:1, fontSize:14, fontWeight:700, padding:"3px 8px", height:30 }}
            value={titleDraft} autoFocus
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key==="Enter") commitTitle(); if (e.key==="Escape") { setTitleDraft(scene.title); setTitleEditing(false); }}} />
        ) : (
          <button className="swp-title-btn" onClick={() => setTitleEditing(true)}>
            {scene.title}<Pencil size={12} style={{ opacity:0.35, flexShrink:0 }} />
          </button>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {justSaved && (
            <span className="field-saved-badge"><Check size={10} /> Saved</span>
          )}
          <button className={`status-pill status-${scene.status}`} onClick={cycleStatus} title="Click to cycle status" style={{ cursor:"pointer", border:"none" }}>
            {scene.status}
          </button>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* Scene description (main box) */}
        <textarea
          className="scene-write-box"
          value={sceneDesc}
          onChange={e => update({ sceneDescription: e.target.value, action: e.target.value })}
          onKeyDown={e => { if (e.ctrlKey && e.key==="Enter") { e.preventDefault(); onBuildPrompt(); }}}
          placeholder="Describe what happens, what the character wears, and where they are. You can also paste a complete prompt."
          rows={7}
        />

        {/* Format + Scene-connection row */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
          {/* Format toggle */}
          <div className="swp-toggle-group">
            {(["image","video"] as const).map(f => (
              <button key={f} className={`swp-toggle${format===f?" swp-toggle--on":""}`} onClick={() => update({ format: f })}>
                {f==="image" ? <Image size={13}/> : <Video size={13}/>}
                {f==="image" ? "Image" : "Video"}
              </button>
            ))}
          </div>

          {/* Duration — video only */}
          {format==="video" && (
            <select className="select" style={{ width:"auto", fontSize:12, height:30, padding:"0 8px" }}
              value={scene.duration || "8s"} onChange={e => update({ duration: e.target.value })}>
              {VIDEO_DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {/* Scene connection — only when there's a prev scene */}
          {prevScene && (
            <div className="swp-toggle-group">
              {(["continue","new"] as const).map(c => (
                <button key={c} className={`swp-toggle${sceneConn===c?" swp-toggle--on":""}`} onClick={() => toggleSceneConn(c)}>
                  {c==="continue" ? <Link2 size={12}/> : <Unlink2 size={12}/>}
                  {c==="continue" ? "Continue scene" : "New scene"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* "Keep / change?" prompt when New scene selected */}
        {showNewOpts && sceneConn==="new" && prevScene && (
          <div style={{ padding:"10px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", fontSize:12, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <span style={{ color:"var(--text-secondary)" }}>Keep outfit &amp; location from previous scene?</span>
            <button className="btn btn-secondary btn-sm"
              onClick={() => { update({ outfitId: prevScene.outfitId, locationId: prevScene.locationId, outfitOverride: prevScene.outfitOverride }); setShowNewOpts(false); }}>
              Keep them
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNewOpts(false)}>Change them</button>
          </div>
        )}

        {/* Chips row */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          <button className={`scene-chip${outfitSet?" scene-chip--set":""}${activeChip==="outfit"?" scene-chip--active":""}`}
            onClick={() => toggleChip("outfit")}>
            <Shirt size={13}/>{outfitLabel}
            {activeChip==="outfit" ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
          <button className={`scene-chip${locationSet?" scene-chip--set":""}${activeChip==="location"?" scene-chip--active":""}`}
            onClick={() => toggleChip("location")}>
            <MapPin size={13}/>{locationLabel}
            {activeChip==="location" ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
          <button className={`scene-chip scene-chip--set${activeChip==="camera"?" scene-chip--active":""}`}
            onClick={() => toggleChip("camera")}>
            <Camera size={13}/>{camera.replace(/-/g," ")}
            {activeChip==="camera" ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
          <button className={`scene-chip${showCustomize?" scene-chip--active":""}`}
            onClick={() => { setShowCustomize(v=>!v); setActiveChip(null); }}>
            <Settings2 size={13}/>More
            {showCustomize ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
        </div>

        {/* ── Outfit chip panel ────────────────────────────────────────── */}
        {activeChip==="outfit" && (
          <div className="chip-panel">
            <div className="swp-subtabs">
              {(["saved","custom"] as const).map(m => (
                <button key={m} className={`swp-subtab${outfitMode===m?" swp-subtab--on":""}`} onClick={() => setOutfitMode(m)}>
                  {m==="saved" ? "Saved outfit" : "Custom / free-text"}
                </button>
              ))}
            </div>
            {outfitMode==="saved" ? (
              <select className="select" value={scene.outfitId ?? ""} onChange={e => update({ outfitId: e.target.value||undefined, outfitOverride: undefined })}>
                <option value="">-- None --</option>
                {charOutfits.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <input className="input" value={scene.outfitOverride ?? ""}
                onChange={e => update({ outfitOverride: e.target.value, outfitId: undefined })}
                placeholder="Describe the outfit freely\u2026" />
            )}
          </div>
        )}

        {/* ── Location chip panel ──────────────────────────────────────── */}
        {activeChip==="location" && (
          <div className="chip-panel">
            <select className="select" value={scene.locationId ?? ""} onChange={e => update({ locationId: e.target.value||undefined })}>
              <option value="">-- None --</option>
              {allLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {/* ── Camera chip panel ────────────────────────────────────────── */}
        {activeChip==="camera" && (
          <div className="chip-panel">
            <select className="select" value={camera} onChange={e => update({ cameraAngle: e.target.value as CameraAngle })}>
              {CAMERA_ANGLES.map(a => <option key={a} value={a}>{a.replace(/-/g," ")}</option>)}
            </select>
          </div>
        )}

        {/* ── Customize panel ──────────────────────────────────────────── */}
        {showCustomize && (
          <div className="chip-panel">
            <div className="form-group">
              <label className="form-label">Props</label>
              <input className="input" value={scene.props ?? ""} onChange={e => update({ props: e.target.value })} placeholder="e.g. coffee cup, oversized bag" />
            </div>
            <div className="form-group" style={{ marginTop:10 }}>
              <label className="form-label">Notes</label>
              <textarea className="textarea" rows={2} value={scene.notes ?? ""} onChange={e => update({ notes: e.target.value })} placeholder="Director notes, mood references\u2026" />
            </div>
          </div>
        )}

        {/* ── Continuity inline warnings ───────────────────────────────── */}
        {continuityWarnings.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {continuityWarnings.map(w => (
              <div key={w.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px", background:"var(--warning-bg)", border:"1px solid rgba(255,186,82,0.25)", borderRadius:"var(--radius-sm)", fontSize:12 }}>
                <AlertTriangle size={14} style={{ color:"var(--warning)", flexShrink:0, marginTop:1 }}/>
                <div>
                  <div style={{ fontWeight:600, color:"var(--warning)" }}>{w.message}</div>
                  {w.detail && <div style={{ color:"var(--text-secondary)", marginTop:2 }}>{w.detail}{w.sourceTitle ? ` (${w.sourceTitle})` : ""}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Dialogue ─────────────────────────────────────────────────── */}
        {!showDialogue ? (
          <button className="swp-add-link" onClick={() => setShowDialogue(true)}>
            <Plus size={13}/> Add dialogue / caption
          </button>
        ) : (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <label className="form-label" style={{ margin:0 }}>Dialogue / caption</label>
              <button className="btn btn-ghost btn-sm" style={{ padding:"2px 6px" }} onClick={() => { setShowDialogue(false); update({ dialogue:"" }); }}><X size={12}/></button>
            </div>
            <textarea className="textarea" rows={2} value={scene.dialogue ?? ""} onChange={e => update({ dialogue: e.target.value })} placeholder='What is she saying? Or on-screen caption\u2026'/>
          </div>
        )}

      </div>

      {/* ── Bottom action bar ─────────────────────────────────────────── */}
      <div className="swp-bar">
        <span style={{ fontSize:11, color:"var(--text-muted)", userSelect:"none" }}>Ctrl+\u21b5 = Build Prompt</span>
        <button className="btn btn-primary" style={{ minWidth:140, justifyContent:"center" }}
          onClick={onBuildPrompt} disabled={isBuilding}>
          {isBuilding ? <><span className="swp-spinner"/> Building\u2026</> : <><span style={{ fontSize:15 }}>\u2728</span> Build Prompt</>}
        </button>
      </div>
    </div>
  );
}