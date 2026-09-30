import React, { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Lock, Unlock, Trash2, Film,
  Upload, Star, User,
} from "lucide-react";
import { useStudio } from "../store";
import type { IdentityField } from "../types";
import NewEpisodeModal from "../components/studio/NewEpisodeModal";

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    characters, episodes, referenceAssets,
    updateCharacter, deleteCharacter,
    addReferenceAsset, deleteReferenceAsset,
    activeEpisodeId,
  } = useStudio();

  const character = characters.find((c) => c.id === id);
  const characterEpisodes = episodes.filter((e) => e.characterId === id);
  const charAssets = referenceAssets.filter((a) =>
    character?.referenceAssetIds.includes(a.id)
  );

  const [showNewEpisode, setShowNewEpisode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!character) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">✦</div>
        <h3>Character not found</h3>
        <button className="btn btn-secondary" onClick={() => navigate("/characters")}>
          <ArrowLeft size={16} /> Back to Characters
        </button>
      </div>
    );
  }

  function handleFieldChange(key: string, value: string) {
    const fields = character!.identityFields.map((f) =>
      f.key === key ? { ...f, value } : f
    );
    updateCharacter(character!.id, { identityFields: fields });
  }

  function toggleLock(key: string) {
    const fields = character!.identityFields.map((f) =>
      f.key === key ? { ...f, locked: !f.locked } : f
    );
    updateCharacter(character!.id, { identityFields: fields });
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const asset = await addReferenceAsset({
        label: file.name.replace(/\.[^/.]+$/, ""),
        dataUrl,
      });
      const newIds = [...character!.referenceAssetIds, asset.id];
      const portraitId = character!.portraitAssetId ?? asset.id;
      updateCharacter(character!.id, {
        referenceAssetIds: newIds,
        portraitAssetId: portraitId,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function setPortrait(assetId: string) {
    updateCharacter(character!.id, { portraitAssetId: assetId });
  }

  function removeAsset(assetId: string) {
    const newIds = character!.referenceAssetIds.filter((i) => i !== assetId);
    const newPortrait = character!.portraitAssetId === assetId
      ? newIds[0] ?? undefined
      : character!.portraitAssetId;
    updateCharacter(character!.id, { referenceAssetIds: newIds, portraitAssetId: newPortrait });
    deleteReferenceAsset(assetId);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${character!.name}"? This cannot be undone.`)) return;
    await deleteCharacter(character!.id);
    navigate("/characters");
  }

  const portrait = charAssets.find((a) => a.id === character.portraitAssetId);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <button className="btn btn-ghost" onClick={() => navigate("/characters")}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <input
            className="input"
            style={{ fontSize: 22, fontWeight: 700, height: 44, border: "none", background: "transparent", padding: "0 4px" }}
            value={character.name}
            onChange={(e) => updateCharacter(character.id, { name: e.target.value })}
            aria-label="Character name"
          />
          <input
            className="input"
            style={{ fontSize: 13, height: 34, border: "none", background: "transparent", padding: "0 4px", color: "var(--text-muted)" }}
            value={character.tagline ?? ""}
            onChange={(e) => updateCharacter(character.id, { tagline: e.target.value })}
            placeholder="Add a tagline…"
            aria-label="Character tagline"
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewEpisode(true)}>
          <Film size={16} /> New Episode
        </button>
        <button className="btn btn-ghost" onClick={handleDelete} title="Delete character">
          <Trash2 size={16} style={{ color: "var(--error)" }} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 32 }}>
        {/* Left — Reference Images */}
        <div>
          {/* Main portrait */}
          <div style={{
            aspectRatio: "3/4", borderRadius: 16, overflow: "hidden",
            background: "var(--bg-card)", marginBottom: 16, position: "relative",
            border: "1px solid var(--border)",
          }}>
            {portrait ? (
              <img src={portrait.dataUrl} alt="Main portrait" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{
                width: "100%", height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 12, color: "var(--text-muted)",
              }}>
                <User size={64} style={{ opacity: 0.2 }} />
                <span style={{ fontSize: 13 }}>No portrait yet</span>
              </div>
            )}
          </div>

          {/* Reference grid */}
          <div className="reference-grid">
            {charAssets.map((a) => (
              <div
                key={a.id}
                className={`reference-thumb ${a.id === character.portraitAssetId ? "primary" : ""}`}
                style={{ position: "relative" }}
              >
                <img src={a.dataUrl} alt={a.label} />
                <div className="reference-thumb-label">{a.label}</div>
                <div style={{
                  position: "absolute", top: 4, right: 4,
                  display: "flex", gap: 4,
                }}>
                  <button
                    className="btn btn-xs"
                    style={{
                      background: "rgba(0,0,0,0.6)",
                      color: a.id === character.portraitAssetId ? "#FFD700" : "white",
                    }}
                    onClick={() => setPortrait(a.id)}
                    title="Set as portrait"
                  >
                    <Star size={10} />
                  </button>
                  <button
                    className="btn btn-xs"
                    style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
                    onClick={() => removeAsset(a.id)}
                    title="Remove"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
            <div
              className="reference-thumb-add"
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            >
              <Upload size={20} />
              <span>Upload</span>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleImageUpload}
            aria-label="Upload reference image"
          />
          <p className="text-xs text-muted" style={{ marginTop: 8 }}>
            💡 Always attach the reference image next to your prompt when generating.
          </p>
        </div>

        {/* Right — Identity Fields + Episodes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* Identity locks */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2>Identity</h2>
              <span className="chip">
                {character.identityFields.filter((f) => f.locked).length} locked
              </span>
            </div>
            <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Locked fields appear in every prompt and are protected from silent changes.
            </p>
            {character.identityFields.map((field) => (
              <div key={field.key} className="identity-row">
                <div className="identity-row-label">{field.label}</div>
                <input
                  className="input"
                  value={field.value}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={`Describe ${field.label.toLowerCase()}…`}
                  aria-label={field.label}
                />
                <button
                  className={`lock-btn ${field.locked ? "locked" : ""}`}
                  onClick={() => toggleLock(field.key)}
                  title={field.locked ? "Unlock field" : "Lock field"}
                  aria-label={field.locked ? `Unlock ${field.label}` : `Lock ${field.label}`}
                >
                  {field.locked ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
              </div>
            ))}
          </div>

          {/* Episodes */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2>Episodes</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowNewEpisode(true)}>
                <Plus size={14} /> New Episode
              </button>
            </div>
            {characterEpisodes.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 16px" }}>
                <Film size={32} style={{ opacity: 0.3 }} />
                <p>No episodes yet. Start your first scene.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {characterEpisodes.map((ep, i) => (
                  <div
                    key={ep.id}
                    className="card interactive"
                    style={{ padding: 16, cursor: "pointer" }}
                    onClick={() => navigate(`/episodes/${ep.id}`)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: "var(--accent-dim)", color: "var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: 12,
                      }}>
                        E{String(i + 1).padStart(2, "0")}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{ep.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {ep.sceneIds.length} scenes
                        </div>
                      </div>
                      <span className={`status-pill status-${ep.status}`}>{ep.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewEpisode && (
        <NewEpisodeModal characterId={character.id} onClose={() => setShowNewEpisode(false)} />
      )}
    </div>
  );
}
