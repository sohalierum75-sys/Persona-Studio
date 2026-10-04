import { PlanLimitError } from "../../lib/plan-guard";
import React, { useState } from "react";
import { X } from "lucide-react";
import { useStudio } from "../../store";
import { useNavigate } from "react-router-dom";

const DEFAULT_IDENTITY_FIELDS = [
  { key: "face", label: "Face shape & features", value: "", locked: false },
  { key: "skin", label: "Skin tone", value: "", locked: false },
  { key: "hair", label: "Hair style & color", value: "", locked: false },
  { key: "eyes", label: "Eye color & shape", value: "", locked: false },
  { key: "body", label: "Body proportions", value: "", locked: false },
  { key: "voice", label: "Voice / style notes", value: "", locked: false },
];

interface Props { onClose: () => void; }

export default function NewCharacterModal({ onClose }: Props) {
  const { addCharacter } = useStudio();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
    const c = await addCharacter({
      name: name.trim(),
      tagline: tagline.trim(),
      referenceAssetIds: [],
      identityFields: DEFAULT_IDENTITY_FIELDS,
    });
    setSaving(false);
    onClose();
    navigate(`/characters/${c.id}`);
    } catch (error) { if (!(error instanceof PlanLimitError)) window.alert(error instanceof Error ? error.message : "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-char-title">
        <div className="modal-header">
          <h2 id="new-char-title">New Character</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="char-name">Character name *</label>
            <input
              id="char-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Luna Kai"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="char-tagline">Tagline / description</label>
            <input
              id="char-tagline"
              className="input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Minimalist fashion creator, 5&apos;7&quot;"
            />
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            You can add reference images and set identity fields after creating the character.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim() || saving}
          >
            {saving ? "Creating…" : "Create Character"}
          </button>
        </div>
      </div>
    </div>
  );
}
