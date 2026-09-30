/**
 * ConflictReview — shown when both clients edited the same record.
 * Lets the user keep their version or accept the server's, per record.
 * Dark charcoal + purple design language.
 */
import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { useSyncState, resolveConflict, type ConflictItem } from "../../lib/sync";

function recordTitle(item: ConflictItem): string {
  const data = item.mine ?? item.theirs.data ?? {};
  const name = (data.name ?? data.title ?? (item.kind === "settings" ? "Settings" : "")) as string;
  return name || `${item.kind} ${item.id.slice(0, 8)}`;
}

function describe(item: ConflictItem, data: Record<string, unknown> | null): string {
  if (!data) return "deleted";
  const parts: string[] = [];
  const title = data.name ?? data.title;
  if (typeof title === "string" && title) parts.push(title);
  if (typeof data.action === "string" && data.action) parts.push(data.action.slice(0, 60));
  if (typeof data.description === "string" && data.description) parts.push(data.description.slice(0, 60));
  return parts.join(" — ") || "no visible changes";
}

export default function ConflictReview() {
  const sync = useSyncState();
  if (sync.conflicts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9998,
      width: "min(360px, calc(100vw - 32px))", maxHeight: "70vh", overflowY: "auto",
      background: "var(--bg-card)",
      border: "1px solid var(--warning, #ffba52)",
      borderRadius: "var(--radius-md)",
      boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
      }}>
        <AlertTriangle size={16} style={{ color: "var(--warning)" }}/>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", flex: 1 }}>
          {sync.conflicts.length} sync conflict{sync.conflicts.length !== 1 ? "s" : ""} — review needed
        </div>
      </div>

      {sync.conflicts.map((c) => (
        <div key={c.key} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
            {c.kind === "character" ? "Character" : c.kind === "scene" ? "Scene" : c.kind === "episode" ? "Episode" : c.kind === "outfit" ? "Outfit" : c.kind === "location" ? "Location" : c.kind} · {recordTitle(c)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
            <strong>This device:</strong> {describe(c, c.mine)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
            <strong>Other device</strong> ({new Date(c.theirs.updatedAt).toLocaleString()}): {describe(c, c.theirs.data)}
          </div>
          <details style={{fontSize:11,marginBottom:8}}><summary>Compare full records</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify({thisDevice:c.mine,server:c.theirs.data},(key,value)=>key === "dataUrl" ? "[image data]":value,2)}</pre></details>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => void resolveConflict(c.key, "mine")}
            >
              <Check size={12}/> Keep mine
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => void resolveConflict(c.key, "theirs")}
            >
              Use other device's
            </button>
          </div>
        </div>
      ))}

      <div style={{ padding: "8px 16px 12px", fontSize: 10, color: "var(--text-muted)" }}>
        Nothing is lost — the version you don't pick is discarded from sync, but your
        local copy stays until you close this device's workspace.
      </div>
    </div>
  );
}
