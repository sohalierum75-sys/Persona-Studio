import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, User } from "lucide-react";
import { useStudio } from "../store";
import type { Character } from "../types";
import NewCharacterModal from "../components/studio/NewCharacterModal";

export default function CharactersPage() {
  const { characters, referenceAssets, episodes } = useStudio();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);

  function getPortrait(c: Character) {
    const asset = referenceAssets.find((a) => a.id === c.portraitAssetId);
    return asset?.dataUrl ?? null;
  }

  function getLastEpisode(c: Character) {
    const eps = episodes.filter((e) => e.characterId === c.id);
    if (!eps.length) return "No episodes yet";
    return eps[eps.length - 1].title;
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1>Characters</h1>
          <p style={{ marginTop: 4 }}>Your recurring cast — one character, every scene.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={16} /> New Character
        </button>
      </div>

      {characters.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✦</div>
          <h3>No characters yet</h3>
          <p>Create your first character to start building episodes and tracking continuity.</p>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Create First Character
          </button>
        </div>
      ) : (
        <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {characters.map((c) => (
            <div
              key={c.id}
              className="card character-card interactive"
              onClick={() => navigate(`/characters/${c.id}`)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${c.name}`}
              onKeyDown={(e) => e.key === "Enter" && navigate(`/characters/${c.id}`)}
            >
              <div className="character-portrait">
                {getPortrait(c) ? (
                  <img src={getPortrait(c)!} alt={`${c.name} portrait`} />
                ) : (
                  <div className="character-portrait-placeholder">
                    <User size={48} style={{ opacity: 0.3 }} />
                  </div>
                )}
              </div>
              <div className="character-info">
                <div className="character-name">{c.name}</div>
                {c.tagline && (
                  <div className="character-meta" style={{ marginBottom: 6 }}>{c.tagline}</div>
                )}
                <div className="character-meta">
                  Last: {getLastEpisode(c)}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                  <span className="chip">{episodes.filter((e) => e.characterId === c.id).length} episodes</span>
                </div>
              </div>
            </div>
          ))}

          {/* Add card */}
          <div
            className="card"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: 280, cursor: "pointer", border: "2px dashed var(--border)",
              background: "transparent", gap: 12,
            }}
            onClick={() => setShowNew(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setShowNew(true)}
          >
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={24} style={{ color: "var(--accent)" }} />
            </div>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>New Character</span>
          </div>
        </div>
      )}

      {showNew && <NewCharacterModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
