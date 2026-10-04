import { confirmDelete } from "../../lib/confirm-delete";
import React, { useRef, useState } from "react";
import { Plus, X, ImagePlus } from "lucide-react";
import { useStudio } from "../../store";
import type { Scene, SceneImage } from "../../types";

interface Props {
  scene: Scene;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SceneReferencesPanel({ scene }: Props) {
  const { referenceAssets, addSceneImages, removeSceneImage, updateSceneImageCaption } = useStudio();

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<SceneImage | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const images = (scene.referenceImages ?? []).map((img) => ({
    entry: img,
    asset: referenceAssets.find((a) => a.id === img.assetId),
  }));

  async function ingestFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    const read = await Promise.all(list.map(async (f) => ({
      dataUrl: await readFileAsDataUrl(f),
      name: f.name,
    })));
    await addSceneImages(scene.id, read);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void ingestFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) void ingestFiles(e.dataTransfer.files);
  }

  async function handleRemove(img: SceneImage) {
    const asset = referenceAssets.find(a => a.id === img.assetId);
    if (!await confirmDelete(img.caption || asset?.label || "Scene reference image")) return;
    await removeSceneImage(scene.id, img.id);
  }

  function openLightbox(img: SceneImage) {
    const asset = referenceAssets.find((a) => a.id === img.assetId);
    if (!asset) return;
    setLightbox(img);
    setLightboxUrl(asset.dataUrl);
  }

  return (
    <div className={`scene-ref-drop${dragOver ? " drag-over" : ""}`}>
      {/* Section label */}
      <div className="inspector-label" style={{ marginBottom: 8 }}>
        Reference Images
        <span className="chip" style={{ marginLeft: 8 }}>{images.length}</span>
      </div>

      {/* Horizontal scrollable strip */}
      {images.length === 0 && !dragOver ? (
        <div
          className="scene-ref-empty"
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        >
          <ImagePlus size={18} />
          <span>Add reference images for this scene — click, or drag &amp; drop here</span>
        </div>
      ) : (
        <div
          className="scene-ref-strip"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {images.map(({ entry, asset }) => (
            <div key={entry.id} className="scene-ref-tile">
              <button
                type="button"
                className="scene-ref-thumb"
                onClick={() => openLightbox(entry)}
                title={entry.caption || "Click to preview"}
                aria-label={entry.caption ? `Preview ${entry.caption}` : "Preview image"}
              >
                {asset
                  ? <img src={asset.dataUrl} alt={entry.caption ?? "Scene reference"} draggable={false} />
                  : <span className="scene-ref-missing">missing</span>}
              </button>
              <button
                type="button"
                className="scene-ref-remove"
                onClick={() => handleRemove(entry)}
                title="Remove this image (permanent)"
                aria-label="Remove image"
              >
                <X size={12} />
              </button>
              <input
                className="scene-ref-caption"
                defaultValue={entry.caption ?? ""}
                placeholder="Caption…"
                maxLength={80}
                onBlur={(e) => {
                  if ((entry.caption ?? "") !== e.target.value) {
                    updateSceneImageCaption(scene.id, entry.id, e.target.value);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                aria-label="Image caption"
              />
            </div>
          ))}

          {/* Add tile */}
          <button
            type="button"
            className="scene-ref-add"
            onClick={() => fileRef.current?.click()}
            aria-label="Add reference images"
          >
            <Plus size={20} />
            <span>Add Image</span>
          </button>
        </div>
      )}

      {/* Hidden multi-select file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInput}
        aria-label="Add scene reference images"
      />

      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
        Scene-specific — separate from the character&apos;s reference gallery. Changes save instantly.
      </p>

      {/* Lightbox */}
      {lightbox && lightboxUrl && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) { setLightbox(null); setLightboxUrl(null); } }}
        >
          <div style={{ maxWidth: "min(88vw, 900px)", display: "flex", flexDirection: "column", gap: 12 }} role="dialog" aria-modal="true" aria-label="Image preview">
            <img
              src={lightboxUrl}
              alt={lightbox.caption ?? "Scene reference"}
              style={{ maxWidth: "88vw", maxHeight: "76vh", objectFit: "contain", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-secondary)", fontSize: 13 }}>
              <span>{lightbox.caption || "Untitled reference"}</span>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}
                onClick={() => { setLightbox(null); setLightboxUrl(null); }}>
                <X size={14} /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
