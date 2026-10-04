import { confirmDelete } from "../../lib/confirm-delete";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Check, Star, Trash2, RefreshCw, Edit3, Plus,
  ChevronDown, ChevronUp, Columns2, X, Zap, Settings2,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Scene, Character, Outfit, Location, FieldConfig, Prompt } from "../../types";
import { computeSceneHash } from "../../utils/continuity";
import {
  formatEnginePrompt, ENGINES, readSavedEngine, saveEngine,
  type EngineId, type EngineOptions,
} from "../../utils/promptFormatter";

interface Props {
  scene: Scene;
  outfit?: Outfit;
  location?: Location;
  character: Character;
  fieldConfigs: FieldConfig[];
  onAddPrompt: (p: Prompt | Prompt[]) => Promise<boolean>;
  onUpdatePrompt: (id: string, changes: Partial<Prompt>) => void;
  onDeletePrompt: (id: string) => void;
  onSetPrimary: (id: string) => void;
}

const SOURCE_LABEL: Record<Prompt["source"], string> = {
  generated: "Generated",
  manual:    "Manual",
  imported:  "Imported",
};
const SOURCE_COLOR: Record<Prompt["source"], string> = {
  generated: "var(--accent)",
  manual:    "var(--success)",
  imported:  "var(--warning)",
};

function SourceBadge({ source }: { source: Prompt["source"] }) {
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:"var(--radius-full)",
      background: SOURCE_COLOR[source] + "22", color: SOURCE_COLOR[source],
      border: "1px solid " + SOURCE_COLOR[source] + "44", whiteSpace:"nowrap", letterSpacing:"0.04em" }}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff/60_000) + "m ago";
  if (diff < 86_400_000) return Math.floor(diff/3_600_000) + "h ago";
  return Math.floor(diff/86_400_000) + "d ago";
}

// ── Clamped prompt body with an overflow-aware Expand/Collapse toggle ────────
// The full text always stays in the record; only the preview is clamped.
function SavedPromptText({ text, expanded, onToggle }: {
  text: string; expanded: boolean; onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    setOverflows(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <>
      <div ref={ref} className={`prompt-row-text${expanded ? " expanded" : ""}`}
        onClick={onToggle}
        title={expanded ? "Click to collapse" : "Click to expand"}>
        {text.trim()
          ? text
          : <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>(empty prompt — use Edit to add text)</span>}
      </div>
      {(overflows || expanded) && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0 12px 8px" }}>
          <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, gap: 3 }} onClick={onToggle}>
            {expanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      )}
    </>
  );
}

// Build N structural variations of a prompt by reordering / rephrasing sections
function generateVariations(baseText: string, count: number): string[] {
  const lines = baseText.split("\n").filter(Boolean);
  if (lines.length < 2) return Array(count).fill(baseText);
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    // Rotate lines so each variation leads with a different section
    const rotated = [...lines.slice(i % lines.length), ...lines.slice(0, i % lines.length)];
    results.push(rotated.join("\n"));
  }
  return results;
}

export default function PromptPreviewPanel({
  scene, outfit, location, character, fieldConfigs,
  onAddPrompt, onUpdatePrompt, onDeletePrompt, onSetPrimary,
}: Props) {
  const [copied, setCopied]         = useState<string|null>(null);   // id or "live"
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds]  = useState<string[]>([]);
  const [editingId, setEditingId]    = useState<string|null>(null);
  const [editText,  setEditText]     = useState("");
  const [editLabel, setEditLabel]    = useState("");
  const [variCount, setVariCount]    = useState(3);
  const [expandedId,setExpandedId]   = useState<string|null>(null);
  const [labelEditId, setLabelEditId]= useState<string|null>(null);
  const [labelDraft, setLabelDraft]  = useState("");

  // ── Engine switcher state ──
  const [engine, setEngine]         = useState<EngineId>(readSavedEngine);
  const [optsOpen, setOptsOpen]     = useState(false);
  const [engineOpts, setEngineOpts] = useState<EngineOptions>({});

  function selectEngine(id: EngineId) {
    setEngine(id);
    saveEngine(id);
  }

  // Formatted output for the selected engine — derived only; scene fields untouched.
  const currentPrompt = useMemo(
    () => formatEnginePrompt(engine, { scene, character, outfit, location, fieldConfigs }, engineOpts),
    [engine, scene, character, outfit, location, fieldConfigs, engineOpts],
  );

  const prompts = (scene.prompts ?? []).slice().reverse(); // newest first
  const primary = scene.primaryPromptId;
  const currentHash = computeSceneHash(scene);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(console.error);
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  }

  function buildAndSave() {
    if (!currentPrompt.trim()) return;
    const p: Prompt = {
      id: uuid(), text: currentPrompt, label: `Prompt ${(scene.prompts?.length ?? 0) + 1}`,
      source: "generated", sceneHash: currentHash, createdAt: new Date().toISOString(),
    };
    onAddPrompt(p);
  }

  async function addManual() {
    const p: Prompt = {
      id: uuid(), text: "", label: "Manual prompt", source: "manual",
      sceneHash: currentHash, createdAt: new Date().toISOString(),
    };
    if (!await onAddPrompt(p)) return;
    setEditingId(p.id); setEditText(""); setEditLabel("Manual prompt");
  }

  function saveEdit(id: string) {
    onUpdatePrompt(id, { text: editText, label: editLabel });
    setEditingId(null);
  }

  function cancelEdit(id: string) {
    setEditingId(null);
    // "Add manual" creates the row empty so the editor opens inline; if the
    // user backs out without typing anything, don't leave an empty row behind.
    const p = prompts.find((x) => x.id === id);
    if (p && !p.text.trim()) onDeletePrompt(id);
  }

  function duplicatePrompt(p: Prompt) {
    onAddPrompt({ ...p, id: uuid(), label: p.label + " (copy)", createdAt: new Date().toISOString() });
  }

  function toggleCompare(id: string) {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length < 3 ? [...prev,id] : prev);
  }

  function handleGenerateVariations() {
    const base = currentPrompt || prompts[0]?.text;
    if (!base) return;
    const vars = generateVariations(base, variCount);
    void onAddPrompt(vars.map((text, i) => ({
      id: uuid(), text, label: `Variation ${i+1}`,
      source: "generated" as const, sceneHash: currentHash, createdAt: new Date().toISOString(),
    })));
  }

  // ── Compare Mode ──────────────────────────────────────────────────────────
  if (compareMode && compareIds.length >= 2) {
    const compareSrc = compareIds.map(cid => prompts.find(p=>p.id===cid)).filter(Boolean) as Prompt[];
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0, background:"var(--bg-card)" }}>
          <Columns2 size={15} style={{ color:"var(--accent)" }}/>
          <span style={{ fontWeight:700, fontSize:13 }}>Compare ({compareSrc.length})</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={() => setCompareMode(false)}><X size={13}/> Exit</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:16, display:"grid", gridTemplateColumns:`repeat(${compareSrc.length},1fr)`, gap:12 }}>
          {compareSrc.map(p => (
            <div key={p.id} style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <SourceBadge source={p.source}/>
                {p.id === primary && <Star size={12} style={{ color:"var(--warning)" }}/>}
                <span style={{ fontSize:11, color:"var(--text-muted)", flex:1 }}>{p.label}</span>
              </div>
              <pre style={{ flex:1, whiteSpace:"pre-wrap", wordBreak:"break-word", fontSize:11, lineHeight:1.7, color:"var(--text-secondary)", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:10, margin:0, fontFamily:"\"SF Mono\",\"Fira Code\",monospace", minHeight:200 }}>
                {p.text}
              </pre>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(p.text, p.id)}>
                {copied===p.id ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Normal layout ─────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── Live preview header ────────────────────────────────────────── */}
      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0, background:"var(--bg-card)" }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--success)", boxShadow:"0 0 6px var(--success)", animation:"pulse 2s infinite" }}/>
        <span style={{ fontWeight:700, fontSize:13, flex:1 }}>Ready Prompt</span>
        {prompts.length >= 2 && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => { setCompareMode(true); setCompareIds(prompts.slice(0,2).map(p=>p.id)); }}>
            <Columns2 size={12}/> Compare
          </button>
        )}
      </div>

      {/* ── Live preview box ───────────────────────────────────────────── */}
      <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--divider)", flexShrink:0 }}>
        {/* Engine switcher */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
          <div style={{ flex:1, display:"flex", gap:3, background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:3 }}>
            {ENGINES.map((e) => (
              <button key={e.id} type="button" title={`Format prompt for ${e.label}`}
                onClick={() => selectEngine(e.id)}
                style={{ flex:1, fontSize:10, fontWeight:700, padding:"4px 0", border:"none", cursor:"pointer",
                  borderRadius:"calc(var(--radius-sm) - 2px)", letterSpacing:"0.02em",
                  background: engine===e.id ? "var(--accent)" : "transparent",
                  color: engine===e.id ? "#fff" : "var(--text-muted)",
                  transition:"background 120ms ease, color 120ms ease" }}>
                {e.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize:10, padding:"4px 7px" }}
            title="Engine options (model, reference, LoRA)"
            onClick={() => setOptsOpen(v=>!v)}>
            <Settings2 size={12}/> {optsOpen ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
        </div>

        {/* Engine options — compact expandable section */}
        {optsOpen && (
          <div style={{ display:"flex", flexDirection:"column", gap:8, padding:"10px 12px", marginBottom:10,
            background:"var(--bg-elevated)", border:"1px dashed var(--border)", borderRadius:"var(--radius-sm)" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.06em", textTransform:"uppercase" }}>
              {ENGINES.find((e)=>e.id===engine)?.label} options
            </div>
            {engine==="midjourney" && (
              <>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>Model version</span>
                  <select className="input" style={{ flex:1, height:26, fontSize:11, padding:"0 6px" }}
                    value={engineOpts.mjModelVersion ?? "v7"}
                    onChange={(e)=>setEngineOpts(o=>({...o, mjModelVersion:e.target.value}))}>
                    <option value="v5.2">v5.2</option>
                    <option value="v6">v6</option>
                    <option value="v6.1">v6.1</option>
                    <option value="v7">v7</option>
                  </select>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>Aspect ratio</span>
                  <select className="input" style={{ flex:1, height:26, fontSize:11, padding:"0 6px" }}
                    value={engineOpts.aspectRatio ?? ""}
                    onChange={(e)=>setEngineOpts(o=>({...o, aspectRatio:e.target.value || undefined}))}>
                    <option value="">Default</option>
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                    <option value="3:2">3:2</option>
                    <option value="2:3">2:3</option>
                    <option value="21:9">21:9</option>
                  </select>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>Char. ref URL</span>
                  <input className="input" style={{ flex:1, height:26, fontSize:11, padding:"0 6px" }}
                    placeholder="https://… (--cref)" value={engineOpts.mjCharacterRefUrl ?? ""}
                    onChange={(e)=>setEngineOpts(o=>({...o, mjCharacterRefUrl:e.target.value}))}/>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>Ref weight (--cw)</span>
                  <input type="number" min={0} max={100} className="input" style={{ flex:1, height:26, fontSize:11, padding:"0 6px" }}
                    placeholder="100" value={engineOpts.mjCharacterRefWeight ?? ""}
                    onChange={(e)=>setEngineOpts(o=>({...o, mjCharacterRefWeight:e.target.value===""?undefined:+e.target.value}))}/>
                </label>
                <div style={{ fontSize:10, color:"var(--text-muted)" }}>
                  --cref/--cw only apply on v6+ and only when a reference URL is set.
                </div>
              </>
            )}
            {engine==="stable-diffusion" && (
              <>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>Negative prompt</span>
                  <textarea className="textarea" rows={2} style={{ flex:1, fontSize:11, padding:"4px 6px" }}
                    placeholder="Optional — e.g. blurry, extra limbs"
                    value={engineOpts.sdNegativePrompt ?? ""}
                    onChange={(e)=>setEngineOpts(o=>({...o, sdNegativePrompt:e.target.value}))}/>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>LoRA name</span>
                  <input className="input" style={{ flex:1, height:26, fontSize:11, padding:"0 6px" }}
                    placeholder="e.g. my-style-lora" value={engineOpts.sdLoraName ?? ""}
                    onChange={(e)=>setEngineOpts(o=>({...o, sdLoraName:e.target.value}))}/>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--text-secondary)" }}>
                  <span style={{ minWidth:96 }}>LoRA weight</span>
                  <input type="number" step={0.1} min={-2} max={2} className="input" style={{ flex:1, height:26, fontSize:11, padding:"0 6px" }}
                    placeholder="0.8" value={engineOpts.sdLoraWeight ?? ""}
                    onChange={(e)=>setEngineOpts(o=>({...o, sdLoraWeight:e.target.value===""?undefined:+e.target.value}))}/>
                </label>
                <div style={{ fontSize:10, color:"var(--text-muted)" }}>
                  &lt;lora:name:weight&gt; is added only when both a name and a weight are provided.
                </div>
              </>
            )}
            {engine==="flux" && (
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>
                Flux output is a plain natural-language description — no parameters or LoRA tags.
              </div>
            )}
          </div>
        )}

        {currentPrompt ? (
          <pre className="ppp-preview">{currentPrompt}</pre>
        ) : (
          <div className="ppp-empty">Start typing your scene to see the live prompt here.</div>
        )}
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:"center", fontSize:12 }}
            onClick={buildAndSave} disabled={!currentPrompt.trim()}>
            <Plus size={13}/> Build Prompt
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(currentPrompt,"live")} disabled={!currentPrompt.trim()}>
            {copied==="live" ? <><Check size={12}/> Copied!</> : <><Copy size={12}/> Copy</>}
          </button>
        </div>
      </div>

      {/* ── Saved prompts list ─────────────────────────────────────────── */}
      {/* Capped height: the rows scroll inside the section, so many prompts
          can never stretch the panel/page. Heading stays pinned. */}
      <div style={{ flex:1, minHeight:0, maxHeight:480, display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 16px 2px", flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.06em", textTransform:"uppercase", flex:1 }}>
            Saved prompts {prompts.length > 0 && `(${prompts.length})`}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={addManual}>
            <Edit3 size={12}/> Add manual
          </button>
        </div>

        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"10px 16px 12px", display:"flex", flexDirection:"column", gap:10 }}>

        {prompts.length === 0 && (
          <div style={{ fontSize:12, color:"var(--text-muted)", textAlign:"center", padding:"24px 0", opacity:0.6 }}>
            No saved prompts yet.<br/>Click "Build Prompt" to add one.
          </div>
        )}

        {prompts.map(p => {
          const sceneChanged = p.sceneHash && p.sceneHash !== currentHash;
          const isPrimary    = p.id === primary;
          const isEditing    = editingId === p.id;
          const isExpanded   = expandedId === p.id;
          const isEditingLbl = labelEditId === p.id;
          const inCompare    = compareIds.includes(p.id);

          return (
            <div key={p.id} className="prompt-row" style={{ outline: isPrimary ? "1.5px solid var(--accent)" : undefined }}>
              {/* Header */}
              <div className="prompt-row-header">
                <button style={{ background:"none", border:"none", cursor:"pointer", padding:0, flexShrink:0 }}
                  title={isPrimary ? "Primary prompt" : "Set as primary"} onClick={() => onSetPrimary(p.id)}>
                  <Star size={14} style={{ color: isPrimary ? "var(--warning)" : "var(--text-muted)", fill: isPrimary ? "var(--warning)" : "none" }}/>
                </button>
                <SourceBadge source={p.source}/>
                {isEditingLbl ? (
                  <input className="input" style={{ flex:1, fontSize:12, height:24, padding:"0 6px" }}
                    value={labelDraft} autoFocus
                    onChange={e => setLabelDraft(e.target.value)}
                    onBlur={() => { onUpdatePrompt(p.id,{label:labelDraft}); setLabelEditId(null); }}
                    onKeyDown={e => { if(e.key==="Enter") { onUpdatePrompt(p.id,{label:labelDraft}); setLabelEditId(null); } if(e.key==="Escape") setLabelEditId(null); }}/>
                ) : (
                  <button style={{ flex:1, background:"none", border:"none", cursor:"text", textAlign:"left", fontSize:12, fontWeight:600, color:"var(--text-secondary)", padding:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                    onClick={() => { setLabelEditId(p.id); setLabelDraft(p.label ?? ""); }}>
                    {p.label || "Untitled"}
                  </button>
                )}
                <span style={{ fontSize:10, color:"var(--text-muted)", flexShrink:0 }}>{timeAgo(p.createdAt)}</span>
              </div>

              {/* Scene changed notice */}
              {sceneChanged && !isEditing && (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", background:"rgba(255,186,82,0.08)", borderBottom:"1px solid rgba(255,186,82,0.15)", fontSize:11 }}>
                  <RefreshCw size={11} style={{ color:"var(--warning)", flexShrink:0 }}/>
                  <span style={{ color:"var(--warning)", flex:1 }}>Scene changed since this was built</span>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize:10, padding:"1px 8px" }} onClick={() => {
                    onAddPrompt({ id: uuid(), text: currentPrompt, label: (p.label||"Prompt") + " (rebuilt)",
                      source: "generated", sceneHash: currentHash, createdAt: new Date().toISOString() });
                  }}>Regenerate</button>
                </div>
              )}

              {/* Text body */}
              {isEditing ? (
                <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
                  <input className="input" style={{ fontSize:12 }} value={editLabel} onChange={e=>setEditLabel(e.target.value)} placeholder="Label"/>
                  <textarea className="textarea" rows={6} style={{ fontSize:12 }} value={editText} onChange={e=>setEditText(e.target.value)}/>
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => cancelEdit(p.id)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p.id)}><Check size={12}/> Save</button>
                  </div>
                </div>
              ) : (
                <SavedPromptText text={p.text} expanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : p.id)} />
              )}

              {/* Actions */}
              {!isEditing && (
                <div style={{ display:"flex", gap:4, padding:"6px 8px", borderTop:"1px solid var(--divider)", flexWrap:"wrap" }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => copy(p.text, p.id)}>
                    {copied===p.id ? <><Check size={11}/> Copied</> : <><Copy size={11}/> Copy</>}
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setEditingId(p.id); setEditText(p.text); setEditLabel(p.label||""); }}>
                    <Edit3 size={11}/> Edit
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => duplicatePrompt(p)}>
                    <Plus size={11}/> Dupe
                  </button>
                  {compareMode && (
                    <button className={`btn btn-xs${inCompare?" btn-primary":" btn-ghost"}`} onClick={() => toggleCompare(p.id)}>
                      <Columns2 size={11}/>{inCompare?"In compare":"Add to compare"}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-xs" style={{ marginLeft:"auto", color:"var(--error)" }}
                    onClick={async () => { if (await confirmDelete(p.label || "Untitled prompt", "The scene will not be deleted.")) onDeletePrompt(p.id); }}>
                    <Trash2 size={11}/>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Generate N variations ──────────────────────────────────────── */}
        <div style={{ marginTop:4, padding:"12px 14px", background:"var(--bg-elevated)", border:"1px dashed var(--border)", borderRadius:"var(--radius-sm)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:10 }}>Generate variations</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <input type="range" min={2} max={10} value={variCount} onChange={e=>setVariCount(+e.target.value)} style={{ flex:1, accentColor:"var(--accent)" }}/>
            <span style={{ fontSize:12, fontWeight:700, minWidth:16, color:"var(--accent)" }}>{variCount}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleGenerateVariations} disabled={!currentPrompt.trim()}>
              <Zap size={12}/> Generate {variCount}
            </button>
          </div>
          <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:6 }}>Creates {variCount} structurally varied prompts from the current scene.</div>
        </div>

        </div>
      </div>
    </div>
  );
}