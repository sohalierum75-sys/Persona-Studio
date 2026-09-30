/**
 * BulkSceneBuilder
 * ─────────────────────────────────────────────────────────────────────────────
 * Full bulk scene & prompt builder.
 *
 * Workflow
 *   Paste → Parse preview → Edit rows → Batch defaults → Build prompts → Add to episode
 *
 * Three entry sub-modes:
 *   "paste"  – large textarea, --- separator, example loader   (default)
 *   "file"   – TXT / CSV / JSON file import
 *   "table"  – start from an empty editable table
 *
 * The preview table is NOT written to the episode until the user clicks
 * "Add N scenes to episode".
 */

import React, { useRef, useState, useMemo, useCallback } from "react";
import {
  ClipboardPaste, FileUp, TableProperties, Check, Trash2,
  GripVertical, ChevronDown, ChevronUp, AlertTriangle, Copy,
  Scissors, Merge, Plus, Zap, Eye, X, Info, RefreshCw,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { useStudio } from "../../store";
import type { Scene, Character, Outfit, Location, FieldConfig, CameraAngle, Prompt } from "../../types";
import { buildPrompt } from "../../utils/continuity";
import { parseSceneText, EXAMPLE_PASTE } from "../../utils/parseSceneText";

// ─── Types ───────────────────────────────────────────────────────────────────

type EntryMode   = "paste" | "file" | "table";
type OutputFmt   = "image" | "video";
type ConnMode    = "independent" | "connected";
type RowConn     = "inherit" | "new-group";   // per-row within "connected" mode

const CAMERA_ANGLES: CameraAngle[] = [
  "selfie","close-up","medium-shot","wide-shot",
  "overhead","low-angle","over-shoulder","pov","cinematic",
];

interface DraftRow {
  id: string;
  selected: boolean;
  title: string;
  description: string;     // sceneDescription / action
  dialogue: string;
  duration: string;        // blank → use batch default
  outfitId: string;        // "" = use batch default
  outfitOverride: string;  // free text, overrides outfitId
  locationId: string;
  cameraAngle: CameraAngle | "";
  connMode: RowConn;       // "inherit" | "new-group"
  expanded: boolean;
  errors: string[];
  // for prompt preview
  previewOpen: boolean;
}

interface BatchDefaults {
  outputFmt: OutputFmt;
  duration: string;
  outfitId: string;
  outfitOverride: string;
  locationId: string;
  cameraAngle: CameraAngle;
  connMode: ConnMode;
  generatePrompts: boolean;
}

const BATCH_DEFAULTS: BatchDefaults = {
  outputFmt: "video",
  duration: "8s",
  outfitId: "",
  outfitOverride: "",
  locationId: "",
  cameraAngle: "medium-shot",
  connMode: "independent",
  generatePrompts: true,
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  episode: { id: string; characterId: string; title: string };
  character: Character;
  charOutfits: Outfit[];
  locations: Location[];
  fieldConfigs: FieldConfig[];
  existingSceneCount: number;
  onCreated: (firstNewSceneId: string) => void;
  onClose?: () => void;
}

// ─── Drag state (module-level, avoids re-renders) ────────────────────────────
let _dragSrc: number | null = null;

// ─── Component ───────────────────────────────────────────────────────────────

export default function BulkSceneBuilder({
  episode, character, charOutfits, locations, fieldConfigs,
  existingSceneCount, onCreated, onClose,
}: Props) {
  const { addScene, addScenePrompts, updateEpisode } = useStudio();

  // ── Entry mode / paste state ─────────────────────────────────────────────
  const [entryMode, setEntryMode]     = useState<EntryMode>("paste");
  const [pasteText, setPasteText]     = useState("");
  const [parsed,    setParsed]        = useState<boolean>(false); // true = in preview
  const [dragOverIdx, setDragOverIdx] = useState<number|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Batch defaults ───────────────────────────────────────────────────────
  const [batch, setBatch] = useState<BatchDefaults>(BATCH_DEFAULTS);
  const setB = <K extends keyof BatchDefaults>(k: K, v: BatchDefaults[K]) =>
    setBatch(prev => ({ ...prev, [k]: v }));

  // ── Draft rows ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<DraftRow[]>([makeEmptyRow(1)]);

  // ── Creating state ───────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [summary,  setSummary]  = useState<string|null>(null);

  // ── Prompt preview ───────────────────────────────────────────────────────
  const [previewId, setPreviewId] = useState<string|null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function makeEmptyRow(n: number): DraftRow {
    return {
      id: uuid(), selected: true,
      title: `Scene ${String(existingSceneCount + n).padStart(2,"0")}`,
      description: "", dialogue: "", duration: "",
      outfitId: "", outfitOverride: "", locationId: "",
      cameraAngle: "", connMode: "inherit",
      expanded: true, errors: [], previewOpen: false,
    };
  }

  function parsedToRow(ps: ReturnType<typeof parseSceneText>["scenes"][number], idx: number): DraftRow {
    return {
      id: uuid(), selected: true,
      title: ps.title,
      description: ps.description,
      dialogue: ps.dialogue,
      duration: ps.duration,    // "" if not found → will use batch default
      outfitId: "",
      outfitOverride: ps.outfit,
      locationId: "",
      cameraAngle: (CAMERA_ANGLES.includes(ps.camera as CameraAngle) ? ps.camera : "") as CameraAngle | "",
      connMode: "inherit",
      expanded: false,
      errors: [],
      previewOpen: false,
    };
  }

  // ── Parse / preview ──────────────────────────────────────────────────────
  function handlePreview() {
    if (!pasteText.trim() && entryMode === "paste") return;
    const result = parseSceneText(pasteText, existingSceneCount + 1);
    if (result.scenes.length === 0) return;
    setRows(result.scenes.map((s, i) => parsedToRow(s, i)));
    setParsed(true);
  }

  function handleLoadExample() {
    setPasteText(EXAMPLE_PASTE);
    setParsed(false);
  }

  // ── File import ──────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string).trim();
      const ext  = file.name.split(".").pop()?.toLowerCase();
      if (ext === "json") importJSON(text);
      else if (ext === "csv") importCSV(text);
      else { setPasteText(text); setEntryMode("paste"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function importCSV(text: string) {
    const lines   = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g,""));
    const COL: Record<string,keyof DraftRow> = {
      title:"title", "scene title":"title", description:"description",
      action:"description", dialogue:"dialogue", caption:"dialogue",
      duration:"duration", outfit:"outfitOverride", location:"outfitId",
      camera:"cameraAngle", "camera angle":"cameraAngle",
    };
    const newRows: DraftRow[] = lines.slice(1).map((line, i) => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g,""));
      const row  = makeEmptyRow(i + 1);
      headers.forEach((h, hi) => {
        const key = COL[h];
        if (key && vals[hi]) (row as unknown as Record<string,unknown>)[key] = vals[hi];
      });
      return row;
    });
    setRows(newRows);
    setParsed(true);
  }

  function importJSON(text: string) {
    try {
      const data = JSON.parse(text);
      const arr  = Array.isArray(data) ? data : [data];
      const newRows: DraftRow[] = arr.map((item, i) => ({
        ...makeEmptyRow(i + 1),
        title:       item.title || item.scene || `Scene ${i+1}`,
        description: item.description || item.action || "",
        dialogue:    item.dialogue || item.caption || "",
        duration:    item.duration || "",
        outfitOverride: item.outfit || "",
        locationId:  "",
        cameraAngle: (CAMERA_ANGLES.includes(item.camera) ? item.camera : "") as CameraAngle | "",
      }));
      setRows(newRows);
      setParsed(true);
    } catch { /* silently ignore invalid JSON */ }
  }

  // ── Row manipulation ─────────────────────────────────────────────────────
  const updateRow  = (id: string, u: Partial<DraftRow>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...u, errors: [] } : r));
  const removeRow  = (id: string) => setRows(rs => rs.filter(r => r.id !== id));
  const toggleSel  = (id: string) => updateRow(id, { selected: !rows.find(r=>r.id===id)?.selected });
  const toggleAll  = () => {
    const allSel = rows.every(r => r.selected);
    setRows(rs => rs.map(r => ({ ...r, selected: !allSel })));
  };

  function addEmptyRow() {
    setRows(rs => [...rs, makeEmptyRow(rs.length + 1)]);
    setParsed(true);
  }

  function duplicateRow(idx: number) {
    setRows(rs => {
      const copy = { ...rs[idx], id: uuid(), errors: [], selected: true };
      const next = [...rs]; next.splice(idx + 1, 0, copy); return next;
    });
  }

  // Split a scene's description at a marker character position
  function splitRow(id: string, splitAt: number) {
    setRows(rs => {
      const idx = rs.findIndex(r => r.id === id);
      if (idx === -1) return rs;
      const row  = rs[idx];
      const a    = row.description.slice(0, splitAt).trim();
      const b    = row.description.slice(splitAt).trim();
      const rowA: DraftRow = { ...row, description: a, errors: [] };
      const rowB: DraftRow = {
        ...row, id: uuid(), title: row.title + " (cont.)",
        description: b, dialogue: "", errors: [], expanded: true,
      };
      const next = [...rs];
      next.splice(idx, 1, rowA, rowB);
      return next;
    });
  }

  // Merge two adjacent selected rows
  function mergeSelected() {
    const sel = rows.reduce<number[]>((a, r, i) => r.selected ? [...a, i] : a, []);
    if (sel.length < 2) return;
    // Only merge contiguous pairs
    const pairs: [number,number][] = [];
    for (let i = 0; i < sel.length - 1; i++) {
      if (sel[i] + 1 === sel[i+1]) pairs.push([sel[i], sel[i+1]]);
    }
    if (!pairs.length) return;
    setRows(rs => {
      const next = [...rs];
      // Merge in reverse order so indices stay valid
      for (const [ai, bi] of [...pairs].reverse()) {
        const merged: DraftRow = {
          ...next[ai],
          description: [next[ai].description, next[bi].description].filter(Boolean).join("\n"),
          dialogue:    [next[ai].dialogue, next[bi].dialogue].filter(Boolean).join(" "),
          errors: [],
        };
        next.splice(ai, 2, merged);
      }
      return next;
    });
  }

  // Apply batch default values to selected rows
  function applyBatchToSelected() {
    setRows(rs => rs.map(r => r.selected ? {
      ...r,
      duration:       r.duration      || batch.duration,
      outfitId:       r.outfitId      || batch.outfitId,
      outfitOverride: r.outfitOverride|| batch.outfitOverride,
      locationId:     r.locationId    || batch.locationId,
      cameraAngle:    r.cameraAngle   || batch.cameraAngle,
    } : r));
  }

  // ── Drag reorder ─────────────────────────────────────────────────────────
  function handleDragStart(idx: number) { _dragSrc = idx; }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (_dragSrc === null || _dragSrc === idx) return;
    setDragOverIdx(idx);
    setRows(rs => {
      const arr = [...rs];
      const [moved] = arr.splice(_dragSrc!, 1);
      arr.splice(idx, 0, moved);
      _dragSrc = idx;
      return arr;
    });
  }
  function handleDragEnd() { setDragOverIdx(null); _dragSrc = null; }

  // ── Resolve a row to a Scene payload ─────────────────────────────────────
  function resolveRow(row: DraftRow, globalIdx: number, prevRow?: DraftRow): Omit<Scene,"id"|"createdAt"|"updatedAt"> {
    const isConnected = batch.connMode === "connected" && row.connMode === "inherit" && !!prevRow;
    return {
      episodeId:      episode.id,
      order:          existingSceneCount + globalIdx,
      title:          row.title,
      status:         "draft",
      sceneDescription: row.description,
      action:           row.description,
      dialogue:         row.dialogue,
      duration:         row.duration       || batch.duration,
      cameraAngle:      (row.cameraAngle   || batch.cameraAngle) as CameraAngle,
      format:           batch.outputFmt,
      sceneConnection:  batch.connMode === "connected" ? (row.connMode === "inherit" ? "continue" : "new") : "new",
      // Outfit: row explicit → connected inherit from prev → batch default
      outfitId:       row.outfitId
        ? row.outfitId
        : isConnected && prevRow?.outfitId ? prevRow.outfitId
        : batch.outfitId || undefined,
      outfitOverride: row.outfitOverride
        ? row.outfitOverride
        : isConnected && prevRow?.outfitOverride ? prevRow.outfitOverride
        : batch.outfitOverride || undefined,
      // Location
      locationId:     row.locationId
        ? row.locationId
        : isConnected && prevRow?.locationId ? prevRow.locationId
        : batch.locationId || undefined,
      props: "", notes: "", customFieldValues: {}, prompts: [], referenceImages: [],
    };
  }

  // ── Prompt preview text for a row ────────────────────────────────────────
  const livePromptFor = useCallback((row: DraftRow, idx: number): string => {
    const prevRow  = idx > 0 ? rows[idx - 1] : undefined;
    const sceneData = resolveRow(row, idx, prevRow);
    const outfit    = charOutfits.find(o => o.id === sceneData.outfitId);
    const loc       = locations.find(l => l.id === sceneData.locationId);
    const fakeScene = {
      ...sceneData, id: "preview", createdAt: "", updatedAt: "",
    } as Scene;
    return buildPrompt(fakeScene, character, outfit, loc, fieldConfigs);
  }, [rows, charOutfits, locations, character, fieldConfigs]);

  // ── Validation ───────────────────────────────────────────────────────────
  function validate(): boolean {
    let ok = true;
    setRows(rs => rs.map(r => {
      if (!r.selected) return r;
      const errs: string[] = [];
      if (!r.title.trim()) { errs.push("title"); ok = false; }
      if (!r.description.trim()) { errs.push("description"); ok = false; }
      return { ...r, errors: errs };
    }));
    return ok;
  }

  // ── Create scenes ─────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!validate()) return;
    setCreating(true);
    const selected = rows.filter(r => r.selected);
    try {
      const created: Scene[] = [];
      let prevRow: DraftRow | undefined;
      for (let i = 0; i < selected.length; i++) {
        const row = selected[i];
        const sc  = await addScene(resolveRow(row, i, prevRow));
        created.push(sc);
        prevRow = row;
      }
      let promptCount = 0;
      if (batch.generatePrompts) {
        for (let i = 0; i < created.length; i++) {
          const sc     = created[i];
          const outfit = charOutfits.find(o => o.id === sc.outfitId);
          const loc    = locations.find(l => l.id === sc.locationId);
          const text   = buildPrompt(sc, character, outfit, loc, fieldConfigs).trim();
          if (text) {
            const p: Prompt = {
              id: uuid(), text,
              label: "Bulk – " + sc.title,
              source: "generated",
              sceneHash: [sc.sceneDescription||"", sc.outfitId||"", sc.locationId||""].join("|"),
              createdAt: new Date().toISOString(),
            };
            await addScenePrompts(sc.id, [p]);
            promptCount++;
          }
        }
      }
      setSummary(
        `${created.length} scene${created.length!==1?"s":""} added` +
        (batch.generatePrompts ? `, ${promptCount} prompt${promptCount!==1?"s":""} built` : "")
      );
      onCreated(created[0]?.id ?? "");
    } finally { setCreating(false); }
  }

  // ── Counts ───────────────────────────────────────────────────────────────
  const selectedCount = rows.filter(r => r.selected).length;
  const hasErrors     = rows.some(r => r.errors.length > 0);
  const sceneCount    = parsed
    ? rows.length
    : pasteText ? parseSceneText(pasteText).scenes.length : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // ── SUCCESS SCREEN ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  if (summary) return (
    <div style={{ padding:28, textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
      <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(82,217,160,0.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Check size={26} style={{ color:"var(--success)" }}/>
      </div>
      <div style={{ fontWeight:700, fontSize:16, color:"var(--text-primary)" }}>Done!</div>
      <div style={{ fontSize:13, color:"var(--text-secondary)" }}>{summary}</div>
      <div style={{ display:"flex", gap:10, marginTop:8 }}>
        <button className="btn btn-secondary" onClick={() => { setSummary(null); setPasteText(""); setParsed(false); setRows([makeEmptyRow(1)]); }}>
          Start another batch
        </button>
        {onClose && <button className="btn btn-primary" onClick={onClose}>Go to scenes</button>}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ── MAIN UI ──────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:1100 }}>

      {/* ── STEP 1: Entry mode tabs ─────────────────────────────────────── */}
      <div className="bsb-section">
        <div className="bsb-section-label">1 — How do you want to add scenes?</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {([
            { key:"paste", icon:<ClipboardPaste size={14}/>, label:"Paste Scenes" },
            { key:"file",  icon:<FileUp size={14}/>,         label:"Import File" },
            { key:"table", icon:<TableProperties size={14}/>,label:"Add Rows" },
          ] as { key: EntryMode; icon: React.ReactNode; label: string }[]).map(m => (
            <button key={m.key}
              className={`bsb-mode-btn${entryMode===m.key?" bsb-mode-btn--on":""}`}
              onClick={() => { setEntryMode(m.key); if (m.key==="table") { setParsed(true); } }}>
              {m.icon}{m.label}
            </button>
          ))}
        </div>

        {/* ── Paste mode ────────────────────────────────────────────────── */}
        {entryMode === "paste" && !parsed && (
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:12 }}>
            <div style={{ fontSize:12, color:"var(--text-muted)", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              <Info size={13} style={{ flexShrink:0 }}/>
              Separate scenes with <code style={{ background:"var(--bg-elevated)", padding:"1px 6px", borderRadius:4, fontSize:11 }}>---</code> on its own line.
              Recognised fields: <code style={{ fontSize:11 }}>Dialogue:</code> <code style={{ fontSize:11 }}>Duration:</code> <code style={{ fontSize:11 }}>Camera:</code>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto", fontSize:11 }} onClick={handleLoadExample}>
                Load example
              </button>
            </div>
            <textarea className="scene-write-box" rows={10}
              style={{ minHeight:220, fontFamily:"\"SF Mono\",\"Fira Code\",monospace", fontSize:12, lineHeight:1.7 }}
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); }}
              placeholder={"Scene 1\nShe enters a flower shop.\nDialogue: \"Today I'm here for a reason.\"\nDuration: 8s\n\n---\n\nScene 2\nShe picks a bouquet and smiles."}
            />
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {pasteText.trim() && (
                <span style={{ fontSize:12, color:"var(--text-muted)" }}>
                  {sceneCount > 0 ? `${sceneCount} scene${sceneCount!==1?"s":""} detected` : "No separator found — will treat as 1 scene"}
                </span>
              )}
              <button className="btn btn-primary" style={{ marginLeft:"auto", minWidth:140, justifyContent:"center" }}
                onClick={handlePreview} disabled={!pasteText.trim()}>
                Preview Scenes →
              </button>
            </div>
          </div>
        )}

        {/* ── File mode ─────────────────────────────────────────────────── */}
        {entryMode === "file" && !parsed && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, marginTop:16, padding:32, border:"2px dashed var(--border)", borderRadius:"var(--radius-md)", cursor:"pointer" }}
            onClick={() => fileRef.current?.click()}>
            <FileUp size={28} style={{ opacity:0.4 }}/>
            <div style={{ fontSize:13, color:"var(--text-secondary)", textAlign:"center" }}>
              Click to select a file<br/>
              <span style={{ fontSize:11, color:"var(--text-muted)" }}>Supported: .txt (--- separated), .csv (header row), .json (array)</span>
            </div>
            <input ref={fileRef} type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json"
              style={{ display:"none" }} onChange={handleFileChange}/>
          </div>
        )}

        {/* If in table mode with no rows yet, show "add first row" hint */}
        {entryMode === "table" && !parsed && (
          <div style={{ marginTop:12 }}>
            <button className="btn btn-secondary" onClick={() => { setRows([makeEmptyRow(1)]); setParsed(true); }}>
              <Plus size={13}/> Start with 1 blank row
            </button>
          </div>
        )}
      </div>

      {/* ── STEP 2: Batch defaults ──────────────────────────────────────── */}
      <div className="bsb-section">
        <div className="bsb-section-label">2 — Apply to all scenes</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:"10px 20px" }}>

          {/* Character — read-only display */}
          <div className="form-group">
            <label className="form-label">Character</label>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", padding:"7px 0" }}>{character.name}</div>
          </div>

          {/* Output format */}
          <div className="form-group">
            <label className="form-label">Output</label>
            <div className="swp-toggle-group" style={{ width:"fit-content" }}>
              {(["image","video"] as OutputFmt[]).map(f => (
                <button key={f} className={`swp-toggle${batch.outputFmt===f?" swp-toggle--on":""}`}
                  onClick={() => setB("outputFmt", f)}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Duration — video only */}
          {batch.outputFmt === "video" && (
            <div className="form-group">
              <label className="form-label">Default duration</label>
              <input className="input" value={batch.duration}
                onChange={e => setB("duration", e.target.value)} placeholder="8s"/>
            </div>
          )}

          {/* Outfit */}
          <div className="form-group">
            <label className="form-label">Outfit (default)</label>
            <select className="select" value={batch.outfitId} onChange={e => setB("outfitId", e.target.value)}>
              <option value="">-- None --</option>
              {charOutfits.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* Custom outfit */}
          <div className="form-group">
            <label className="form-label">Custom outfit</label>
            <input className="input" value={batch.outfitOverride}
              onChange={e => setB("outfitOverride", e.target.value)}
              placeholder="Describe outfit freely…"/>
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label">Location (default)</label>
            <select className="select" value={batch.locationId} onChange={e => setB("locationId", e.target.value)}>
              <option value="">-- None --</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Camera */}
          <div className="form-group">
            <label className="form-label">Camera (default)</label>
            <select className="select" value={batch.cameraAngle} onChange={e => setB("cameraAngle", e.target.value as CameraAngle)}>
              {CAMERA_ANGLES.map(a => <option key={a} value={a}>{a.replace(/-/g," ")}</option>)}
            </select>
          </div>

          {/* Connection */}
          <div className="form-group" style={{ gridColumn:"1/-1" }}>
            <label className="form-label">Scene connection</label>
            <div className="swp-toggle-group" style={{ width:"fit-content" }}>
              {([
                { k:"independent" as ConnMode, label:"Independent scenes" },
                { k:"connected"  as ConnMode,  label:"Connected sequence" },
              ]).map(opt => (
                <button key={opt.k} className={`swp-toggle${batch.connMode===opt.k?" swp-toggle--on":""}`}
                  onClick={() => setB("connMode", opt.k)}>
                  {opt.label}
                </button>
              ))}
            </div>
            {batch.connMode === "connected" && (
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:5 }}>
                Each scene inherits outfit &amp; location from the previous unless changed. Use "New group" per row to break.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STEP 3: Editable preview table ──────────────────────────────── */}
      {parsed && (
        <div className="bsb-section">
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
            <div className="bsb-section-label" style={{ margin:0 }}>3 — Preview & edit scenes</div>
            <span style={{ fontSize:11, color:"var(--text-muted)" }}>{rows.length} row{rows.length!==1?"s":""}, {selectedCount} selected</span>
            <div style={{ flex:1 }}/>
            {/* Toolbar */}
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={applyBatchToSelected} title="Fill empty per-row fields with batch defaults">
              <RefreshCw size={12}/> Apply defaults to selection
            </button>
            {selectedCount >= 2 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={mergeSelected}>
                <Merge size={12}/> Merge selected
              </button>
            )}
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={addEmptyRow}>
              <Plus size={12}/> Add row
            </button>
            {(entryMode === "paste") && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setParsed(false)}>
                ← Edit paste
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  <th style={TH}><input type="checkbox" style={{ accentColor:"var(--accent)" }}
                    checked={rows.every(r=>r.selected)} onChange={toggleAll}/></th>
                  <th style={{...TH, width:20}}/>
                  <th style={{...TH, width:28, textAlign:"center"}}>#</th>
                  <th style={TH}>Title</th>
                  <th style={{...TH, minWidth:180}}>Description excerpt</th>
                  <th style={{...TH, width:70}}>Duration</th>
                  {batch.connMode==="connected" && <th style={{...TH, width:110}}>Continuity</th>}
                  <th style={{...TH, width:70}}>Status</th>
                  <th style={{...TH, width:110}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <React.Fragment key={row.id}>
                    {/* Main compact row */}
                    <tr draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      style={{ background: dragOverIdx===idx ? "var(--accent-dim)" : "transparent",
                        outline: row.errors.length > 0 ? "1px solid var(--error)" : undefined }}>
                      {/* Checkbox */}
                      <td style={{...TD, width:32}}>
                        <input type="checkbox" style={{ accentColor:"var(--accent)" }}
                          checked={row.selected} onChange={() => toggleSel(row.id)}/>
                      </td>
                      {/* Drag */}
                      <td style={{...TD, width:20, cursor:"grab", color:"var(--text-muted)"}}>
                        <GripVertical size={13}/>
                      </td>
                      {/* Number */}
                      <td style={{...TD, textAlign:"center", fontWeight:700, color:"var(--text-muted)"}}>{idx+1}</td>
                      {/* Title */}
                      <td style={TD}>
                        <input style={CI} value={row.title} onChange={e => updateRow(row.id, {title:e.target.value})}/>
                        {row.errors.includes("title") && <span style={ERR}><AlertTriangle size={10}/> Required</span>}
                      </td>
                      {/* Description excerpt */}
                      <td style={TD}>
                        <div style={{ fontSize:11, color:"var(--text-secondary)", overflow:"hidden", textOverflow:"ellipsis",
                          whiteSpace:"nowrap", maxWidth:240, cursor:"pointer" }}
                          onClick={() => updateRow(row.id, {expanded:!row.expanded})}
                          title={row.description}>
                          {row.description || <span style={{ opacity:0.4, fontStyle:"italic" }}>empty</span>}
                        </div>
                        {row.errors.includes("description") && <span style={ERR}><AlertTriangle size={10}/> Required</span>}
                      </td>
                      {/* Duration */}
                      <td style={TD}>
                        <input style={{...CI, width:70}} value={row.duration}
                          onChange={e => updateRow(row.id, {duration:e.target.value})}
                          placeholder={batch.duration}/>
                      </td>
                      {/* Continuity (connected mode) */}
                      {batch.connMode==="connected" && (
                        <td style={TD}>
                          {idx === 0 ? (
                            <span style={{ fontSize:10, color:"var(--accent)", fontWeight:700 }}>START</span>
                          ) : (
                            <select style={{...CS, width:100}} value={row.connMode}
                              onChange={e => updateRow(row.id, {connMode: e.target.value as RowConn})}>
                              <option value="inherit">Continue prev</option>
                              <option value="new-group">New group</option>
                            </select>
                          )}
                        </td>
                      )}
                      {/* Status badge */}
                      <td style={TD}>
                        <span className="status-pill status-draft" style={{ fontSize:9 }}>draft</span>
                      </td>
                      {/* Actions */}
                      <td style={{...TD, whiteSpace:"nowrap"}}>
                        <div style={{ display:"flex", gap:2 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding:"2px 5px" }}
                            title="Expand / edit" onClick={() => updateRow(row.id, {expanded:!row.expanded})}>
                            {row.expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding:"2px 5px" }}
                            title="Preview prompt" onClick={() => setPreviewId(previewId===row.id ? null : row.id)}>
                            <Eye size={12}/>
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding:"2px 5px" }}
                            title="Duplicate" onClick={() => duplicateRow(idx)}>
                            <Copy size={12}/>
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding:"2px 5px", color:"var(--error)" }}
                            title="Remove" onClick={() => removeRow(row.id)} disabled={rows.length===1}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded edit area */}
                    {row.expanded && (
                      <tr key={row.id+"_exp"}>
                        <td colSpan={batch.connMode==="connected" ? 9 : 8} style={{ background:"var(--bg-elevated)", padding:"14px 16px", borderBottom:"1px solid var(--border)" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px 20px", maxWidth:860 }}>
                            <div className="form-group" style={{ gridColumn:"1/-1" }}>
                              <label className="form-label">Description / Action</label>
                              <textarea className="textarea" rows={4} value={row.description}
                                onChange={e => updateRow(row.id, {description:e.target.value})}
                                style={{ fontSize:13 }}
                                placeholder="Describe what happens in this scene…"/>
                              {/* Split at cursor */}
                              <button className="btn btn-ghost btn-sm" style={{ marginTop:4, fontSize:11 }}
                                onClick={() => {
                                  const ta = document.querySelector<HTMLTextAreaElement>(`[data-splitid="${row.id}"]`);
                                  const pos = ta?.selectionStart ?? Math.floor(row.description.length/2);
                                  splitRow(row.id, pos);
                                }}>
                                <Scissors size={11}/> Split at cursor
                              </button>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Dialogue / caption</label>
                              <textarea className="textarea" rows={2} value={row.dialogue}
                                onChange={e => updateRow(row.id, {dialogue:e.target.value})}
                                placeholder="What she says or on-screen text…"/>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Outfit</label>
                              <select className="select" value={row.outfitId}
                                onChange={e => updateRow(row.id, {outfitId:e.target.value, outfitOverride:""})}>
                                <option value="">-- Use batch default --</option>
                                {charOutfits.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                              </select>
                              {!row.outfitId && (
                                <input className="input" style={{ marginTop:6 }} value={row.outfitOverride}
                                  onChange={e => updateRow(row.id, {outfitOverride:e.target.value})}
                                  placeholder="Or describe outfit…"/>
                              )}
                            </div>
                            <div className="form-group">
                              <label className="form-label">Location</label>
                              <select className="select" value={row.locationId}
                                onChange={e => updateRow(row.id, {locationId:e.target.value})}>
                                <option value="">-- Use batch default --</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Camera</label>
                              <select className="select" value={row.cameraAngle}
                                onChange={e => updateRow(row.id, {cameraAngle:e.target.value as CameraAngle})}>
                                <option value="">-- Use batch default --</option>
                                {CAMERA_ANGLES.map(a => <option key={a} value={a}>{a.replace(/-/g," ")}</option>)}
                              </select>
                            </div>
                            {batch.outputFmt==="video" && (
                              <div className="form-group">
                                <label className="form-label">Duration</label>
                                <input className="input" value={row.duration}
                                  onChange={e => updateRow(row.id, {duration:e.target.value})}
                                  placeholder={`Default: ${batch.duration}`}/>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Prompt preview */}
                    {previewId === row.id && (
                      <tr key={row.id+"_prev"}>
                        <td colSpan={batch.connMode==="connected" ? 9 : 8} style={{ background:"var(--bg-input)", padding:"12px 16px", borderBottom:"1px solid var(--border)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                            <Eye size={13} style={{ color:"var(--accent)" }}/>
                            <span style={{ fontSize:11, fontWeight:700, color:"var(--accent)", textTransform:"uppercase", letterSpacing:"0.05em" }}>Prompt preview</span>
                            <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto", fontSize:11 }}
                              onClick={() => navigator.clipboard.writeText(livePromptFor(row, idx))}>
                              <Copy size={11}/> Copy
                            </button>
                          </div>
                          <pre className="ppp-preview" style={{ maxHeight:140 }}>{livePromptFor(row, idx)}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add row button */}
          <button className="btn btn-ghost btn-sm"
            style={{ marginTop:8, width:"100%", justifyContent:"center", border:"1px dashed var(--border)", fontSize:12 }}
            onClick={addEmptyRow}>
            <Plus size={13}/> Add row
          </button>
        </div>
      )}

      {/* ── STEP 4: Generate & create ────────────────────────────────────── */}
      {parsed && (
        <div className="bsb-section" style={{ background:"var(--bg-elevated)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
              <input type="checkbox" style={{ accentColor:"var(--accent)", width:15, height:15 }}
                checked={batch.generatePrompts} onChange={e => setB("generatePrompts", e.target.checked)}/>
              <Zap size={14} style={{ color:"var(--accent)" }}/>
              Build prompts automatically for all scenes
            </label>

            {hasErrors && (
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--error)" }}>
                <AlertTriangle size={14}/> Some rows have errors — fix before creating.
              </div>
            )}

            <div style={{ flex:1 }}/>

            <div style={{ fontSize:12, color:"var(--text-muted)" }}>
              {selectedCount} of {rows.length} selected
            </div>

            <button className="btn btn-primary" style={{ minWidth:180, justifyContent:"center" }}
              onClick={handleCreate} disabled={creating || selectedCount === 0}>
              {creating
                ? <><span className="swp-spinner"/> Creating…</>
                : <><Check size={15}/> Add {selectedCount} Scene{selectedCount!==1?"s":""} to Episode</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding:"6px 8px", textAlign:"left", fontSize:11, fontWeight:700,
  color:"var(--text-muted)", letterSpacing:"0.04em", textTransform:"uppercase",
  borderBottom:"1px solid var(--border)", whiteSpace:"nowrap", background:"var(--bg-elevated)",
};
const TD: React.CSSProperties = {
  padding:"6px 7px", verticalAlign:"top", borderBottom:"1px solid var(--divider)",
};
const CI: React.CSSProperties = {
  width:"100%", minWidth:90, padding:"4px 7px",
  background:"var(--bg-input)", border:"1px solid var(--border)",
  borderRadius:"var(--radius-xs)", color:"var(--text-primary)",
  fontSize:12, fontFamily:"var(--font)", outline:"none",
};
const CS: React.CSSProperties = { ...CI, cursor:"pointer" };
const ERR: React.CSSProperties = {
  display:"inline-flex", alignItems:"center", gap:3,
  color:"var(--error)", fontSize:10, marginTop:2,
};
