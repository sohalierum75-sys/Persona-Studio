import { confirmDelete } from "../../lib/confirm-delete";
import React, { useState } from "react";
import {
  Copy, Check, X, Plus, Sparkles, Pencil, Upload,
  Camera, History, ChevronDown, ChevronRight, Wand2,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { useStudio } from "../../store";
import type {
  Scene, Character, Outfit, Location, FieldConfig, Prompt, PromptSnapshot,
} from "../../types";
import { buildPrompt, buildSceneJSON } from "../../utils/continuity";

interface Props {
  scene: Scene;
  character: Character | null;
  outfit: Outfit | undefined;
  location: Location | undefined;
  fieldConfigs: FieldConfig[];
  onOpenImport: () => void;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function ScenePromptsPanel({
  scene, character, outfit, location, fieldConfigs, onOpenImport,
}: Props) {
  const { addScenePrompts, deleteScenePrompt, updateScene, referenceAssets } = useStudio();

  const [promptFormat, setPromptFormat] = useState<"text" | "json">("text");
  const [copied, setCopied]           = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerLabel, setComposerLabel] = useState("");
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [justExported, setJustExported] = useState(false);

  const prompts = scene.prompts ?? [];
  const snapshot = scene.promptSnapshot;

  // ── Generated (live) prompt from the current scene fields ─────────────────
  function generatedText() {
    return buildPrompt(scene, character!, outfit, location, fieldConfigs);
  }
  function generatedJSON() {
    return JSON.stringify(buildSceneJSON(scene, character, outfit, location, fieldConfigs), null, 2);
  }
  function generated() {
    return promptFormat === "json" ? generatedJSON() : generatedText();
  }

  async function copyText(text: string, mark?: () => void) {
    await navigator.clipboard.writeText(text);
    mark?.();
  }

  // ── Add prompts ────────────────────────────────────────────────────────────
  async function addGeneratedPrompt() {
    const text = generatedText().trim();
    if (!text) return;
    await addScenePrompts(scene.id, [{
      id: uuid(), text,
      label: `Generated ${fmtDate(new Date().toISOString())}`,
      source: "generated" as const, createdAt: new Date().toISOString(),
    }]);
  }

  async function saveComposer() {
    const text = composerText.trim();
    if (!text) return;
    await addScenePrompts(scene.id, [{
      id: uuid(), text,
      label: composerLabel.trim() || undefined,
      source: "manual" as const, createdAt: new Date().toISOString(),
    }]);
    setComposerText("");
    setComposerLabel("");
    setShowComposer(false);
  }

  async function removePrompt(promptId: string) {
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt || !await confirmDelete(prompt.label || "Untitled prompt", "The scene will not be deleted.")) return;
    await deleteScenePrompt(scene.id, promptId);
  }

  // ── Export snapshot (frozen copy of prompts + reference images) ────────────
  async function exportSnapshot() {
    const snap: PromptSnapshot = {
      version: "2",
      sceneTitle: scene.title,
      characterName: character?.name ?? "",
      identityFields: character?.identityFields.map((f) => ({ ...f })) ?? [],
      outfitDescription: outfit
        ? `${outfit.name}: ${outfit.description}`
        : scene.outfitOverride || undefined,
      locationDescription: location
        ? `${location.name} — ${location.setting}`
        : undefined,
      action: scene.action,
      dialogue: scene.dialogue,
      cameraAngle: scene.cameraAngle,
      duration: scene.duration,
      generatedPrompt: generatedText(),
      prompts: prompts.map((p) => ({ ...p })),
      referenceImages: (scene.referenceImages ?? [])
        .map((img) => {
          const asset = referenceAssets.find((a) => a.id === img.assetId);
          return asset
            ? { id: img.id, dataUrl: asset.dataUrl, caption: img.caption, addedAt: img.addedAt }
            : null;
        })
        .filter((i): i is NonNullable<typeof i> => i !== null),
      exportedAt: new Date().toISOString(),
    };
    await updateScene(scene.id, { promptSnapshot: snap });
    setShowSnapshot(true);
    setJustExported(true);
    setTimeout(() => setJustExported(false), 2000);
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {/* ── Generated prompt (live preview) ─────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
        <h3 style={{ margin: 0 }}>Prompt Preview</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", padding: 3, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            {(["text", "json"] as const).map((f) => (
              <button key={f} onClick={() => setPromptFormat(f)} style={{
                padding: "4px 14px", fontSize: 12, fontWeight: 700,
                border: "none", cursor: "pointer", borderRadius: "calc(var(--radius-sm) - 3px)",
                background: promptFormat === f ? "var(--accent)" : "transparent",
                color: promptFormat === f ? "#fff" : "var(--text-muted)",
                transition: "all var(--t-fast)",
              }}>{f === "text" ? "Text" : "JSON"}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() =>
            copyText(generated(), () => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
          }>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : promptFormat === "json" ? "Copy JSON" : "Copy Prompt"}
          </button>
        </div>
      </div>
      {promptFormat === "text" ? (
        <div className="prompt-preview">{generated()}</div>
      ) : (
        <pre style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "14px 16px", fontFamily: "'Fira Code','JetBrains Mono',monospace", fontSize: 12, lineHeight: 1.65, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 200, overflowY: "auto" }}>
          {generated()}
        </pre>
      )}

      {/* ── Prompts list ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "28px 0 12px", gap: 12 }}>
        <h3 style={{ margin: 0 }}>
          Saved Prompts
          <span className="chip" style={{ marginLeft: 8 }}>{prompts.length}</span>
        </h3>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={onOpenImport}>
          <Upload size={13} /> Import
        </button>
      </div>

      {/* Add-prompt actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={addGeneratedPrompt} disabled={!generatedText().trim()}>
          <Sparkles size={13} /> Generate from scene
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowComposer((v) => !v)}>
          <Pencil size={13} /> {showComposer ? "Cancel" : "Write manually"}
        </button>
      </div>

      {/* Manual composer */}
      {showComposer && (
        <div style={{ padding: 14, background: "var(--bg-elevated)", border: "1px solid var(--border-accent)", borderRadius: "var(--radius-md)", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="input" value={composerLabel}
            onChange={(e) => setComposerLabel(e.target.value)}
            placeholder="Label (optional) — e.g. V2, tighter framing" />
          <textarea className="textarea" value={composerText} rows={5}
            onChange={(e) => setComposerText(e.target.value)}
            onPaste={(e) => e.stopPropagation()}
            placeholder="Type or paste the prompt text…" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setComposerText(generated())}
              disabled={!generatedText().trim()} title="Insert the prompt generated from the current scene fields">
              <Wand2 size={13} /> Insert generated
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveComposer} disabled={!composerText.trim()}>
              <Plus size={13} /> Add Prompt
            </button>
          </div>
        </div>
      )}

      {/* The list */}
      {prompts.length === 0 ? (
        <div style={{ padding: "18px 16px", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
          No prompts saved yet. Generate one from the scene fields, write one manually, or import a batch.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prompts.map((p, i) => (
            <PromptRow
              key={p.id}
              index={i}
              prompt={p}
              copied={copiedPromptId === p.id}
              onCopy={() => copyText(p.text, () => {
                setCopiedPromptId(p.id);
                setTimeout(() => setCopiedPromptId(null), 2000);
              })}
              onDelete={() => removePrompt(p.id)}
            />
          ))}
        </div>
      )}

      {/* ── Export snapshot ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "28px 0 12px", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Export</h3>
        <button className="btn btn-primary btn-sm" onClick={exportSnapshot}>
          {justExported ? <Check size={14} /> : <Camera size={14} />}
          {justExported ? "Snapshot saved" : "Export Scene"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
        Exporting freezes a snapshot of this scene&apos;s prompts and reference images at this moment.
        Later edits or deletions never change a saved snapshot.
      </p>

      {snapshot && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <button type="button" className="hidden-fields-chip" style={{ marginBottom: showSnapshot ? 12 : 0 }}
            onClick={() => setShowSnapshot((v) => !v)}>
            {showSnapshot ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <History size={11} />
            Snapshot — exported {fmtDate(snapshot.exportedAt)}
          </button>
          {showSnapshot && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {snapshot.prompts && snapshot.prompts.length > 0 ? (
                snapshot.prompts.map((p, i) => (
                  <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>#{i + 1}</span>
                      {p.label && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)" }}>{p.label}</span>}
                      <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{fmtDate(p.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 84, overflowY: "auto", lineHeight: 1.55 }}>
                      {p.text}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No prompts were saved at export time.</div>
              )}
              {snapshot.referenceImages && snapshot.referenceImages.length > 0 && (
                <div className="scene-ref-strip">
                  {snapshot.referenceImages.map((img) => (
                    <img loading="lazy" decoding="async" key={img.id} src={img.dataUrl} alt={img.caption ?? "Snapshot reference"}
                      title={img.caption} className="scene-ref-thumb-snap" />
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Frozen generated prompt:
                <div className="prompt-preview" style={{ marginTop: 6, maxHeight: 96 }}>{snapshot.generatedPrompt}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── One saved prompt row ─────────────────────────────────────────────────────
function PromptRow({
  index, prompt, copied, onCopy, onDelete,
}: {
  index: number;
  prompt: Prompt;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="prompt-row">
      <div className="prompt-row-header">
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 24 }}>
          #{index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
          {prompt.label && (
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)" }}>
              {prompt.label}
            </span>
          )}
          <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {fmtDate(prompt.createdAt)}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={onCopy} title="Copy this prompt">
          {copied ? <Check size={12} style={{ color: "var(--success)" }} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: "2px 6px", color: "var(--text-muted)" }}
          onClick={onDelete} title="Delete this prompt" aria-label={`Delete prompt ${index + 1}`}>
          <X size={13} />
        </button>
      </div>
      <div
        className={`prompt-row-text${expanded ? " expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Click to collapse" : "Click to expand"}
      >
        {prompt.text}
      </div>
    </div>
  );
}
