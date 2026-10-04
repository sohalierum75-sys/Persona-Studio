import { confirmDelete } from "../../lib/confirm-delete";
import React, { useRef, useState } from "react";
import {
  Plus, Trash2, Copy, GripVertical, AlertTriangle,
  Check, ClipboardList, FileUp,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { useStudio } from "../../store";
import { PlanLimitError } from "../../lib/plan-guard";
import type { Scene, Character, Outfit, Location, FieldConfig, CameraAngle } from "../../types";
import { buildPrompt } from "../../utils/continuity";

type SharingMode = "shared" | "per-scene";

const VARYING_CANDIDATES: Array<{ key: string; label: string }> = [
  { key: "title",          label: "Scene title"        },
  { key: "status",         label: "Status"              },
  { key: "duration",       label: "Duration"            },
  { key: "outfit",         label: "Outfit"              },
  { key: "outfitOverride", label: "Outfit description"  },
  { key: "location",       label: "Location"            },
  { key: "action",         label: "Action"              },
  { key: "dialogue",       label: "Dialogue / caption"  },
  { key: "cameraAngle",    label: "Camera"              },
];

interface BulkRow {
  id: string;
  title: string;
  status: Scene["status"];
  duration: string;
  outfitId: string;
  outfitOverride: string;
  locationId: string;
  action: string;
  dialogue: string;
  cameraAngle: CameraAngle;
  errors: string[];
}

interface SharedValues {
  status: Scene["status"];
  outfitId: string;
  outfitOverride: string;
  locationId: string;
  cameraAngle: CameraAngle;
  duration: string;
}

interface Props {
  episode: { id: string; characterId: string; title: string };
  character: Character;
  charOutfits: Outfit[];
  locations: Location[];
  fieldConfigs: FieldConfig[];
  existingSceneCount: number;
  onCreated: (firstNewSceneId: string) => void;
}

const CAMERA_ANGLES: CameraAngle[] = [
  "selfie","close-up","medium-shot","wide-shot",
  "overhead","low-angle","over-shoulder","pov","cinematic",
];

const DEFAULT_SHARED: SharedValues = {
  status: "draft", outfitId: "", outfitOverride: "",
  locationId: "", cameraAngle: "medium-shot", duration: "",
};

function makeRow(n: number, shared: SharedValues): BulkRow {
  return {
    id: uuid(), title: "Scene " + n,
    status: shared.status, duration: shared.duration,
    outfitId: shared.outfitId, outfitOverride: shared.outfitOverride,
    locationId: shared.locationId, action: "", dialogue: "",
    cameraAngle: shared.cameraAngle, errors: [],
  };
}

let _dragRowSrc: number | null = null;

export default function BulkAddPanel({
  episode, character, charOutfits, locations, fieldConfigs, existingSceneCount, onCreated,
}: Props) {
  const { addScenes } = useStudio();

  const [shared, setShared] = useState<SharedValues>(DEFAULT_SHARED);
  const [sharing, setSharing] = useState<Record<string, SharingMode>>({
    title: "per-scene", status: "shared", duration: "per-scene",
    outfit: "shared", outfitOverride: "shared", location: "shared",
    action: "per-scene", dialogue: "per-scene", cameraAngle: "shared",
  });
  const [rows, setRows] = useState<BulkRow[]>([makeRow(existingSceneCount + 1, DEFAULT_SHARED)]);
  const [generatePrompts, setGeneratePrompts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const perSceneFields = VARYING_CANDIDATES.filter((c) => sharing[c.key] === "per-scene");

  function setSharedField<K extends keyof SharedValues>(key: K, val: SharedValues[K]) {
    setShared((s) => ({ ...s, [key]: val }));
  }

  function toggleSharing(fieldKey: string) {
    setSharing((s) => ({ ...s, [fieldKey]: s[fieldKey] === "shared" ? "per-scene" : "shared" }));
  }

  function updateRow(id: string, updates: Partial<BulkRow>) {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...updates, errors: [] } : r));
  }

  function addRow() {
    setRows((rs) => [...rs, makeRow(existingSceneCount + rs.length + 1, shared)]);
  }

  function duplicateRow(idx: number) {
    setRows((rs) => {
      const copy = { ...rs[idx], id: uuid(), errors: [] };
      const next = [...rs];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  async function deleteRow(id: string) {
    const row = rows.find(r => r.id === id);
    if (!row || !await confirmDelete(row.title || "Untitled scene row")) return;
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function autoNumberTitles(rs: BulkRow[]): BulkRow[] {
    let n = existingSceneCount + 1;
    return rs.map((r) => {
      const isDefault = /^Scene \d+$/.test(r.title);
      const out = isDefault ? { ...r, title: "Scene " + n } : r;
      n++;
      return out;
    });
  }

  function applyPaste() {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const newRows: BulkRow[] = lines.map((line, i) => {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      const base = makeRow(existingSceneCount + i + 1, shared);
      perSceneFields.forEach((f, fi) => {
        const val = parts[fi] ?? "";
        const rKey = f.key === "outfit" ? "outfitId" : f.key;
        (base as unknown as Record<string, unknown>)[rKey] = val;
      });
      return base;
    });
    setRows(autoNumberTitles(newRows));
    setPasteText(""); setPasteOpen(false);
  }

  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const allLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (allLines.length < 2) return;
      const headerLine = allLines[0];
      const dataLines = allLines.slice(1);
      const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
      const fieldMap: Record<string, string> = {
        "scene title": "title", title: "title", status: "status", duration: "duration",
        outfit: "outfitId", "outfit description": "outfitOverride", outfitoverride: "outfitOverride",
        location: "locationId", action: "action", dialogue: "dialogue", caption: "dialogue",
        camera: "cameraAngle", "camera angle": "cameraAngle",
      };
      const newRows: BulkRow[] = dataLines.map((line, i) => {
        const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const base = makeRow(existingSceneCount + i + 1, shared);
        headers.forEach((h, hi) => {
          const rowKey = fieldMap[h];
          if (rowKey && values[hi]) (base as unknown as Record<string, unknown>)[rowKey] = values[hi];
        });
        return base;
      });
      setRows(autoNumberTitles(newRows));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleRowDragStart(idx: number) { _dragRowSrc = idx; }
  function handleRowDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (_dragRowSrc === null || _dragRowSrc === idx) return;
    setDragOverIdx(idx);
    setRows((rs) => {
      const arr = [...rs];
      const [moved] = arr.splice(_dragRowSrc!, 1);
      arr.splice(idx, 0, moved);
      _dragRowSrc = idx;
      return arr;
    });
  }
  function handleRowDragEnd() { setDragOverIdx(null); _dragRowSrc = null; }

  function validate(): boolean {
    let ok = true;
    setRows((rs) => rs.map((r) => {
      const errs: string[] = [];
      if (!r.title.trim()) { errs.push("title"); ok = false; }
      return { ...r, errors: errs };
    }));
    return ok;
  }

  function resolveRow(r: BulkRow, idx: number): Omit<Scene, "id" | "createdAt" | "updatedAt"> {
    const s = sharing;
    return {
      episodeId: episode.id,
      order: existingSceneCount + idx,
      title: r.title,
      status:         s["status"]        === "shared" ? shared.status        : r.status,
      duration:       s["duration"]      === "shared" ? shared.duration      : r.duration,
      outfitId:       s["outfit"]        === "shared" ? (shared.outfitId || undefined) : (r.outfitId || undefined),
      outfitOverride: s["outfitOverride"]=== "shared" ? (shared.outfitOverride || undefined) : (r.outfitOverride || undefined),
      locationId:     s["location"]      === "shared" ? (shared.locationId || undefined) : (r.locationId || undefined),
      action:         s["action"]        === "shared" ? "" : r.action,
      dialogue:       s["dialogue"]      === "shared" ? "" : r.dialogue,
      cameraAngle:    s["cameraAngle"]   === "shared" ? shared.cameraAngle : r.cameraAngle,
      props: "", notes: "", customFieldValues: {}, prompts: [], referenceImages: [],
    };
  }

  async function handleCreate() {
    if (creating || !validate()) return;
    setCreating(true);
    try {
      const bulkImportId = uuid();
      const created: Scene[] = [];
      for (let i = 0; i < rows.length; i++) {
        const sc: Scene = { ...resolveRow(rows[i], i), bulkImportId, id:uuid(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
        created.push(sc);
      }
      let promptCount = 0;
      if (generatePrompts) {
        for (const sc of created) {
          const outfit   = charOutfits.find((o) => o.id === sc.outfitId);
          const location = locations.find((l)  => l.id === sc.locationId);
          const text = buildPrompt(sc, character, outfit, location, fieldConfigs).trim();
          if (text) {
            (sc.prompts ??= []).push({
              id: uuid(), text,
              label: "Bulk \u2013 " + sc.title,
              source: "imported" as const, createdAt: new Date().toISOString(),
            });
            promptCount++;
          }
        }
      }
      await addScenes(created);
      setSummary(
        created.length + " scene" + (created.length !== 1 ? "s" : "") + " created" +
        (generatePrompts ? ", " + promptCount + " prompt" + (promptCount !== 1 ? "s" : "") + " generated" : "")
      );
      onCreated(created[0]?.id ?? "");
    } catch (error) { if (!(error instanceof PlanLimitError)) window.alert(error instanceof Error ? error.message : "Import failed"); }
    finally { setCreating(false); }
  }

  if (summary) {
    return (
      <div style={{ background:"var(--success-bg)", border:"1px solid rgba(82,217,160,0.35)", borderRadius:"var(--radius-md)", padding:"20px 24px", display:"flex", alignItems:"center", gap:16 }}>
        <Check size={22} style={{ color:"var(--success)", flexShrink:0 }} />
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:"var(--success)" }}>Done!</div>
          <div style={{ fontSize:13, color:"var(--text-secondary)", marginTop:2 }}>{summary}</div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }}
          onClick={() => { setSummary(null); setRows([makeRow(existingSceneCount + 1, shared)]); }}>
          New batch
        </button>
      </div>
    );
  }

  const hasErrors = rows.some((r) => r.errors.length > 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:960 }}>

      <div className="card" style={{ padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:14 }}>
          Shared Fields &amp; Modes
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:"12px 24px" }}>
          {VARYING_CANDIDATES.map((cand) => {
            const isShared = sharing[cand.key] === "shared";
            return (
              <div key={cand.key} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)", flex:1 }}>{cand.label}</span>
                  <SharingToggle mode={sharing[cand.key]} onToggle={() => toggleSharing(cand.key)} />
                </div>
                <div style={{ opacity: isShared ? 1 : 0.35, pointerEvents: isShared ? "auto" : "none", transition:"opacity var(--t-fast)" }}>
                  {renderSharedInput(cand.key, shared, setSharedField, charOutfits, locations)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.06em", textTransform:"uppercase", flex:1 }}>
            Per-scene rows ({rows.length})
          </span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setPasteOpen((v) => !v)}>
            <ClipboardList size={13} /> Paste lines
          </button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => fileRef.current?.click()}>
            <FileUp size={13} /> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:"none" }} onChange={handleCSV} />
        </div>

        {pasteOpen && (
          <div style={{ marginBottom:14, padding:12, background:"var(--bg-elevated)", border:"1px solid var(--border-accent)", borderRadius:"var(--radius-sm)", display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:12, color:"var(--text-muted)" }}>
              One line = one scene. Use Tab or comma to separate multiple columns (matching per-scene fields left-to-right).
            </div>
            <textarea className="textarea" rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder={"She dances in the rain\nShe sips coffee at the window\nShe reads under a tree"} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPasteOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={applyPaste} disabled={!pasteText.trim()}>
                Apply ({pasteText.split("\n").filter((l) => l.trim()).length} lines)
              </button>
            </div>
          </div>
        )}

        {perSceneFields.length === 0 ? (
          <div style={{ padding:"12px 16px", background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)", fontSize:12, color:"var(--text-muted)" }}>
            All fields are <strong>Same for all</strong>. Toggle at least one field to <strong>Per scene</strong> to see the table.
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  <th style={TH}></th>
                  <th style={{ ...TH, width:28, textAlign:"center" }}>#</th>
                  {perSceneFields.map((f) => <th key={f.key} style={TH}>{f.label}</th>)}
                  <th style={{ ...TH, width:68 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} draggable
                    onDragStart={() => handleRowDragStart(idx)}
                    onDragOver={(e) => handleRowDragOver(e, idx)}
                    onDragEnd={handleRowDragEnd}
                    style={{ background: dragOverIdx === idx ? "var(--accent-dim)" : "transparent", transition:"background var(--t-fast)" }}>
                    <td style={{ ...TD, width:20, cursor:"grab", color:"var(--text-muted)" }}><GripVertical size={13} /></td>
                    <td style={{ ...TD, textAlign:"center", color:"var(--text-muted)", fontWeight:700 }}>{idx + 1}</td>
                    {perSceneFields.map((f) => (
                      <td key={f.key} style={TD}>
                        {renderRowCell(f.key, row, (u) => updateRow(row.id, u), charOutfits, locations)}
                        {row.errors.includes(f.key) && (
                          <div style={{ color:"var(--error)", fontSize:10, marginTop:2, display:"flex", alignItems:"center", gap:3 }}>
                            <AlertTriangle size={10} /> Required
                          </div>
                        )}
                      </td>
                    ))}
                    <td style={{ ...TD, whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding:"2px 5px" }} onClick={() => duplicateRow(idx)} title="Duplicate row"><Copy size={12} /></button>
                        <button className="btn btn-ghost btn-sm" style={{ padding:"2px 5px", color:"var(--error)" }}
                          onClick={() => deleteRow(row.id)} disabled={rows.length === 1} title="Delete row"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button className="btn btn-ghost btn-sm"
          style={{ marginTop:10, width:"100%", justifyContent:"center", border:"1px dashed var(--border)", fontSize:12 }}
          onClick={addRow}>
          <Plus size={13} /> Add row
        </button>
      </div>

      {hasErrors && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--error-bg)", border:"1px solid rgba(255,107,107,0.35)", borderRadius:"var(--radius-sm)", fontSize:13, color:"var(--error)" }}>
          <AlertTriangle size={16} /> Some rows have missing required data. Fix them before creating.
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
          <input type="checkbox" checked={generatePrompts} onChange={(e) => setGeneratePrompts(e.target.checked)}
            style={{ accentColor:"var(--accent)", width:15, height:15 }} />
          Also generate prompts for all scenes
        </label>
        <button className="btn btn-primary" style={{ marginLeft:"auto", minWidth:160, justifyContent:"center" }}
          onClick={handleCreate} disabled={creating || rows.length === 0}>
          {creating
            ? <span style={{ opacity:0.7 }}>Creating\u2026</span>
            : <><Check size={15} /> Create {rows.length} Scene{rows.length !== 1 ? "s" : ""}</>}
        </button>
      </div>
    </div>
  );
}

function SharingToggle({ mode, onToggle }: { mode: SharingMode; onToggle: () => void }) {
  const isShared = mode === "shared";
  return (
    <button type="button" onClick={onToggle}
      title={isShared ? "Make different per scene" : "Use same value for all scenes"}
      style={{ fontSize:10, fontWeight:700, padding:"2px 8px", border:"none", borderRadius:"var(--radius-full)", cursor:"pointer",
        background: isShared ? "var(--accent-dim)" : "var(--bg-elevated)",
        color: isShared ? "var(--text-accent)" : "var(--text-muted)",
        outline: isShared ? "1px solid var(--border-accent)" : "1px solid var(--border)",
        whiteSpace:"nowrap", transition:"all var(--t-fast)" }}>
      {isShared ? "Same for all" : "Per scene"}
    </button>
  );
}

function renderSharedInput(
  key: string, shared: SharedValues,
  setField: <K extends keyof SharedValues>(k: K, v: SharedValues[K]) => void,
  charOutfits: Outfit[], locations: Location[],
): React.ReactNode {
  switch (key) {
    case "status": return (
      <select className="select" value={shared.status} onChange={(e) => setField("status", e.target.value as Scene["status"])}>
        <option value="draft">Draft</option><option value="ready">Ready</option><option value="used">Used</option>
      </select>
    );
    case "duration": return <input className="input" value={shared.duration} onChange={(e) => setField("duration", e.target.value)} placeholder="e.g. 30s" />;
    case "outfit": return (
      <select className="select" value={shared.outfitId} onChange={(e) => setField("outfitId", e.target.value)}>
        <option value="">-- None / use description --</option>
        {charOutfits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    );
    case "outfitOverride": return <input className="input" value={shared.outfitOverride} onChange={(e) => setField("outfitOverride", e.target.value)} placeholder="Describe outfit freely..." />;
    case "location": return (
      <select className="select" value={shared.locationId} onChange={(e) => setField("locationId", e.target.value)}>
        <option value="">-- None --</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    );
    case "cameraAngle": return (
      <select className="select" value={shared.cameraAngle} onChange={(e) => setField("cameraAngle", e.target.value as CameraAngle)}>
        {CAMERA_ANGLES.map((a) => <option key={a} value={a}>{a.replace(/-/g, " ")}</option>)}
      </select>
    );
    case "action":   return <div style={{ fontSize:12, color:"var(--text-muted)", padding:"6px 0" }}>Set per scene in table</div>;
    case "dialogue": return <div style={{ fontSize:12, color:"var(--text-muted)", padding:"6px 0" }}>Set per scene in table</div>;
    case "title":    return <div style={{ fontSize:12, color:"var(--text-muted)", padding:"6px 0" }}>Auto-numbered in table</div>;
    default: return null;
  }
}

const CI: React.CSSProperties = { width:"100%", minWidth:90, padding:"5px 8px", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-xs)", color:"var(--text-primary)", fontSize:12, fontFamily:"var(--font)", outline:"none" };
const CS: React.CSSProperties = { ...CI, cursor:"pointer" };
const CT: React.CSSProperties = { ...CI, minWidth:150, resize:"vertical" as React.CSSProperties["resize"] };

function renderRowCell(key: string, row: BulkRow, update: (u: Partial<BulkRow>) => void, charOutfits: Outfit[], locations: Location[]): React.ReactNode {
  switch (key) {
    case "title":    return <input style={CI} value={row.title} onChange={(e) => update({ title: e.target.value })} />;
    case "status":   return <select style={CS} value={row.status} onChange={(e) => update({ status: e.target.value as Scene["status"] })}><option value="draft">Draft</option><option value="ready">Ready</option><option value="used">Used</option></select>;
    case "duration": return <input style={CI} value={row.duration} onChange={(e) => update({ duration: e.target.value })} placeholder="30s" />;
    case "outfit":   return <select style={CS} value={row.outfitId} onChange={(e) => update({ outfitId: e.target.value })}><option value="">-- None --</option>{charOutfits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
    case "outfitOverride": return <input style={CI} value={row.outfitOverride} onChange={(e) => update({ outfitOverride: e.target.value })} />;
    case "location": return <select style={CS} value={row.locationId} onChange={(e) => update({ locationId: e.target.value })}><option value="">-- None --</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>;
    case "action":   return <textarea style={CT} rows={2} value={row.action} onChange={(e) => update({ action: e.target.value })} />;
    case "dialogue": return <textarea style={CT} rows={2} value={row.dialogue} onChange={(e) => update({ dialogue: e.target.value })} />;
    case "cameraAngle": return <select style={CS} value={row.cameraAngle} onChange={(e) => update({ cameraAngle: e.target.value as CameraAngle })}>{CAMERA_ANGLES.map((a) => <option key={a} value={a}>{a.replace(/-/g, " ")}</option>)}</select>;
    default: return null;
  }
}

const TH: React.CSSProperties = { padding:"6px 8px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.04em", textTransform:"uppercase", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" };
const TD: React.CSSProperties = { padding:"5px 6px", verticalAlign:"top", borderBottom:"1px solid var(--divider)" };
