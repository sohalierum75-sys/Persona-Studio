import { PlanLimitError } from "../../lib/plan-guard";
import React, { useState, useEffect, useRef } from "react";
import { X, Upload, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Scene, Prompt } from "../../types";
import { parsePrompts } from "../../utils/promptParser";

interface Props {
  scenes: Scene[];
  defaultSceneId: string | null;
  onImport: (sceneId: string, prompts: Prompt[]) => Promise<void>;
  onClose: () => void;
}

const PREVIEW_COUNT = 4;

export default function ImportPromptsModal({ scenes, defaultSceneId, onImport, onClose }: Props) {
  const [raw, setRaw]             = useState("");
  const [sceneId, setSceneId]     = useState(defaultSceneId ?? scenes[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [done, setDone]           = useState<number | null>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => { if (defaultSceneId) setSceneId(defaultSceneId); }, [defaultSceneId]);

  const parseResult = raw.trim() ? parsePrompts(raw) : null;
  const prompts     = parseResult?.ok ? parseResult.prompts : [];
  const parseError  = parseResult && !parseResult.ok ? parseResult.error : null;
  const targetScene = scenes.find((s) => s.id === sceneId);

  async function handleImport() {
    if (!parseResult?.ok || !sceneId || importing) return;
    setImporting(true);
    const now = new Date().toISOString();
    const toAdd: Prompt[] = parseResult.prompts.map((p) => ({
      id: uuid(), text: p.text, label: p.label, source: "imported", createdAt: now,
    }));
    try {
      await onImport(sceneId, toAdd);
      setDone(toAdd.length);
    } catch (error) { if (!(error instanceof PlanLimitError)) window.alert(error instanceof Error ? error.message : "Import failed"); }
    finally { setImporting(false); }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import prompts"
        style={{ maxWidth: 580, width: "calc(100vw - 32px)", padding: 24, display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <Upload size={18} style={{ color: "var(--accent)" }} />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Import Prompts</h2>
          </div>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Close"
            style={{ color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {done !== null ? (
          /* Success */
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircle2 size={44} style={{ color: "var(--success)", marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              {done} prompt{done !== 1 ? "s" : ""} added
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
              to <strong style={{ color: "var(--text-primary)" }}>
                {targetScene?.title ?? "the selected scene"}
              </strong>
            </div>
            <button className="btn btn-secondary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            {/* Paste area */}
            <div className="form-group" style={{ marginBottom: 4 }}>
              <label className="form-label" htmlFor="import-raw">Paste prompts</label>
              <textarea id="import-raw" ref={textareaRef} className="textarea"
                value={raw} onChange={(e) => setRaw(e.target.value)}
                placeholder="Paste your prompts here…" rows={9}
                style={{ fontFamily: "inherit", resize: "vertical" }} />
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
              One block per prompt, separated by a blank line or <code style={{ background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>---</code>,
              {" "}or paste a JSON array of strings / <code style={{ background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>{`[{"text":"…","label":"…"}]`}</code>.
            </p>

            {/* Parse error */}
            {parseError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: "var(--error-bg)", border: "1px solid rgba(255,90,90,0.25)",
                borderRadius: "var(--radius-sm)", marginBottom: 16, fontSize: 13, color: "var(--error)" }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {parseError}
              </div>
            )}

            {/* Preview */}
            {prompts.length > 0 && (
              <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                    {prompts.length} prompt{prompts.length !== 1 ? "s" : ""} detected
                  </span>
                  <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    will be added to{" "}
                    <strong style={{ color: "var(--accent)" }}>{targetScene?.title ?? "—"}</strong>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {prompts.slice(0, PREVIEW_COUNT).map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 20, paddingTop: 1 }}>
                        {i + 1}.
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {p.label && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.05em", color: "var(--accent)", marginRight: 6 }}>
                            {p.label}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {p.text.length > 120 ? p.text.slice(0, 120) + "\u2026" : p.text}
                        </span>
                      </div>
                    </div>
                  ))}
                  {prompts.length > PREVIEW_COUNT && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", paddingLeft: 28 }}>
                      + {prompts.length - PREVIEW_COUNT} more…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Scene selector */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" htmlFor="import-scene">Add to scene</label>
              <select id="import-scene" className="select" value={sceneId}
                onChange={(e) => setSceneId(e.target.value)}>
                {scenes.map((s, i) => (
                  <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>
                ))}
              </select>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleImport}
                disabled={!parseResult?.ok || prompts.length === 0 || !sceneId || importing}>
                <Upload size={14} />
                {importing
                  ? "Importing\u2026"
                  : `Import${prompts.length > 0 ? " " + prompts.length : ""} Prompt${prompts.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
