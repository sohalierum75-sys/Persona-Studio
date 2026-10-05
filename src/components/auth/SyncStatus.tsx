/**
 * SyncStatus — compact indicator shown in both Studio header and extension.
 * Deliberately invisible while idle: it appears when a change is being saved
 * ("Saving…"), flashes "Saved" once the server confirms, and stays up for the
 * attention states (offline with pending changes, failed sync, conflict,
 * expired session) until resolved.
 */
import React from "react";
import { CloudOff, AlertTriangle, RefreshCw, CheckCircle2, LogIn } from "lucide-react";
import { useSyncDisplay, reconcile } from "../../lib/sync";
import { API_CONFIGURED } from "../../lib/config";

export default function SyncStatus() {
  const { shown, sync } = useSyncDisplay();

  if (!API_CONFIGURED || !shown) return null;

  function label(): string {
    switch (shown) {
      case "saving":         return "Saving…";
      case "saved":          return "Saved";
      case "offline":        return sync.pendingCount > 0 ? `Offline — ${sync.pendingCount} pending` : "Offline";
      case "error":          return sync.error?.startsWith("Free plan") ? "Free limit reached — open account menu" : "Sync failed";
      case "conflict":       return "Conflict — review needed";
      case "session-expired": return "Sign in again";
      default:               return "";
    }
  }

  function icon() {
    switch (shown) {
      case "saving":         return <RefreshCw size={12} style={{ animation:"spin 1s linear infinite" }}/>;
      case "saved":          return <CheckCircle2 size={12} style={{ color:"var(--success)" }}/>;
      case "offline":        return <CloudOff size={12} style={{ color:"var(--text-muted)" }}/>;
      case "error":
      case "conflict":       return <AlertTriangle size={12} style={{ color:"var(--warning)" }}/>;
      case "session-expired": return <LogIn size={12} style={{ color:"var(--accent)" }}/>;
      default:               return null;
    }
  }

  const isClickable = shown === "offline" || shown === "error" || shown === "conflict";

  return (
    <button
      className="sync-status-btn"
      aria-label={`${label()}${isClickable ? '. Retry sync' : ''}`}
      onClick={isClickable ? () => void reconcile({force:true}) : undefined}
      style={{ cursor: isClickable ? "pointer" : "default" }}
      title={sync.error ?? (sync.lastSynced ? `Last synced: ${new Date(sync.lastSynced).toLocaleTimeString()}` : undefined)}
    >
      {icon()}
      <span className="sync-status-label">{label()}</span>
      {isClickable && <span style={{ fontSize:10, opacity:0.7, marginLeft:2 }}>Retry</span>}
    </button>
  );
}
