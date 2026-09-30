import React, { useState } from "react";
import { X } from "lucide-react";
import { useStudio } from "../../store";
import { useNavigate } from "react-router-dom";

interface Props { characterId: string; onClose: () => void; }

export default function NewEpisodeModal({ characterId, onClose }: Props) {
  const { addEpisode, episodes } = useStudio();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const epCount = episodes.filter((e) => e.characterId === characterId).length;

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    const ep = await addEpisode({
      characterId,
      title: title.trim(),
      description: description.trim(),
      order: epCount,
      status: "draft",
      sceneIds: [],
      continuityGroupIds: [],
    });
    setSaving(false);
    onClose();
    navigate(`/episodes/${ep.id}`);
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-ep-title">
        <div className="modal-header">
          <h2 id="new-ep-title">New Episode</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="ep-title">Episode title *</label>
            <input
              id="ep-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. Episode ${String(epCount + 1).padStart(2, "0")} — Day in the Life`}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ep-desc">Description</label>
            <textarea
              id="ep-desc"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happens in this episode?"
              rows={3}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!title.trim() || saving}>
            {saving ? "Creating…" : "Create Episode"}
          </button>
        </div>
      </div>
    </div>
  );
}
