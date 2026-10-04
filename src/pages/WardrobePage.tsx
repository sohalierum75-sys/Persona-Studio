import { confirmDelete } from "../lib/confirm-delete";
﻿import React, { useState, useRef } from "react";
import { Plus, Shirt, Upload, Trash2, Tag } from "lucide-react";
import { useStudio } from "../store";
import type { ColorFamily, GarmentType } from "../types";
import { X } from "lucide-react";

const COLOR_FAMILIES: ColorFamily[] = [
  "red","orange","yellow","green","teal","blue","purple","pink","brown","black","white","gray","gold","silver",
];
const GARMENT_TYPES: GarmentType[] = [
  "top","bottom","dress","jumpsuit","outerwear","swimwear","activewear","formal","lingerie","accessories","other",
];
const COLOR_HEX: Record<string, string> = {
  red:"#E74C3C", orange:"#E67E22", yellow:"#F1C40F", green:"#27AE60", teal:"#1ABC9C",
  blue:"#2980B9", purple:"#8E44AD", pink:"#E91E8C", brown:"#795548", black:"#212121",
  white:"#F5F5F5", gray:"#9E9E9E", gold:"#FFD700", silver:"#C0C0C0",
};

export default function WardrobePage() {
  const { outfits, characters, referenceAssets, activeCharacterId, addOutfit, deleteOutfit, updateOutfit, addReferenceAsset } = useStudio();
  const [showNew, setShowNew] = useState(false);
  const [filterCharacter, setFilterCharacter] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterColor, setFilterColor] = useState<string>("all");

  const filtered = outfits.filter((o) => {
    if (filterCharacter !== "all" && o.characterId !== filterCharacter) return false;
    if (filterType !== "all" && o.garmentType !== filterType) return false;
    if (filterColor !== "all" && o.colorFamily !== filterColor) return false;
    return true;
  });

  return (
    <div>
      <div className="section-header">
        <div>
          <h1>Wardrobe</h1>
          <p style={{ marginTop: 4 }}>Manage outfits and track what&apos;s been worn.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={16} /> New Outfit
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <select className="select" style={{ width: "auto", height: 34 }}
          value={filterCharacter} onChange={(e) => setFilterCharacter(e.target.value)}>
          <option value="all">All characters</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" style={{ width: "auto", height: 34 }}
          value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          {GARMENT_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="select" style={{ width: "auto", height: 34 }}
          value={filterColor} onChange={(e) => setFilterColor(e.target.value)}>
          <option value="all">All colors</option>
          {COLOR_FAMILIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterCharacter !== "all" || filterType !== "all" || filterColor !== "all") && (
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setFilterCharacter("all"); setFilterType("all"); setFilterColor("all");
          }}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Shirt size={48} style={{ opacity: 0.2 }} />
          <h3>No outfits yet</h3>
          <p>Add outfits to track wardrobe continuity across episodes.</p>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Add First Outfit
          </button>
        </div>
      ) : (
        <div className="grid-auto-sm">
          {filtered.map((o) => {
            const asset = referenceAssets.find((a) => a.id === o.referenceAssetId);
            const character = characters.find((c) => c.id === o.characterId);
            return (
              <div key={o.id} className="card wardrobe-card">
                <div className="wardrobe-image">
                  {asset ? (
                    <img src={asset.dataUrl} alt={o.name} />
                  ) : (
                    <div style={{
                      width: "100%", height: "100%", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      background: `linear-gradient(135deg, ${COLOR_HEX[o.colorFamily] ?? "#333"}22, ${COLOR_HEX[o.colorFamily] ?? "#333"}44)`,
                      flexDirection: "column", gap: 8,
                    }}>
                      <Shirt size={32} style={{ opacity: 0.4 }} />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.garmentType}</span>
                    </div>
                  )}
                  <div
                    className="wardrobe-color-swatch"
                    style={{ background: COLOR_HEX[o.colorFamily] ?? "#666" }}
                    title={o.colorFamily}
                  />
                </div>
                <div className="wardrobe-info">
                  <div className="wardrobe-name">{o.name}</div>
                  {character && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{character.name}</div>
                  )}
                  <div className="wardrobe-tags">
                    <span className="chip">{o.garmentType}</span>
                    <span className="chip" style={{ color: "var(--text-primary)" }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR_HEX[o.colorFamily], border: "1px solid var(--border)" }} />
                      {o.colorFamily}
                    </span>
                  </div>
                  {o.description && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }} className="truncate">
                      {o.description}
                    </p>
                  )}
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <button className="btn btn-danger btn-xs" aria-label={`Delete ${o.name}`} onClick={async () => {
                      if (await confirmDelete(o.name)) deleteOutfit(o.id);
                    }}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewOutfitModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewOutfitModal({ onClose }: { onClose: () => void }) {
  const { addOutfit, characters, addReferenceAsset } = useStudio();
  const [name, setName] = useState("");
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("dress");
  const [primaryColor, setPrimaryColor] = useState("");
  const [colorFamily, setColorFamily] = useState<ColorFamily>("blue");
  const [accessories, setAccessories] = useState("");
  const [notes, setNotes] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!name.trim() || !characterId) return;
    let referenceAssetId: string | undefined;
    if (imageDataUrl) {
      const asset = await addReferenceAsset({ label: name, dataUrl: imageDataUrl });
      referenceAssetId = asset.id;
    }
    await addOutfit({
      characterId, name: name.trim(), description, garmentType,
      primaryColor, colorFamily, accessories, notes, referenceAssetId,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-outfit-title">
        <div className="modal-header">
          <h2 id="new-outfit-title">New Outfit</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="input-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="out-name">Outfit name *</label>
              <input id="out-name" className="input" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="e.g. Red Wrap Dress" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="out-char">Character *</label>
              <select id="out-char" className="select" value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="out-desc">Description</label>
            <textarea id="out-desc" className="textarea" value={description}
              onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Describe fabric, fit, style…" />
          </div>
          <div className="input-row">
            <div className="form-group">
              <label className="form-label" htmlFor="out-type">Type</label>
              <select id="out-type" className="select" value={garmentType}
                onChange={(e) => setGarmentType(e.target.value as GarmentType)}>
                {GARMENT_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="out-color">Primary color</label>
              <input id="out-color" className="input" value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)} placeholder="e.g. burgundy red" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="out-family">Color family</label>
              <select id="out-family" className="select" value={colorFamily}
                onChange={(e) => setColorFamily(e.target.value as ColorFamily)}>
                {COLOR_FAMILIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="out-acc">Accessories</label>
            <input id="out-acc" className="input" value={accessories}
              onChange={(e) => setAccessories(e.target.value)} placeholder="e.g. gold hoops, strappy heels" />
          </div>
          <div className="form-group">
            <label className="form-label">Reference image (optional)</label>
            {imageDataUrl ? (
              <div style={{ position: "relative", width: 80, height: 80 }}>
                <img src={imageDataUrl} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} alt="outfit" />
                <button className="btn btn-xs" style={{
                  position: "absolute", top: 2, right: 2,
                  background: "rgba(0,0,0,0.7)", color: "white", padding: "2px 4px",
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
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || !characterId}>
            Save Outfit
          </button>
        </div>
      </div>
    </div>
  );
}
