import { confirmDelete } from "../lib/confirm-delete";
﻿import React, { useState, useRef } from "react";
import { Plus, MapPin, Trash2, Upload, X } from "lucide-react";
import { useStudio } from "../store";
import type { LocationCategory } from "../types";

const CATEGORIES: LocationCategory[] = [
  "beach","urban","nature","indoor-home","indoor-public","studio","fantasy","vehicle","rooftop","other",
];
const CAT_ICONS: Record<string, string> = {
  beach:"🏖️", urban:"🏙️", nature:"🌿", "indoor-home":"🏠", "indoor-public":"🏛️",
  studio:"🎬", fantasy:"✨", vehicle:"🚗", rooftop:"🌆", other:"📍",
};

export default function LocationsPage() {
  const { locations, referenceAssets, addLocation, deleteLocation, addReferenceAsset } = useStudio();
  const [showNew, setShowNew] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");

  const filtered = filterCat === "all"
    ? locations
    : locations.filter((l) => l.category === filterCat);

  return (
    <div>
      <div className="section-header">
        <div>
          <h1>Locations</h1>
          <p style={{ marginTop: 4 }}>Build a library of settings, backgrounds, and environments.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={16} /> New Location
        </button>
      </div>

      {/* Category filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button className={`chip ${filterCat === "all" ? "active" : ""}`}
          onClick={() => setFilterCat("all")}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${filterCat === c ? "active" : ""}`}
            onClick={() => setFilterCat(c)} style={{ cursor: "pointer", border: "none" }}>
            {CAT_ICONS[c]} {c.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <MapPin size={48} style={{ opacity: 0.2 }} />
          <h3>No locations yet</h3>
          <p>Create a location library to reuse settings and catch repeat usage.</p>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Add First Location
          </button>
        </div>
      ) : (
        <div className="grid-auto">
          {filtered.map((l) => {
            const asset = referenceAssets.find((a) => a.id === l.referenceAssetId);
            return (
              <div key={l.id} className="card" style={{ overflow: "hidden" }}>
                <div style={{ aspectRatio: "16/9", background: "var(--bg-elevated)", position: "relative" }}>
                  {asset ? (
                    <img loading="lazy" decoding="async" src={asset.dataUrl} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: "100%", height: "100%",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 8, fontSize: 32,
                    }}>
                      {CAT_ICONS[l.category] ?? "📍"}
                    </div>
                  )}
                  <div style={{
                    position: "absolute", top: 8, left: 8,
                    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
                    borderRadius: 20, padding: "2px 10px",
                    fontSize: 11, color: "rgba(255,255,255,0.8)",
                  }}>
                    {CAT_ICONS[l.category]} {l.category.replace(/-/g, " ")}
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{l.name}</div>
                  {l.lighting && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                      💡 {l.lighting}
                    </div>
                  )}
                  {l.setting && (
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }} className="truncate">
                      {l.setting}
                    </p>
                  )}
                  <button className="btn btn-danger btn-xs" aria-label={`Delete ${l.name}`} onClick={async () => {
                    if (await confirmDelete(l.name)) deleteLocation(l.id);
                  }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewLocationModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewLocationModal({ onClose }: { onClose: () => void }) {
  const { addLocation, addReferenceAsset } = useStudio();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<LocationCategory>("urban");
  const [setting, setSetting] = useState("");
  const [lighting, setLighting] = useState("");
  const [mood, setMood] = useState("");
  const [notes, setNotes] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!name.trim()) return;
    let referenceAssetId: string | undefined;
    if (imageDataUrl) {
      const asset = await addReferenceAsset({ label: name, dataUrl: imageDataUrl });
      referenceAssetId = asset.id;
    }
    await addLocation({ name: name.trim(), category, setting, lighting, mood, notes, referenceAssetId });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-loc-title">
        <div className="modal-header">
          <h2 id="new-loc-title">New Location</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="input-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="loc-name">Location name *</label>
              <input id="loc-name" className="input" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="e.g. Rooftop Garden at Dusk" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-cat">Category</label>
              <select id="loc-cat" className="select" value={category}
                onChange={(e) => setCategory(e.target.value as LocationCategory)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICONS[c]} {c.replace(/-/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="loc-setting">Setting description</label>
            <textarea id="loc-setting" className="textarea" value={setting}
              onChange={(e) => setSetting(e.target.value)} rows={2}
              placeholder="Describe the environment, atmosphere, details…" />
          </div>
          <div className="input-row">
            <div className="form-group">
              <label className="form-label" htmlFor="loc-light">Lighting</label>
              <input id="loc-light" className="input" value={lighting}
                onChange={(e) => setLighting(e.target.value)} placeholder="e.g. golden hour, harsh midday sun" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-mood">Mood</label>
              <input id="loc-mood" className="input" value={mood}
                onChange={(e) => setMood(e.target.value)} placeholder="e.g. romantic, gritty, serene" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reference image (optional)</label>
            {imageDataUrl ? (
              <div style={{ position: "relative", width: 120, height: 80 }}>
                <img loading="lazy" decoding="async" src={imageDataUrl} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }} alt="location" />
                <button className="btn btn-xs" style={{
                  position: "absolute", top: 2, right: 2,
                  background: "rgba(0,0,0,0.7)", color: "white",
                }} onClick={() => setImageDataUrl(null)}>
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Upload Image
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = (ev) => setImageDataUrl(ev.target?.result as string);
                r.readAsDataURL(f);
              }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Save Location
          </button>
        </div>
      </div>
    </div>
  );
}
