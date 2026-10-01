import React, { useEffect, useState } from "react";
import { ExternalLink, Copy, Check, User, ChevronRight, AlertTriangle } from "lucide-react";
import { useStudio } from "../../store";
import { formatEnginePrompt, readSavedEngine } from "../../utils/promptFormatter";
import type { Scene } from "../../types";
import AuthGate from "../auth/AuthGate";
import SyncStatus from "../auth/SyncStatus";
import AccountMenu from "../auth/AccountMenu";
import Brand from "../ui/Brand";

/** Clipboard write with execCommand fallback for non-secure contexts. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export default function SidePanel() {
  return (
    <AuthGate>
      <SidePanelInner />
    </AuthGate>
  );
}

function SidePanelInner() {
  const {
    loadAll, isLoaded, characters, episodes, scenes,
    outfits, locations, settings, referenceAssets,
    activeCharacterId, activeEpisodeId, activeSceneId,
    setActiveCharacter, setActiveEpisode, setActiveScene,
    continuityWarnings, runContinuityCheck,
  } = useStudio();

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.documentElement.setAttribute(
      "data-reduced-motion", settings.reducedMotion ? "true" : "false"
    );
  }, [settings]);

  const activeCharacter = characters.find((c) => c.id === activeCharacterId);
  const characterEpisodes = episodes.filter((e) => e.characterId === activeCharacterId);
  const activeEpisode = characterEpisodes.find((e) => e.id === activeEpisodeId);
  const episodeScenes = scenes
    .filter((s) => s.episodeId === activeEpisodeId)
    .sort((a, b) => a.order - b.order);
  const activeScene = episodeScenes.find((s) => s.id === activeSceneId);
  const activeOutfit = outfits.find((o) => o.id === activeScene?.outfitId);
  const activeLocation = locations.find((l) => l.id === activeScene?.locationId);
  const warnings = continuityWarnings.filter((w) => !w.resolved);

  // Character reference image — reuses the store's authenticated asset loading.
  const portraitAsset = (() => {
    if (!activeCharacter) return null;
    const ids = [activeCharacter.portraitAssetId, ...(activeCharacter.referenceAssetIds ?? [])];
    for (const id of ids) {
      const asset = referenceAssets.find((a) => a.id === id);
      if (asset) return asset;
    }
    return null;
  })();

  function openStudio() {
    // In extension context, open the studio in a new tab
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
    } else {
      // Dev fallback: open in a new window/tab
      window.open("/", "_blank");
    }
  }

  // Engine-formatted prompt — same formatter and remembered engine as the studio prompt tab.
  function getPrompt() {
    if (!activeScene || !activeCharacter) return "";
    return formatEnginePrompt(readSavedEngine(), {
      scene: activeScene, character: activeCharacter,
      outfit: activeOutfit, location: activeLocation,
    });
  }

  async function copyPrompt() {
    const prompt = getPrompt();
    if (!prompt) return;
    const ok = await copyToClipboard(prompt);
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  // Copy on click/Enter/Space — never while text is selected or a control is used.
  function handlePromptBoxClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button, input, textarea, select, a, label")) return;
    if (window.getSelection()?.toString()) return;
    void copyPrompt();
  }
  function handlePromptBoxKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    void copyPrompt();
  }

  if (!isLoaded) {
    return (
      <div className="sidepanel-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="sidepanel-root">
      {/* Header */}
      <div className="sidepanel-header">
        <div className="sidepanel-brand"><Brand /></div>
        <SyncStatus />
        <button
          className="btn btn-ghost btn-sm"
          onClick={openStudio}
          title="Open full Studio"
          aria-label="Open full Studio"
        >
          <ExternalLink size={14} /> <span className="sidepanel-studio-label">Studio</span>
        </button>
        <AccountMenu />
      </div>

      {/* Body */}
      <div className="sidepanel-body">
        {characters.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px 0" }}>
            <div style={{ fontSize: 32 }}>✦</div>
            <p>No characters yet. Open the full Studio to get started.</p>
            <button className="btn btn-primary" onClick={openStudio}>
              Open Studio
            </button>
          </div>
        ) : (
          <>
            {/* Step 1: Character */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                1 — Character
              </div>
              <select
                className="select"
                value={activeCharacterId ?? ""}
                onChange={(e) => {
                  setActiveCharacter(e.target.value || null);
                  setActiveEpisode(null);
                  setActiveScene(null);
                }}
                aria-label="Select character"
              >
                <option value="">— Select character —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Step 2: Episode */}
            {activeCharacterId && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  2 — Episode
                </div>
                {characterEpisodes.length === 0 ? (
                  <p className="text-sm text-muted">No episodes yet. Open the Studio to create one.</p>
                ) : (
                  <select
                    className="select"
                    value={activeEpisodeId ?? ""}
                    onChange={(e) => {
                      setActiveEpisode(e.target.value || null);
                      setActiveScene(null);
                    }}
                    aria-label="Select episode"
                  >
                    <option value="">— Select episode —</option>
                    {characterEpisodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>{ep.title}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Step 3: Scene */}
            {activeEpisodeId && episodeScenes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  3 — Scene
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {episodeScenes.map((sc, i) => (
                    <button
                      key={sc.id}
                      className={`btn btn-secondary ${sc.id === activeSceneId ? "active" : ""}`}
                      style={{
                        justifyContent: "flex-start",
                        borderColor: sc.id === activeSceneId ? "var(--accent)" : undefined,
                        background: sc.id === activeSceneId ? "var(--accent-dim)" : undefined,
                      }}
                      onClick={() => {
                        setActiveScene(sc.id);
                        runContinuityCheck(sc.id);
                      }}
                    >
                      <span style={{
                        minWidth: 22, height: 22, borderRadius: 6,
                        background: "var(--accent-dim)", color: "var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700,
                      }}>{i + 1}</span>
                      <span className="truncate" style={{ flex: 1, textAlign: "left" }}>{sc.title}</span>
                      <span className={`status-pill status-${sc.status}`}>{sc.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scene Details Summary */}
            {activeScene && (
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Scene details</div>
                {activeOutfit && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                    👗 {activeOutfit.name}
                  </div>
                )}
                {activeLocation && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                    📍 {activeLocation.name}
                  </div>
                )}
                {activeScene.action && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }} className="truncate">
                    🎬 {activeScene.action}
                  </div>
                )}
              </div>
            )}

            {/* Continuity Warnings */}
            {warnings.length > 0 && (
              <div style={{
                background: "var(--warning-bg)",
                border: "1px solid rgba(255,186,82,0.3)",
                borderRadius: 10, padding: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <AlertTriangle size={14} style={{ color: "var(--warning)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--warning)" }}>
                    {warnings.length} continuity warning{warnings.length > 1 ? "s" : ""}
                  </span>
                </div>
                {warnings.slice(0, 2).map((w) => (
                  <div key={w.id} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                    • {w.message}
                  </div>
                ))}
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  Open Studio → Continuity tab to resolve.
                </p>
              </div>
            )}

            {/* Prompt preview (condensed) */}
            {activeScene && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Prompt preview
                </div>
                {/* Character chip — thumbnail + name above the prompt box */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {portraitAsset ? (
                    <img src={portraitAsset.dataUrl} alt={`${activeCharacter?.name ?? "Character"} reference`}
                      style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}/>
                  ) : (
                    <div title="No character reference image"
                      style={{ width: 36, height: 36, borderRadius: 8, border: "1px dashed var(--border)",
                        background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <User size={14} style={{ color: "var(--text-muted)", opacity: 0.6 }}/>
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{activeCharacter?.name}</span>
                </div>
                <div
                  className="prompt-preview prompt-preview--clickable"
                  style={{ fontSize: 11, maxHeight: 140 }}
                  tabIndex={0}
                  role="button"
                  aria-label="Copy the current prompt"
                  title="Click to copy"
                  onClick={handlePromptBoxClick}
                  onKeyDown={handlePromptBoxKeyDown}
                >
                  {getPrompt()}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky Copy Button */}
      <div className="sidepanel-footer">
        <button
          className="btn btn-primary sticky-copy-btn"
          onClick={copyPrompt}
          disabled={!activeScene}
          aria-live="polite"
          aria-label={copyState === "copied" ? "Prompt copied!" : copyState === "failed" ? "Copy failed" : "Copy prompt"}
          title={copyState === "failed" ? "Copy failed — click the prompt, select the text and press Ctrl+C" : undefined}
          style={copyState === "failed" ? { background: "var(--error)" } : undefined}
        >
          {copyState === "copied" ? <Check size={16} /> : copyState === "failed" ? <AlertTriangle size={16} /> : <Copy size={16} />}
          {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy Prompt"}
        </button>
        <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
          Attach your reference image next to the prompt when generating.
        </p>
      </div>
    </div>
  );
}
