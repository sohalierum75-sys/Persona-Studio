import React, { useState } from "react";
import { Clock } from "lucide-react";
import { useStudio } from "../store";

export default function HistoryPage() {
  const { episodes, scenes, outfits, locations, characters, usageRecords } = useStudio();
  const [filterChar, setFilterChar] = useState<string>("all");

  // Group usage records by episode
  const episodeMap = new Map(episodes.map((e) => [e.id, e]));
  const outfitMap = new Map(outfits.map((o) => [o.id, o]));
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const charMap = new Map(characters.map((c) => [c.id, c]));

  const filtered = usageRecords.filter((r) => {
    if (filterChar === "all") return true;
    const ep = episodeMap.get(r.episodeId);
    return ep?.characterId === filterChar;
  });

  // Group by episode
  const byEpisode: Record<string, typeof filtered> = {};
  for (const r of filtered) {
    if (!byEpisode[r.episodeId]) byEpisode[r.episodeId] = [];
    byEpisode[r.episodeId].push(r);
  }

  const sortedEps = Object.entries(byEpisode).sort(([aId], [bId]) => {
    const a = episodeMap.get(aId);
    const b = episodeMap.get(bId);
    return new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime();
  });

  // Aggregate unique outfits / locations used (from "used" scenes only)
  const usedScenes = scenes.filter((s) => s.status === "used");
  const usedOutfitIds = new Set(usedScenes.map((s) => s.outfitId).filter(Boolean));
  const usedLocationIds = new Set(usedScenes.map((s) => s.locationId).filter(Boolean));

  return (
    <div>
      <div className="section-header">
        <div>
          <h1>History</h1>
          <p style={{ marginTop: 4 }}>A visual timeline of looks and locations by episode.</p>
        </div>
        <select className="select" style={{ width: "auto" }}
          value={filterChar} onChange={(e) => setFilterChar(e.target.value)}>
          <option value="all">All characters</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Summary stats */}
      <div className="grid-3" style={{ marginBottom: 32 }}>
        {[
          { label: "Total episodes", value: episodes.length, icon: "🎬" },
          { label: "Outfits used", value: usedOutfitIds.size, icon: "👗" },
          { label: "Locations used", value: usedLocationIds.size, icon: "📍" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Scene-level History: all "used" scenes */}
      <h2 style={{ marginBottom: 16, fontSize: 16 }}>Used Scenes</h2>
      {usedScenes.length === 0 ? (
        <div className="empty-state" style={{ padding: "32px 0" }}>
          <Clock size={40} style={{ opacity: 0.2 }} />
          <h3>No used scenes yet</h3>
          <p>Mark scenes as &quot;Used&quot; to populate the history and enable repeat checks.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }} className="timeline">
          {episodes.map((ep) => {
            const epScenes = usedScenes.filter((s) => s.episodeId === ep.id);
            if (epScenes.length === 0) return null;
            const character = charMap.get(ep.characterId);
            return (
              <div key={ep.id} className="timeline-ep">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, marginTop: 4 }}>
                  <div className="timeline-dot" />
                  <div className="timeline-line" style={{ flex: 1 }} />
                </div>
                <div style={{ flex: 1, paddingBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{ep.title}</div>
                  {character && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                      {character.name}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {epScenes.map((sc) => {
                      const outfit = outfitMap.get(sc.outfitId ?? "");
                      const location = locationMap.get(sc.locationId ?? "");
                      return (
                        <div key={sc.id} style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          borderRadius: 10, padding: "8px 12px",
                          fontSize: 12,
                        }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{sc.title}</div>
                          {outfit && <div style={{ color: "var(--text-muted)" }}>👗 {outfit.name}</div>}
                          {location && <div style={{ color: "var(--text-muted)" }}>📍 {location.name}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
